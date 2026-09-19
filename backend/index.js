require('dotenv').config();

const path = require('path');
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');

// Import PostgreSQL Middleware
const { pool, connect, PostgreSQL } = require('./db/db');
const routes = require('./routers/routes');
const Tokens = require('./lib/tokens');
const ShareIds = require('./lib/share-ids');
const Storage = require('./storage');
const { readMediaConfig } = require('./lib/media-config');

const app = express();

// Behind a reverse proxy or load balancer, trust its X-Forwarded-For header so req.ip (and so the
// rate limits) see the real client address. TRUST_PROXY is the number of proxies in front.
if (process.env.TRUST_PROXY) {
  const hops = Number(process.env.TRUST_PROXY);
  if (!Number.isInteger(hops) || hops < 0) {
    throw new Error('TRUST_PROXY must be the number of proxies in front of the server, e.g. 1');
  }
  app.set('trust proxy', hops);
}

// Logger
if (app.get('env') !== 'test') {
  app.use(morgan(app.get('env') === 'development' ? 'dev' : 'combined'));
}

// SwaggerUI Config/Middleware

const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Coding Challenge API',
      version: '1.0.0',
      description: 'API documentation for the backend service',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  // glob only accepts "/" as a separator, so convert Windows paths before joining
  apis: [path.posix.join(__dirname.split(path.sep).join('/'), 'routers', '*.js')], // Path to the API docs / route files
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Serve the raw OpenAPI spec (for IDEs and other tooling)
app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));

// Serve Swagger UI at /api-docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Security headers (no MIME sniffing, no framing, a strict Content-Security-Policy, ...). Added
// after the docs so the CSP cannot get in the way of the Swagger UI page.
app.use(helmet());

// Saved images, when they are stored on this server's disk (STORAGE_DRIVER=local). A file is named
// after a hash of its bytes, so it never changes and browsers can cache it for good. Pages on other
// origins (the frontend) must be allowed to show them, which helmet's default forbids.
if (readMediaConfig().driver === 'local') {
  app.use(
    '/media',
    helmet.crossOriginResourcePolicy({ policy: 'cross-origin' }),
    express.static(readMediaConfig().dir, {
      immutable: true,
      maxAge: '1y',
      index: false,
      fallthrough: false,
    }),
  );
}

// Access Control: the refresh token cookie is credentialed, so allowed origins must be listed
// explicitly (a credentialed request cannot use "*")
const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
// Browsers hide response headers from cross-origin scripts unless they are listed here
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    exposedHeaders: ['X-Total-Count', 'Location'],
  }),
);

// Body parser
app.use(express.json());

// Cookie parser (for the refresh token cookie)
app.use(cookieParser());

// Middleware to make the PostgreSQL pool accessible in request handlers
app.use(PostgreSQL);

// Routes
app.use('/api', routes);

// Unknown routes
app.use((req, res) => {
  res.status(404).json({ message: 'Not Found' });
});

// Error handler: client errors keep their message, server errors are logged and hidden unless
// marked safe to show (expose), like a failure of an upstream service
app.use((err, req, res, next) => {
  const status = err.status ?? err.statusCode ?? 500;
  const expose = err.expose ?? status < 500;
  if (status >= 500) {
    console.error(expose ? `${status} ${err.message}` : err);
  }
  res.status(status).json({ message: expose ? err.message : 'Internal Server Error' });
});

// Only listen when run directly (npm start); tests import the app without opening a port
if (require.main === module) {
  const port = process.env.PORT || 3000;

  Promise.resolve()
    .then(Tokens.assertConfigured)
    .then(ShareIds.assertConfigured)
    .then(Storage.assertConfigured)
    .then(connect)
    .then(() => {
      const server = app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
      });

      const shutdown = () => server.close(() => pool.end());
      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
    })
    .catch(err => {
      console.error('Could not start the server:', err.message);
      process.exitCode = 1;
      return pool.end();
    });
}

module.exports = app;
