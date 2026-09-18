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
                seed/           queries.sql (database schema) and its runner
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
Copy the template and fill in your values (DATABASE_URL is required):

  cd backend
  cp .env.example .env

Then create the database tables:

  cd backend
  npm run seed

This runs backend/seed/queries.sql in one transaction and is safe to rerun:
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

  POST   /api/auth/login         Check a username and password
           body: { "username": "alice", "password": "..." }
           200 user, 400 missing fields,
           401 wrong username or password (same response for both)


REFLECTION (under 100 words)
----------------------------
TODO - write a short reflection: what you learned, what concepts it reinforced,
and any issues you ran into.


FEEDBACK ON THE CHALLENGE
-------------------------
TODO - optional feedback on the challenge, workshops, or office hours.
