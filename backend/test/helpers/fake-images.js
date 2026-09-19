/**
 * Test helpers for code that downloads images: build image bytes, and stand in for fetch so no
 * test touches the network.
 */

/**
 * Bytes that start like a PNG of the given size. image-size only reads the header, which is all
 * the code under test looks at. Different seeds give different bytes, so different hashes.
 */
const makePng = (width, height, seed = '') => {
  const header = Buffer.alloc(25);
  header.writeUInt32BE(13, 0);
  header.write('IHDR', 4);
  header.writeUInt32BE(width, 8);
  header.writeUInt32BE(height, 12);
  header[16] = 8;
  header[17] = 6;
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, header, Buffer.from(seed)]);
};

/**
 * Replaces global fetch with one that answers from a table of URL -> response, and records the
 * URLs it was asked for. A value can be a Response, a function returning one, or an Error to throw.
 * Unknown URLs fail the test. Call the returned restore() in afterEach.
 * @param {Record<string, Response|Function|Error>} routes
 */
const fakeFetch = routes => {
  const requested = [];
  const spy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
    const href = String(url);
    requested.push({ url: href, options });
    const answer = routes[href];
    if (answer === undefined) {
      throw new Error(`Unexpected fetch of ${href}`);
    }
    if (answer instanceof Error) {
      throw answer;
    }
    return typeof answer === 'function' ? answer() : answer.clone();
  });
  return { requested, restore: () => spy.mockRestore() };
};

const imageResponse = (body, { contentType = 'image/png', status = 200, headers = {} } = {}) =>
  new Response(body, { status, headers: { 'Content-Type': contentType, ...headers } });

const redirect = (location, status = 302) =>
  new Response(null, { status, headers: { Location: location } });

module.exports = { makePng, fakeFetch, imageResponse, redirect };
