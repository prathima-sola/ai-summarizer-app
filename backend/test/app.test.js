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

test('queues a comparison for two authenticated document IDs', async () => {
  let received;
  const requireAuth = (req, res, next) => {
    req.user = { id: '11111111-1111-4111-8111-111111111111' };
    next();
  };
  const comparisonAI = {
    async enqueueComparison(input) {
      received = input;
      return { status: 202, job: { id: 'comparison-job-1', status: 'queued' } };
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
  assert.equal(response.status, 202);
  assert.equal(received.userId, '11111111-1111-4111-8111-111111111111');
  assert.equal((await response.json()).job.status, 'queued');
});

test('rejects comparing a document with itself', async () => {
  const requireAuth = (req, res, next) => { req.user = { id: '11111111-1111-4111-8111-111111111111' }; next(); };
  const comparisonAI = { async enqueueComparison() { throw new Error('must not run'); } };
  const baseUrl = await startApp(undefined, { requireAuth, comparisonAI });
  const documentId = '22222222-2222-4222-8222-222222222222';
  const response = await fetch(`${baseUrl}/api/comparisons`, {
    method: 'POST', headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
    body: JSON.stringify({ baseDocumentId: documentId, targetDocumentId: documentId }),
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'Choose two different documents.');
});

test('opens a shared brief without authentication', async () => {
  let receivedToken;
  const shareService = {
    async resolve(token) {
      receivedToken = token;
      return { status: 200, share: { expiresAt: '2026-08-20T00:00:00.000Z', resource: { type: 'summary', title: 'Shared findings' } } };
    },
  };
  const baseUrl = await startApp(undefined, { shareService });
  const token = 'a'.repeat(43);
  const response = await fetch(`${baseUrl}/api/public/shares/${token}`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(receivedToken, token);
  assert.equal(body.share.resource.title, 'Shared findings');
});

test('creates a read-only link for an authenticated owner', async () => {
  let received;
  const requireAuth = (req, res, next) => { req.user = { id: '11111111-1111-4111-8111-111111111111' }; next(); };
  const shareService = {
    async create(input) {
      received = input;
      return { status: 201, link: { id: '44444444-4444-4444-8444-444444444444' }, token: 'b'.repeat(43) };
    },
  };
  const baseUrl = await startApp(undefined, { requireAuth, shareService });
  const response = await fetch(`${baseUrl}/api/shares`, {
    method: 'POST',
    headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
    body: JSON.stringify({ resourceType: 'summary', resourceId: '22222222-2222-4222-8222-222222222222' }),
  });
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(received.userId, '11111111-1111-4111-8111-111111111111');
  assert.equal(received.resourceType, 'summary');
  assert.equal(body.token.length, 43);
});

test('revokes only an authenticated owner share link', async () => {
  let received;
  const requireAuth = (req, res, next) => { req.user = { id: '11111111-1111-4111-8111-111111111111' }; next(); };
  const shareService = { async revoke(input) { received = input; return { status: 204 }; } };
  const baseUrl = await startApp(undefined, { requireAuth, shareService });
  const response = await fetch(`${baseUrl}/api/shares/44444444-4444-4444-8444-444444444444`, {
    method: 'DELETE', headers: { authorization: 'Bearer test-token' },
  });
  assert.equal(response.status, 204);
  assert.equal(received.userId, '11111111-1111-4111-8111-111111111111');
  assert.equal(received.shareId, '44444444-4444-4444-8444-444444444444');
});

test('returns an authenticated quality overview', async () => {
  let received;
  const requireAuth = (req, res, next) => { req.user = { id: '11111111-1111-4111-8111-111111111111' }; next(); };
  const evaluationService = { async overview(input) { received = input; return { artifacts: 4, evaluated: 3, faithfulnessScore: 92 }; } };
  const baseUrl = await startApp(undefined, { requireAuth, evaluationService });
  const response = await fetch(`${baseUrl}/api/quality`, { headers: { authorization: 'Bearer test-token' } });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(received.userId, '11111111-1111-4111-8111-111111111111');
  assert.equal(body.overview.faithfulnessScore, 92);
});

test('runs evaluations only for an authenticated workspace', async () => {
  let received;
  const requireAuth = (req, res, next) => { req.user = { id: '11111111-1111-4111-8111-111111111111' }; next(); };
  const evaluationService = { async run(input) { received = input; return { status: 200, evaluated: 5 }; } };
  const baseUrl = await startApp(undefined, { requireAuth, evaluationService });
  const response = await fetch(`${baseUrl}/api/evaluations/run`, { method: 'POST', headers: { authorization: 'Bearer test-token' } });
  assert.equal(response.status, 200);
  assert.equal(received.userId, '11111111-1111-4111-8111-111111111111');
  assert.equal((await response.json()).evaluated, 5);
});
