const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');

const { createApp, validateDocumentSummaryOptions, validateSummaryRequest } = require('../src/app');

let server;

afterEach(() => {
  if (server) server.close();
  server = undefined;
});

async function startApp(summarize = async () => 'A useful brief.', dependencies = {}) {
  const app = createApp({ summarize, allowedOrigins: 'http://localhost:3000', ...dependencies });
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

test('validates supported summary options', () => {
  const result = validateSummaryRequest({
    text: 'A source that needs a clear summary.',
    mode: 'study-notes',
    length: 'detailed',
    audience: 'beginner',
  });

  assert.equal(result.value.mode, 'study-notes');
  assert.equal(result.value.length, 'detailed');
});

test('rejects an empty source', () => {
  assert.equal(
    validateSummaryRequest({ text: '   ' }).error,
    'Add text before generating a brief.',
  );
});

test('validates document brief controls', () => {
  assert.deepEqual(validateDocumentSummaryOptions({ mode: 'action-items', detail: 'detailed', audience: 'expert' }).value, {
    mode: 'action-items', detail: 'detailed', audience: 'expert',
  });
  assert.equal(validateDocumentSummaryOptions({ detail: 'maximum' }).error, 'Choose a supported detail level.');
});

test('reports service health', async () => {
  const baseUrl = await startApp();
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', service: 'briefly-api' });
});

test('creates a configured summary', async () => {
  let received;
  const baseUrl = await startApp(async (options) => {
    received = options;
    return 'Key finding\n• The source supports the result.';
  });

  const response = await fetch(`${baseUrl}/api/summaries`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: 'A sufficiently descriptive source for the integration test.',
      mode: 'key-points',
      length: 'concise',
      audience: 'expert',
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(received.mode, 'key-points');
  assert.equal(body.summary, 'Key finding\n• The source supports the result.');
  assert.equal(body.meta.audience, 'expert');
  assert.equal(body.meta.text, undefined);
});

test('returns a safe provider error', async () => {
  const baseUrl = await startApp(async () => {
    throw new Error('secret provider detail');
  });

  const response = await fetch(`${baseUrl}/api/summaries`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'A valid source that causes the provider to fail.' }),
  });
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.error, 'The request could not be completed. Try again.');
  assert.equal(JSON.stringify(body).includes('secret provider detail'), false);
});

test('rejects malformed document AI identifiers before calling the service', async () => {
  const requireAuth = (req, res, next) => { req.user = { id: '11111111-1111-4111-8111-111111111111' }; next(); };
  const documentAI = {
    async enqueueSummary() { throw new Error('must not run'); },
    async answerQuestion() { throw new Error('must not run'); },
  };
  const baseUrl = await startApp(undefined, { requireAuth, documentAI });
  const response = await fetch(`${baseUrl}/api/documents/not-a-uuid/summaries`, {
    method: 'POST', headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' }, body: '{}',
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'Provide a valid document ID.');
});

test('queues ingestion only for an authenticated document owner', async () => {
  let received;
  const requireAuth = (req, res, next) => {
    req.user = { id: '11111111-1111-4111-8111-111111111111' };
    next();
  };
  const documentService = {
    async enqueue(input) {
      received = input;
      return { status: 202, job: { id: 'job-1', status: 'queued' }, duplicate: false };
    },
  };
  const baseUrl = await startApp(undefined, { requireAuth, documentService });

  const response = await fetch(`${baseUrl}/api/documents/22222222-2222-4222-8222-222222222222/ingest`, {
    method: 'POST',
    headers: { authorization: 'Bearer test-token' },
  });
  const body = await response.json();

  assert.equal(response.status, 202);
  assert.equal(received.userId, '11111111-1111-4111-8111-111111111111');
  assert.equal(received.documentId, '22222222-2222-4222-8222-222222222222');
  assert.equal(body.job.status, 'queued');
});

test('creates a comparison for two authenticated document IDs', async () => {
  let received;
  const requireAuth = (req, res, next) => {
    req.user = { id: '11111111-1111-4111-8111-111111111111' };
    next();
  };
  const comparisonAI = {
    async compareDocuments(input) {
      received = input;
      return { status: 201, comparison: { id: 'comparison-1', title: 'Version changes' } };
    },
  };
  const baseUrl = await startApp(undefined, { requireAuth, comparisonAI });
  const response = await fetch(`${baseUrl}/api/comparisons`, {
    method: 'POST',
    headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
    body: JSON.stringify({
      baseDocumentId: '22222222-2222-4222-8222-222222222222',
      targetDocumentId: '33333333-3333-4333-8333-333333333333',
    }),
  });
  assert.equal(response.status, 201);
  assert.equal(received.userId, '11111111-1111-4111-8111-111111111111');
  assert.equal((await response.json()).comparison.title, 'Version changes');
});

test('rejects comparing a document with itself', async () => {
  const requireAuth = (req, res, next) => { req.user = { id: '11111111-1111-4111-8111-111111111111' }; next(); };
  const comparisonAI = { async compareDocuments() { throw new Error('must not run'); } };
  const baseUrl = await startApp(undefined, { requireAuth, comparisonAI });
  const documentId = '22222222-2222-4222-8222-222222222222';
  const response = await fetch(`${baseUrl}/api/comparisons`, {
    method: 'POST', headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
    body: JSON.stringify({ baseDocumentId: documentId, targetDocumentId: documentId }),
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'Choose two different documents.');
});
