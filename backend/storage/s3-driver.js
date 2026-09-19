/**
 * Stores images in an S3-compatible bucket: AWS S3, Cloudflare R2, MinIO or Supabase Storage.
 * They differ only in endpoint and path-style addressing, which are settings. Browsers load the
 * images from S3_PUBLIC_BASE_URL (the bucket's public domain or a CDN), not through this server.
 * @param {object} config           From readMediaConfig
 * @param {object} [options]
 * @param {object} [options.client] An S3Client to use instead of building one (for tests)
 */
const createS3Driver = (config, { client } = {}) => {
  // Loaded here so the AWS SDK only costs startup time when this driver is chosen
  const { S3Client, HeadObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
  const { bucket, region, endpoint, accessKeyId, secretAccessKey, forcePathStyle } = config.s3;

  const s3 =
    client ??
    new S3Client({
      region,
      ...(endpoint && { endpoint, forcePathStyle }),
      credentials: { accessKeyId, secretAccessKey },
    });

  return {
    name: 's3',

    async exists(key) {
      try {
        await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
      } catch (err) {
        if (err.$metadata?.httpStatusCode === 404 || err.name === 'NotFound') {
          return false;
        }
        throw err;
      }
    },

    async put({ key, body, contentType }) {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          // A key is a hash of the file, so what is stored under it never changes
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    },

    publicUrl(key) {
      return `${config.s3.publicBaseUrl}/${key}`;
    },
  };
};

module.exports = createS3Driver;
