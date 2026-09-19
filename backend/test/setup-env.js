/**
 * Used for testing only
 * @type {string}   set string of at least 32 bytes for consistent testing
 */
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-bytes-long';
process.env.SHARE_LINK_SECRET = 'test-share-link-secret-at-least-32-bytes';
