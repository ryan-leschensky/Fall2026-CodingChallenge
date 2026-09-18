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
                models/         SQL queries for each resource (users.js)
                lib/            shared helpers (password hashing, HttpError)
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
Copy the template and fill in your values (DATABASE_URL and JWT_SECRET are
required; the server will not start without them):

  cd backend
  cp .env.example .env

Generate JWT_SECRET (any random value of at least 32 bytes) with:

  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

Then create the database tables:

  cd backend
  npm run seed

This runs backend/seed/users.sql and then backend/seed/refresh-tokens.sql
(the order listed in seeder.js) in one transaction and is safe to rerun:
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


REFLECTION (under 100 words)
----------------------------
TODO - write a short reflection: what you learned, what concepts it reinforced,
and any issues you ran into.


FEEDBACK ON THE CHALLENGE
-------------------------
TODO - optional feedback on the challenge, workshops, or office hours.
