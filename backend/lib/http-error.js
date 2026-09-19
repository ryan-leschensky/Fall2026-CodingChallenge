// An Error carrying an HTTP status. The error handler in index.js sends its message to the
// client when the status is below 500, or when expose is set: a 502 for an image host that could
// not be reached is not a bug in this server, and the client should know what went wrong.
class HttpError extends Error {
  constructor(status, message, { expose = status < 500 } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.expose = expose;
  }
}

module.exports = HttpError;
