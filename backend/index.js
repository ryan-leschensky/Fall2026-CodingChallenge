require('dotenv').config();

const express = require('express');
const morgan = require('morgan');
const cors = require('cors');

// Import PostgreSQL Middleware
const { pool, connect, PostgreSQL } = require('./db/db');
const routes = require('./routers/routes');

const app = express();

// Logger
if (app.get('env') !== 'test') {
  app.use(morgan(app.get('env') === 'development' ? 'dev' : 'combined'));
}

// Access Control
app.use(cors());

// Body parser
app.use(express.json());

// Middleware to make the PostgreSQL pool accessible in request handlers
app.use(PostgreSQL);

// Routes
app.use('/api', routes);

// Unknown routes
app.use((req, res) => {
  res.status(404).json({ message: 'Not Found' });
});

// Error handler: client errors keep their message, server errors are logged and hidden
app.use((err, req, res, next) => {
  const status = err.status ?? err.statusCode ?? 500;
  if (status >= 500) {
    console.error(err);
  }
  res.status(status).json({ message: status < 500 ? err.message : 'Internal Server Error' });
});

// Only listen when run directly (npm start); tests import the app without opening a port
if (require.main === module) {
  const port = process.env.PORT || 3000;

  connect()
    .then(() => {
      const server = app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
      });

      const shutdown = () => server.close(() => pool.end());
      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
    })
    .catch(err => {
      console.error('Could not connect to PostgreSQL:', err.message);
      process.exitCode = 1;
      return pool.end();
    });
}

module.exports = app;
