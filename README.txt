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
                seed/           queries.sql (schema + sample data) and its runner
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

Then create the database tables and sample data:

  cd backend
  npm run seed

This runs backend/seed/queries.sql in one transaction and is safe to rerun:
tables are only created if missing and sample rows only go into empty tables.


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
TODO - document each endpoint (method, path, request body, response) as it is
built, e.g.:

  GET    /api/collections            List all collections
  POST   /api/collections            Create a collection
  ...


REFLECTION (under 100 words)
----------------------------
TODO - write a short reflection: what you learned, what concepts it reinforced,
and any issues you ran into.


FEEDBACK ON THE CHALLENGE
-------------------------
TODO - optional feedback on the challenge, workshops, or office hours.
