const { test } = require('node:test');
const assert = require('node:assert');
const upload = require('./src/middleware/uploadMiddleware');

test('uploadMiddleware - fileFilter', async (t) => {
  const fileFilter = upload.fileFilterFn || upload.fileFilter;

  // Mock callback function
  const createMockCb = () => {
    let called = false;
    let error = null;
    let accept = null;

    const cb = (err, result) => {
      called = true;
      error = err;
      accept = result;
    };

    return {
      cb,
      getResults: () => ({ called, error, accept })
    };
  };

  await t.test('Happy paths - Valid images', async (st) => {
    const validFiles = [
      { mimetype: 'image/jpeg', originalname: 'image.jpg' },
      { mimetype: 'image/jpeg', originalname: 'image.jpeg' },
      { mimetype: 'image/png', originalname: 'image.png' },
      { mimetype: 'image/webp', originalname: 'image.webp' },
      { mimetype: 'image/gif', originalname: 'image.gif' },
      // Case insensitive extensions
      { mimetype: 'image/jpeg', originalname: 'image.JPG' },
      { mimetype: 'image/png', originalname: 'image.PnG' },
    ];

    for (const file of validFiles) {
      const { cb, getResults } = createMockCb();
      fileFilter({}, file, cb);
      const { called, error, accept } = getResults();

      assert.strictEqual(called, true, `Callback should be called for ${file.originalname}`);
      assert.strictEqual(error, null, `Error should be null for ${file.originalname}`);
      assert.strictEqual(accept, true, `File should be accepted for ${file.originalname}`);
    }
  });

  await t.test('Error paths - Invalid images', async (st) => {
    const invalidFiles = [
      // Invalid mimetype, valid extension
      { mimetype: 'application/pdf', originalname: 'image.jpg' },
      // Valid mimetype, invalid extension
      { mimetype: 'image/jpeg', originalname: 'image.pdf' },
      // Invalid mimetype, invalid extension
      { mimetype: 'text/plain', originalname: 'document.txt' },
      // Missing extension
      { mimetype: 'image/jpeg', originalname: 'image' },
      // Empty originalname
      { mimetype: 'image/jpeg', originalname: '' },
    ];

    for (const file of invalidFiles) {
      const { cb, getResults } = createMockCb();
      fileFilter({}, file, cb);
      const { called, error, accept } = getResults();

      assert.strictEqual(called, true, `Callback should be called for ${file.originalname}`);
      assert.notStrictEqual(error, null, `Error should not be null for ${file.originalname}`);
      assert.strictEqual(error.message, 'Only JPG, PNG, WEBP or GIF images are allowed');
      assert.strictEqual(accept, undefined, `File should not be accepted for ${file.originalname}`);
    }
  });
});
