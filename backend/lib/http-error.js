// An Error carrying an HTTP status. The error handler in index.js sends its message to the
// client when the status is below 500.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

module.exports = HttpError;
