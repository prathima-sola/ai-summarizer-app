const assert = require('node:assert/strict');
const test = require('node:test');

const { createDocumentWorker } = require('../src/documents/worker-runtime');

test('embedded document worker polls and stops cleanly', async () => {
  let polls = 0;
  const messages = [];
  const documentService = {
    async processNextJob() {
      polls += 1;
      return false;
    },
  };
  const worker = createDocumentWorker(documentService, {
    pollInterval: 0,
    sleep: () => new Promise((resolve) => setImmediate(resolve)),
    logger: {
      log: (message) => messages.push(message),
      error: (message) => messages.push(message),
    },
  });

  worker.start();
  await new Promise((resolve) => setImmediate(resolve));
  await worker.stop();

  assert.ok(polls >= 1);
  assert.deepEqual(messages, ['Briefly document worker started.']);
});

test('embedded document worker requires a document service', () => {
  assert.throws(() => createDocumentWorker(null), /document service is required/i);
});
