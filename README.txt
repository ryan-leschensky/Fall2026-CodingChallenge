Ryan Leschensky
ryan.leschensky@vanderbilt.edu

****Required:
  - Node.js 20 or newer (includes npm)
  - PostgreSQL

****Setup:
From the repository root, install dependencies for each server:

  cd backend
  npm install
  cd ../frontend
  npm install

The backend reads its configuration from backend/.env, which is not committed.
Copy the template and fill in your values (DATABASE_URL, JWT_SECRET,
SHARE_LINK_SECRET and PIXABAY_API_KEY are required
  cd backend
  cp .env.example .env

Generate JWT_SECRET and SHARE_LINK_SECRET (two different random values of at
least 32 bytes) by running this twice:

  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

Changing SHARE_LINK_SECRET later makes every existing share link stop working.

PIXABAY_API_KEY is your Pixabay API key: sign up at pixabay.com, then copy the
key shown on https://pixabay.com/api/docs/. It is only used by the backend.

Then create the database tables:

  cd backend
  npm run seed

This runs the files in backend/seed (users.sql, refresh-tokens.sql,
collections.sql, collection-images.sql - the order listed in seeder.js) in one
transaction and is safe to rerun:
tables and indexes are only created if missing. (It also replaces the starter
template's sample users(name, lastname) table if an old database still has it.)

****Running the App:

  Terminal 1 - backend:
    cd backend
    npm start -> http://localhost:3000

  Terminal 2 - frontend:
    cd frontend
    npm run dev -> http://localhost:5173

Then open http://localhost:5173 in a browser.

If you are using a JetBrains IDE/other IDE that supports run configurations,
there are three run configurations you should use:
  - "Backend"    starts the Express server
  - "Frontend"   starts the Vite dev server
  - "Full Stack" starts both at once (use this one normally)
  - "All Tests"  runs the Jest API tests

****Reflection

I found this project very informative to complete. Although I've had experience making similar
projects with similar technologies like Spring Boot, I found it interesting to try and use the
MVC pattern with Express.js and see how it compares to Spring Boot.

The main issue I had was finding a good way to set up the Express.js backend. The default setup
seemed to be a little too closed off where making a scalable backend was difficult. I was able
to look around some public repositories and articles to settle on the MVC pattern.
https://dev.to/mr_ali3n/folder-structure-for-nodejs-expressjs-project-435l