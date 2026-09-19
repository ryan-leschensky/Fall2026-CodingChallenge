================================================================================
Change++ Fall 2026 Coding Challenge - Image Saving/Sharing App
================================================================================

AUTHOR
------
Full name:          Ryan Leschensky
Vanderbilt email:   TODO - add your @vanderbilt.edu address here


PROJECT LAYOUT
--------------
  backend/    Express (Node.js) + PostgreSQL REST API - runs on http://localhost:3000
                index.js        builds the app, listens when run directly
                db/db.js        PostgreSQL connection pool
                routers/        API routes, mounted under /api
                models/         SQL queries for each resource (users, collections, ...)
                middleware/     requireAuth, collection permission checks, rate limits
                lib/            shared helpers (passwords, tokens, share ids, pagination,
                                Pixabay search, image downloads, HttpError)
                storage/        where saved images are kept (local disk or S3)
                seed/           one .sql file per table (database schema) and its runner
                test/           Jest + Supertest API tests
  frontend/   React + TypeScript app built with Vite - runs on http://localhost:5173

The two are separate servers: the frontend calls the backend over HTTP.


REQUIREMENTS
------------
  - Node.js 20 or newer (includes npm)
  - PostgreSQL


SETUP
-----
From the repository root, install dependencies for each server:

  cd backend
  npm install
  cd ../frontend
  npm install

The backend reads its configuration from backend/.env, which is not committed.
Copy the template and fill in your values (DATABASE_URL, JWT_SECRET,
SHARE_LINK_SECRET and PIXABAY_API_KEY are required; the server will not start
without them):

  cd backend
  cp .env.example .env

Generate JWT_SECRET and SHARE_LINK_SECRET (two different random values of at
least 32 bytes) by running this twice:

  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

Changing SHARE_LINK_SECRET later makes every existing share link stop working.

PIXABAY_API_KEY is your Pixabay API key: sign up at pixabay.com, then copy the
key shown on https://pixabay.com/api/docs/. It is only used by the backend.

Saved images from Pixabay are downloaded and stored in backend/media by default
(see SEARCH AND SAVED IMAGES below). The other settings in .env.example have
working defaults; set STORAGE_DRIVER=s3 and the S3_* values to store them in a
bucket instead.

Then create the database tables:

  cd backend
  npm run seed

This runs the files in backend/seed (users.sql, refresh-tokens.sql,
collections.sql, collection-images.sql - the order listed in seeder.js) in one
transaction and is safe to rerun:
tables and indexes are only created if missing. (It also replaces the starter
template's sample users(name, lastname) table if an old database still has it.)


RUNNING THE APP
---------------
Two terminals, one per server.

  Terminal 1 - backend:
    cd backend
    npm start                 -> http://localhost:3000

  Terminal 2 - frontend:
    cd frontend
    npm run dev               -> http://localhost:5173

Then open http://localhost:5173 in a browser.

In WebStorm / IntelliJ, shared run configurations are committed with the repo:
  - "Backend"    starts the Express server
  - "Frontend"   starts the Vite dev server
  - "Full Stack" starts both at once (use this one normally)


OTHER USEFUL COMMANDS
---------------------
  cd backend && npm run dev        Start the backend and restart it on file changes
  cd backend && npm test           Run the API tests (database tests need DATABASE_URL)
  cd backend && npm run lint       Run ESLint
  cd frontend && npm run build     Type-check and produce a production build
  cd frontend && npm run lint      Run ESLint
  cd frontend && npm run preview   Serve the production build locally


API ENDPOINTS
-------------
Request and response bodies are JSON. Errors look like { "message": "..." }.

A user is returned as:
  { "id": 1, "username": "Alice", "createdAt": "2026-09-18T15:04:05.000Z" }
The password hash is never included in a response.

Usernames are 3-30 characters (letters, digits, ".", "_", "-") and are unique
regardless of case: once "Alice" exists, "alice" and "ALICE" are taken too.
The casing chosen at sign-up is kept for display, and lookups ignore case.
Passwords are 8-128 characters and are stored only as a salted scrypt hash.

  POST   /api/users              Sign up
           body: { "username": "Alice", "password": "..." }
           201 user (Location: /api/users/Alice)
           400 invalid username/password, 409 username already taken

  GET    /api/users              List all users
           200 [user, ...]

  GET    /api/users/:username    Get one user (case-insensitive)
           200 user, 404 not found

  POST   /api/auth/login         Log in (starts a session)
           body: { "username": "alice", "password": "..." }
           200 session (below) + refresh token cookie, 400 missing fields,
           401 wrong username or password (same response for both)

  POST   /api/auth/refresh       Get a new access token (sends the cookie)
           200 session + a new refresh token cookie
           401 no session, expired, or revoked

  POST   /api/auth/logout        End the session (sends the cookie)
           204, always (clears the cookie)

  GET    /api/auth/me            The logged-in user (needs an access token)
           200 user, 401 missing, invalid or expired access token

Every /api/collections endpoint needs an access token. The permission each one
needs is in brackets (see COLLECTIONS AND SHARING below). A collection the user
cannot see returns 404, the same as one that does not exist; one they can see
but not change returns 403. Full request/response schemas: /api-docs.

Lists come one page at a time, 20 items by default. Pass ?limit= (up to 100)
with ?page= (from 1) or ?offset=; the total across all pages is in the
X-Total-Count response header.

  GET    /api/collections                    Collections I own or am a member of
  POST   /api/collections                    Create  { "name", "description"? }
  GET    /api/collections/:id                One collection + its images   [view]
  PATCH  /api/collections/:id                Rename  { "name"?, "description"? }  [edit]
  DELETE /api/collections/:id                Delete it for everyone        [own]

  GET    /api/collections/:id/images         List images, newest first     [view]
  POST   /api/collections/:id/images         Save an image                 [edit]
           { "imageUrl", "thumbnailUrl"?, "pageUrl"?, "source"?, "sourceId"?,
             "width"?, "height"?, "title"?, "note"?, "tags"? }
           409 if that image is already in the collection. Images from
           Pixabay are downloaded and stored (see SEARCH AND SAVED IMAGES)
  GET    /api/collections/:id/images/:imageId                              [view]
  PATCH  /api/collections/:id/images/:imageId  Edit { "title"?, "note"?, "tags"? }  [edit]
  DELETE /api/collections/:id/images/:imageId  Remove it                   [edit]

  GET    /api/collections/:id/members        Owner and members             [view]
  PUT    /api/collections/:id/members/:username   { "permission": "view"|"edit"|"own" }  [own]
           Add a member (201) or change their permission (200). "own" hands
           ownership to an existing member; the old owner stays as an editor.
  DELETE /api/collections/:id/members/:username   Remove a member [own], or leave
           (any member may remove themselves; the owner cannot leave)

  PUT    /api/collections/:id/share-link     Turn the link on  { "access": "view"|"edit" }  [own]
  DELETE /api/collections/:id/share-link     Turn the link off             [own]
  POST   /api/collections/:id/share-link/reset   New link; old ones stop working  [own]

  GET    /api/shared/:shareId                View through the link (no login needed)
  POST   /api/shared/:shareId/join           Join as a member with the link's access

  GET    /api/search/images?q=lake&page=1&limit=20   Search Pixabay (needs an access token)
           Each result can be sent as-is to POST /api/collections/:id/images,
           and savedIn lists the user's collections that already have it.

Some endpoints are rate limited and answer 429 (with a Retry-After header) when
called too often: login (10 per 15 minutes per address), sign-up (10 per hour
per address), share links (120 per minute per address) and search (30 per
minute per user). Behind a reverse proxy, set TRUST_PROXY so limits count the
real client address.


SESSIONS
--------
Logging in or refreshing returns a session:
  { "user": user, "accessToken": "eyJ...", "tokenType": "Bearer", "expiresIn": 900 }

  - The access token is a JWT (HS256, signed with JWT_SECRET) valid for
    15 minutes. Send it on protected requests:
      Authorization: Bearer <accessToken>
    Keep it in memory (not localStorage), so page scripts cannot leak it.

  - The refresh token is a random value in an httpOnly, SameSite=Strict cookie
    that is only sent to /api/auth. Page scripts cannot read it. It expires
    after 7 days unused, and no session lasts more than 30 days after login.
    Only its SHA-256 hash is stored (refresh_tokens table).

  - Each refresh replaces the refresh token. If an old one is used again it
    must have been copied, so the whole session is revoked and the user has
    to log in again. The frontend should therefore run one refresh at a time.

  - When a request returns 401, call POST /api/auth/refresh and retry once.
    On page load, call refresh to restore the session from the cookie.
    Browser requests to /api/auth must use credentials: 'include'.

  - Only origins listed in CORS_ORIGIN (default http://localhost:5173) may
    make credentialed requests to the API.


COLLECTIONS AND SHARING
-----------------------
Each collection has exactly one owner, who created it (or was handed it).
Access is one of three levels, each including the ones before it:

  view   see the collection and its images
  edit   also rename it and add, edit and remove images
  own    also share it, manage members, reset the link, and delete it

The levels are a PostgreSQL enum (collection_permission) and a matching
Permission object in backend/lib/permissions.js. Members are stored in
collection_members; the owner is collections.owner_id, so there can never be
two owners.

A collection can be shared two ways:
  - With a user by username, at view or edit.
  - With a link. The owner turns it on at view or edit. Anyone with the link can
    view the collection without logging in, and a logged-in user can join it to
    become a member at that level (joining never lowers access they already
    have). Turning the link off or resetting it stops old links working; people
    who already joined stay members.

The link id (shareId, e.g. /api/shared/Zq3...) comes from a getter on the
Collection model that derives it from the collection's id and a share version
(backend/lib/share-ids.js): the two numbers are encrypted as one AES block
with a key from SHARE_LINK_SECRET. Nothing extra is stored, each collection
gets a unique 22-character id, and ids cannot be guessed or reveal the
collection's number. Resetting the link bumps the version, which gives a new id.


SEARCH AND SAVED IMAGES
-----------------------
Search goes through the backend, so the Pixabay key never reaches the browser.
Identical searches are cached for 24 hours, as Pixabay's API terms ask, and
only the first 500 results of a search can be paged through.

Pixabay does not allow its image URLs to be hotlinked long-term, and the
full-size URLs it hands out expire after a day. So when an image from an
allowed host (MEDIA_ALLOWED_HOSTS, pixabay.com by default) is saved, the
backend downloads it and stores a copy; imageUrl then points at the copy and
originalUrl keeps where it came from. Images from other hosts are saved as
links.

Downloads are guarded so the server cannot be used to fetch other addresses:
only https URLs on allowed hosts, checked again on every redirect, up to
MEDIA_MAX_BYTES, and only real JPEG, PNG, WebP or GIF files (read from the
bytes, not the headers). Each file is named after a hash of its contents, so an
image saved to many collections is stored once. With STORAGE_DRIVER=local the
files are served from http://localhost:3000/media.


REFLECTION (under 100 words)
----------------------------
TODO - write a short reflection: what you learned, what concepts it reinforced,
and any issues you ran into.


FEEDBACK ON THE CHALLENGE
-------------------------
TODO - optional feedback on the challenge, workshops, or office hours.
