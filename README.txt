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
                middleware/     requireAuth, collection permission checks
                lib/            shared helpers (passwords, tokens, share ids, HttpError)
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
Copy the template and fill in your values (DATABASE_URL, JWT_SECRET and
SHARE_LINK_SECRET are required; the server will not start without them):

  cd backend
  cp .env.example .env

Generate JWT_SECRET and SHARE_LINK_SECRET (two different random values of at
least 32 bytes) by running this twice:

  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

Changing SHARE_LINK_SECRET later makes every existing share link stop working.

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

  GET    /api/collections                    Collections I own or am a member of
  POST   /api/collections                    Create  { "name", "description"? }
  GET    /api/collections/:id                One collection + its images   [view]
  PATCH  /api/collections/:id                Rename  { "name"?, "description"? }  [edit]
  DELETE /api/collections/:id                Delete it for everyone        [own]

  GET    /api/collections/:id/images         List images, newest first     [view]
  POST   /api/collections/:id/images         Save an image                 [edit]
           { "imageUrl", "thumbnailUrl"?, "pageUrl"?, "source"?, "sourceId"?,
             "width"?, "height"?, "title"?, "note"?, "tags"? }
           409 if that imageUrl is already in the collection
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


REFLECTION (under 100 words)
----------------------------
TODO - write a short reflection: what you learned, what concepts it reinforced,
and any issues you ran into.


FEEDBACK ON THE CHALLENGE
-------------------------
TODO - optional feedback on the challenge, workshops, or office hours.
