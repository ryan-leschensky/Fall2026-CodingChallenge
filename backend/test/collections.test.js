const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const app = require('../index');
const { pool } = require('../db/db');
const Tokens = require('../lib/tokens');
const { encodeShareId } = require('../lib/share-ids');

afterAll(() => pool.end());

// Creates the tables these tests use, in the same order as seed/seeder.js
const createSchema = async () => {
  for (const file of [
    'users.sql',
    'refresh-tokens.sql',
    'collections.sql',
    'collection-images.sql',
  ]) {
    await pool.query(fs.readFileSync(path.join(__dirname, '../seed', file), 'utf8'));
  }
};

describe('Collections without logging in', () => {
  test.each([
    ['get', '/api/collections'],
    ['post', '/api/collections'],
    ['get', '/api/collections/1'],
    ['patch', '/api/collections/1'],
    ['delete', '/api/collections/1'],
    ['put', '/api/collections/1/share-link'],
    ['get', '/api/collections/1/members'],
    ['post', '/api/collections/1/images'],
    ['delete', '/api/collections/1/images/1'],
    ['post', '/api/shared/AAAAAAAAAAAAAAAAAAAAAA/join'],
  ])('%s %s returns 401', async (method, url) => {
    const response = await request(app)[method](url);

    expect(response.statusCode).toBe(401);
  });

  test('A malformed share link returns 404 without touching the database', async () => {
    const response = await request(app).get('/api/shared/not-a-share-id');

    expect(response.statusCode).toBe(404);
  });
});

// These hit the PostgreSQL database in DATABASE_URL and are skipped when it is not set
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('Collections', () => {
  // Unique per run so reruns and leftover rows cannot collide
  const suffix = Date.now().toString(36);
  const names = ['owner', 'editor', 'viewer', 'stranger'];
  const users = {};
  const auth = name => ({ Authorization: `Bearer ${users[name].token}` });

  const api = (name, method, url) => {
    const req = request(app)[method](url);
    return name ? req.set(auth(name)) : req;
  };

  const createCollection = async (name = 'Trip ideas') => {
    const response = await api('owner', 'post', '/api/collections').send({ name });
    expect(response.statusCode).toBe(201);
    return response.body;
  };

  const share = (collectionId, username, permission, as = 'owner') =>
    api(as, 'put', `/api/collections/${collectionId}/members/${username}`).send({ permission });

  const image = (n = 1) => ({
    imageUrl: `https://cdn.pixabay.example/photo-${n}.jpg`,
    thumbnailUrl: `https://cdn.pixabay.example/photo-${n}_150.jpg`,
    pageUrl: `https://pixabay.example/photos/${n}/`,
    source: 'pixabay',
    sourceId: 1000 + n,
    width: 1920,
    height: 1080,
    title: `Photo ${n}`,
    tags: ['nature', ' lake ', 'nature', ''],
  });

  beforeAll(async () => {
    await createSchema();
    for (const name of names) {
      const username = `${name}_${suffix}`;
      const response = await request(app)
        .post('/api/users')
        .send({ username, password: 'correct horse battery' })
        .expect(201);
      users[name] = { ...response.body, token: Tokens.signAccessToken(response.body) };
    }
  });

  afterAll(async () => {
    // Cascades to their collections, memberships and refresh tokens
    await pool.query('DELETE FROM users WHERE id = ANY($1)', [names.map(n => users[n]?.id)]);
  });

  describe('Creating and reading', () => {
    test('Should create a collection owned by the user', async () => {
      const response = await api('owner', 'post', '/api/collections').send({
        name: '  Kitchen ideas ',
        description: 'Warm wood and tile',
      });

      expect(response.statusCode).toBe(201);
      expect(response.headers.location).toBe(`/api/collections/${response.body.id}`);
      expect(response.body).toEqual({
        id: expect.any(Number),
        name: 'Kitchen ideas',
        description: 'Warm wood and tile',
        owner: { id: users.owner.id, username: users.owner.username },
        permission: 'own',
        linkAccess: null,
        shareId: encodeShareId(response.body.id, 1),
        imageCount: 0,
        coverUrl: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    test.each([{}, { name: '' }, { name: '   ' }, { name: 'x'.repeat(101) }, { name: 5 }])(
      'Should reject %j',
      async body => {
        const response = await api('owner', 'post', '/api/collections').send(body);

        expect(response.statusCode).toBe(400);
      },
    );

    test('Should hide a collection from users it is not shared with', async () => {
      const { id } = await createCollection();

      const list = await api('stranger', 'get', '/api/collections');
      const direct = await api('stranger', 'get', `/api/collections/${id}`);
      const missing = await api('stranger', 'get', '/api/collections/2147483647');

      expect(list.body.map(c => c.id)).not.toContain(id);
      expect(direct.statusCode).toBe(404);
      expect(direct.body).toEqual(missing.body);
    });

    test.each(['abc', '0', '-1', '1.5', '99999999999'])('Should 404 for id %s', async id => {
      const response = await api('owner', 'get', `/api/collections/${id}`);

      expect(response.statusCode).toBe(404);
    });
  });

  describe('Permissions', () => {
    let collection;

    beforeAll(async () => {
      collection = await createCollection('Shared board');
      expect((await share(collection.id, users.editor.username, 'edit')).statusCode).toBe(201);
      // Usernames are case-insensitive
      expect(
        (await share(collection.id, users.viewer.username.toUpperCase(), 'view')).statusCode,
      ).toBe(201);
    });

    const url = rest => `/api/collections/${collection.id}${rest}`;

    test('Should list the collection for each member with their permission', async () => {
      for (const [name, permission] of [
        ['owner', 'own'],
        ['editor', 'edit'],
        ['viewer', 'view'],
      ]) {
        const response = await api(name, 'get', '/api/collections');
        const found = response.body.find(c => c.id === collection.id);

        expect(found.permission).toBe(permission);
      }
    });

    test('Should list the owner first, then editors, then viewers', async () => {
      const response = await api('viewer', 'get', url('/members'));

      expect(response.statusCode).toBe(200);
      expect(response.body.map(m => [m.username, m.permission])).toEqual([
        [users.owner.username, 'own'],
        [users.editor.username, 'edit'],
        [users.viewer.username, 'view'],
      ]);
    });

    test('Should only send the share id to the owner while link sharing is off', async () => {
      const asOwner = await api('owner', 'get', url(''));
      const asEditor = await api('editor', 'get', url(''));

      expect(asOwner.body.shareId).toEqual(expect.any(String));
      expect(asEditor.body.shareId).toBeNull();
    });

    test('A viewer can read but not change anything', async () => {
      expect((await api('viewer', 'get', url(''))).statusCode).toBe(200);
      expect((await api('viewer', 'get', url('/images'))).statusCode).toBe(200);

      const attempts = [
        api('viewer', 'patch', url('')).send({ name: 'Mine now' }),
        api('viewer', 'post', url('/images')).send(image(1)),
        api('viewer', 'delete', url('')),
        api('viewer', 'put', url('/share-link')).send({ access: 'view' }),
        share(collection.id, users.stranger.username, 'view', 'viewer'),
      ];
      for (const response of await Promise.all(attempts)) {
        expect(response.statusCode).toBe(403);
      }
    });

    test('An editor can change content but not sharing or ownership', async () => {
      const renamed = await api('editor', 'patch', url('')).send({ description: 'Edited' });
      expect(renamed.statusCode).toBe(200);
      expect(renamed.body.description).toBe('Edited');

      const attempts = [
        api('editor', 'delete', url('')),
        api('editor', 'put', url('/share-link')).send({ access: 'edit' }),
        api('editor', 'post', url('/share-link/reset')),
        share(collection.id, users.stranger.username, 'view', 'editor'),
        share(collection.id, users.editor.username, 'own', 'editor'),
        api('editor', 'delete', url(`/members/${users.viewer.username}`)),
      ];
      for (const response of await Promise.all(attempts)) {
        expect(response.statusCode).toBe(403);
      }
    });

    test('Should change a member permission with a 200', async () => {
      const promoted = await share(collection.id, users.viewer.username, 'edit');
      expect(promoted.statusCode).toBe(200);
      expect(promoted.body.permission).toBe('edit');

      const demoted = await share(collection.id, users.viewer.username, 'view');
      expect(demoted.body.permission).toBe('view');
    });

    test.each([undefined, 'admin', 'OWN'])('Should reject permission %p', async permission => {
      const response = await share(collection.id, users.stranger.username, permission);

      expect(response.statusCode).toBe(400);
    });

    test('Should 404 when sharing with a user that does not exist', async () => {
      const response = await share(collection.id, `nobody_${suffix}`, 'view');

      expect(response.statusCode).toBe(404);
    });

    test('Should not let the owner change their own access or leave', async () => {
      const changed = await share(collection.id, users.owner.username, 'view');
      const left = await api('owner', 'delete', url(`/members/${users.owner.username}`));

      expect(changed.statusCode).toBe(409);
      expect(left.statusCode).toBe(409);
    });

    test('Should not make a non-member the owner', async () => {
      const response = await share(collection.id, users.stranger.username, 'own');

      expect(response.statusCode).toBe(409);
    });
  });

  describe('Images', () => {
    let collection;
    const url = rest => `/api/collections/${collection.id}/images${rest}`;

    beforeAll(async () => {
      collection = await createCollection('Lakes');
      await share(collection.id, users.editor.username, 'edit');
    });

    test('Should save an image and normalise its fields', async () => {
      const response = await api('editor', 'post', url('')).send(image(1));

      expect(response.statusCode).toBe(201);
      expect(response.headers.location).toBe(url(`/${response.body.id}`));
      expect(response.body).toEqual({
        id: expect.any(Number),
        collectionId: collection.id,
        addedBy: users.editor.id,
        source: 'pixabay',
        sourceId: '1001',
        imageUrl: 'https://cdn.pixabay.example/photo-1.jpg',
        thumbnailUrl: 'https://cdn.pixabay.example/photo-1_150.jpg',
        pageUrl: 'https://pixabay.example/photos/1/',
        width: 1920,
        height: 1080,
        title: 'Photo 1',
        note: '',
        tags: ['nature', 'lake'],
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    test('Should save with only an image URL', async () => {
      const response = await api('owner', 'post', url('')).send({
        imageUrl: 'https://images.example/only-url.png',
      });

      expect(response.statusCode).toBe(201);
      expect(response.body).toMatchObject({ source: 'url', sourceId: null, title: '', tags: [] });
    });

    test('Should refuse the same image twice in one collection', async () => {
      const response = await api('owner', 'post', url('')).send(image(1));

      expect(response.statusCode).toBe(409);
    });

    test('Should allow the same image in a different collection', async () => {
      const other = await createCollection('Other');
      const response = await api('owner', 'post', `/api/collections/${other.id}/images`).send(
        image(1),
      );

      expect(response.statusCode).toBe(201);
    });

    test.each([
      {},
      { imageUrl: 'not a url' },
      { imageUrl: 'javascript:alert(1)' },
      { imageUrl: 'data:image/png;base64,AAAA' },
      { imageUrl: 'ftp://files.example/a.jpg' },
      { imageUrl: 'https://user:pass@images.example/a.jpg' },
      { imageUrl: `https://images.example/${'a'.repeat(2048)}` },
      { imageUrl: 'https://images.example/a.jpg', thumbnailUrl: 'javascript:alert(1)' },
      { imageUrl: 'https://images.example/a.jpg', width: 0 },
      { imageUrl: 'https://images.example/a.jpg', height: 1.5 },
      { imageUrl: 'https://images.example/a.jpg', source: 'Has Spaces' },
      { imageUrl: 'https://images.example/a.jpg', sourceId: '' },
      { imageUrl: 'https://images.example/a.jpg', title: 5 },
      { imageUrl: 'https://images.example/a.jpg', note: 'n'.repeat(2001) },
      { imageUrl: 'https://images.example/a.jpg', tags: 'nature' },
      { imageUrl: 'https://images.example/a.jpg', tags: Array(21).fill('t') },
      { imageUrl: 'https://images.example/a.jpg', tags: [1] },
    ])('Should reject image %j', async body => {
      const response = await api('owner', 'post', url('')).send(body);

      expect(response.statusCode).toBe(400);
    });

    test('Should edit title, note and tags only', async () => {
      const { body: saved } = await api('owner', 'post', url('')).send(image(2));

      const response = await api('editor', 'patch', url(`/${saved.id}`)).send({
        note: '  Go in autumn ',
        tags: ['fall'],
        imageUrl: 'https://evil.example/swap.jpg',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject({
        title: 'Photo 2',
        note: 'Go in autumn',
        tags: ['fall'],
        imageUrl: saved.imageUrl,
      });
    });

    test('Should reject an edit with nothing to change', async () => {
      const { body: images } = await api('owner', 'get', url(''));
      const response = await api('owner', 'patch', url(`/${images[0].id}`)).send({});

      expect(response.statusCode).toBe(400);
    });

    test('Should list newest first and use the newest as the cover', async () => {
      const { body: images } = await api('owner', 'get', url(''));
      const { body: detail } = await api('owner', 'get', `/api/collections/${collection.id}`);

      expect(images.map(i => i.title)).toEqual(['Photo 2', '', 'Photo 1']);
      expect(detail.images).toEqual(images);
      expect(detail.imageCount).toBe(3);
      expect(detail.coverUrl).toBe(images[0].thumbnailUrl);
    });

    test('Should remove an image', async () => {
      const { body: images } = await api('owner', 'get', url(''));
      const target = images[0].id;

      expect((await api('editor', 'delete', url(`/${target}`))).statusCode).toBe(204);
      expect((await api('editor', 'delete', url(`/${target}`))).statusCode).toBe(404);
      expect((await api('owner', 'get', url(`/${target}`))).statusCode).toBe(404);
    });

    test('Should not reach an image through a different collection', async () => {
      const { body: images } = await api('owner', 'get', url(''));
      const other = await createCollection('Elsewhere');
      const otherUrl = `/api/collections/${other.id}/images/${images[0].id}`;

      expect((await api('owner', 'get', otherUrl)).statusCode).toBe(404);
      expect((await api('owner', 'patch', otherUrl).send({ title: 'x' })).statusCode).toBe(404);
      expect((await api('owner', 'delete', otherUrl)).statusCode).toBe(404);
    });
  });

  describe('Share links', () => {
    let collection;

    beforeAll(async () => {
      collection = await createCollection('Public board');
      await api('owner', 'post', `/api/collections/${collection.id}/images`).send(image(3));
    });

    const enable = access =>
      api('owner', 'put', `/api/collections/${collection.id}/share-link`).send({ access });

    test('Should not resolve while link sharing is off', async () => {
      const response = await request(app).get(`/api/shared/${collection.shareId}`);

      expect(response.statusCode).toBe(404);
    });

    test.each([undefined, 'own', 'admin', null])('Should reject link access %p', async access => {
      expect((await enable(access)).statusCode).toBe(400);
    });

    test('Should let anyone with the link view without logging in', async () => {
      const enabled = await enable('view');
      expect(enabled.statusCode).toBe(200);
      expect(enabled.body.linkAccess).toBe('view');

      const response = await request(app).get(`/api/shared/${enabled.body.shareId}`);

      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toMatchObject({
        id: collection.id,
        name: 'Public board',
        permission: null,
        linkAccess: 'view',
        shareId: collection.shareId,
      });
      expect(response.body.images).toHaveLength(1);
    });

    test('Should not let a link visitor edit before joining', async () => {
      const response = await api(
        'stranger',
        'post',
        `/api/collections/${collection.id}/images`,
      ).send(image(4));

      expect(response.statusCode).toBe(404);
    });

    test('Should add a user who joins through the link at the link access', async () => {
      const joined = await api('stranger', 'post', `/api/shared/${collection.shareId}/join`);

      expect(joined.statusCode).toBe(200);
      expect(joined.body.permission).toBe('view');

      const list = await api('stranger', 'get', '/api/collections');
      expect(list.body.map(c => c.id)).toContain(collection.id);
    });

    test('Should upgrade but never downgrade a member who joins again', async () => {
      await enable('edit');
      const upgraded = await api('stranger', 'post', `/api/shared/${collection.shareId}/join`);
      expect(upgraded.body.permission).toBe('edit');

      await enable('view');
      const kept = await api('stranger', 'post', `/api/shared/${collection.shareId}/join`);
      expect(kept.body.permission).toBe('edit');
    });

    test('Should leave the owner as owner when they open their own link', async () => {
      const response = await api('owner', 'post', `/api/shared/${collection.shareId}/join`);

      expect(response.body.permission).toBe('own');
    });

    test('Should show a logged-in visitor their own access', async () => {
      const response = await api('stranger', 'get', `/api/shared/${collection.shareId}`);

      expect(response.body.permission).toBe('edit');
    });

    test('Should 401 a link visitor whose token has expired, so they refresh it', async () => {
      const response = await request(app)
        .get(`/api/shared/${collection.shareId}`)
        .set('Authorization', 'Bearer expired.or.bogus');

      expect(response.statusCode).toBe(401);
    });

    test('Resetting the link should kill the old one but keep members', async () => {
      const oldShareId = collection.shareId;
      const reset = await api(
        'owner',
        'post',
        `/api/collections/${collection.id}/share-link/reset`,
      );

      expect(reset.statusCode).toBe(200);
      expect(reset.body.shareId).not.toBe(oldShareId);
      expect(reset.body.shareId).toBe(encodeShareId(collection.id, 2));
      expect((await request(app).get(`/api/shared/${oldShareId}`)).statusCode).toBe(404);
      expect((await request(app).get(`/api/shared/${reset.body.shareId}`)).statusCode).toBe(200);
      expect((await api('stranger', 'get', `/api/collections/${collection.id}`)).statusCode).toBe(
        200,
      );
      collection.shareId = reset.body.shareId;
    });

    test('Turning link sharing off should stop the link and hide it from members', async () => {
      const off = await api('owner', 'delete', `/api/collections/${collection.id}/share-link`);

      expect(off.statusCode).toBe(200);
      expect(off.body.linkAccess).toBeNull();
      expect((await request(app).get(`/api/shared/${collection.shareId}`)).statusCode).toBe(404);
      expect(
        (await api('stranger', 'post', `/api/shared/${collection.shareId}/join`)).statusCode,
      ).toBe(404);

      const asMember = await api('stranger', 'get', `/api/collections/${collection.id}`);
      expect(asMember.body.shareId).toBeNull();
    });

    test('A share id cannot be pointed at another collection', async () => {
      const privateOne = await createCollection('Private');
      const forged = encodeShareId(privateOne.id, 1);

      // Even a correctly made share id does nothing while that collection's sharing is off
      expect((await request(app).get(`/api/shared/${forged}`)).statusCode).toBe(404);
    });
  });

  describe('Leaving, removing and transferring', () => {
    let collection;
    const url = rest => `/api/collections/${collection.id}${rest}`;

    beforeEach(async () => {
      collection = await createCollection('Handover');
      await share(collection.id, users.editor.username, 'edit');
      await share(collection.id, users.viewer.username, 'view');
    });

    test('A member can leave', async () => {
      const response = await api('viewer', 'delete', url(`/members/${users.viewer.username}`));

      expect(response.statusCode).toBe(204);
      expect((await api('viewer', 'get', url(''))).statusCode).toBe(404);
    });

    test('The owner can remove a member', async () => {
      const response = await api('owner', 'delete', url(`/members/${users.editor.username}`));

      expect(response.statusCode).toBe(204);
      expect((await api('editor', 'get', url(''))).statusCode).toBe(404);
      expect(
        (await api('owner', 'delete', url(`/members/${users.editor.username}`))).statusCode,
      ).toBe(404);
    });

    test('Transferring ownership should swap the owner and keep the old one as editor', async () => {
      const response = await share(collection.id, users.viewer.username, 'own');

      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject({ id: users.viewer.id, permission: 'own' });

      const { body: members } = await api('viewer', 'get', url('/members'));
      expect(members.map(m => [m.username, m.permission])).toEqual([
        [users.viewer.username, 'own'],
        [users.editor.username, 'edit'],
        [users.owner.username, 'edit'],
      ]);

      // The old owner lost owner-only actions, the new one gained them
      expect((await api('owner', 'delete', url(''))).statusCode).toBe(403);
      expect((await api('viewer', 'delete', url(''))).statusCode).toBe(204);
    });

    test('Deleting a collection removes it for every member', async () => {
      expect((await api('owner', 'delete', url(''))).statusCode).toBe(204);

      for (const name of ['owner', 'editor', 'viewer']) {
        expect((await api(name, 'get', url(''))).statusCode).toBe(404);
      }
    });
  });

  test('Deleting a user keeps the images they saved in collections they did not own', async () => {
    const collection = await createCollection('Outlives a member');
    const { body: temp } = await request(app)
      .post('/api/users')
      .send({ username: `temp_${suffix}`, password: 'correct horse battery' })
      .expect(201);
    await share(collection.id, temp.username, 'edit');

    const saved = await request(app)
      .post(`/api/collections/${collection.id}/images`)
      .set('Authorization', `Bearer ${Tokens.signAccessToken(temp)}`)
      .send(image(9))
      .expect(201);
    await pool.query('DELETE FROM users WHERE id = $1', [temp.id]);

    const response = await api('owner', 'get', `/api/collections/${collection.id}/images`);
    expect(response.body).toEqual([expect.objectContaining({ id: saved.body.id, addedBy: null })]);
  });
});
