const { hashPassword, verifyPassword } = require('../lib/password');

describe('Password hashing', () => {
  test('Hash does not contain the password and verifies it', async () => {
    const hash = await hashPassword('correct horse');

    expect(hash).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[^$]+\$[^$]+$/);
    expect(hash).not.toContain('correct horse');
    await expect(verifyPassword('correct horse', hash)).resolves.toBe(true);
    await expect(verifyPassword('Correct horse', hash)).resolves.toBe(false);
  });

  test('Same password hashes differently each time (random salt)', async () => {
    const [first, second] = await Promise.all([hashPassword('same'), hashPassword('same')]);

    expect(first).not.toBe(second);
  });

  test.each(['', 'not-a-hash', 'bcrypt$1$2$3$c2FsdA==$aGFzaA==', 'scrypt$x$8$1$c2FsdA==$aGFzaA=='])(
    'Malformed stored hash %j is rejected',
    async stored => {
      await expect(verifyPassword('anything', stored)).resolves.toBe(false);
    },
  );
});
