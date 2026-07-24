const assert = require('node:assert/strict');
const test = require('node:test');

const {
  briefToText,
  createDocumentAI,
  selectCoverageChunks,
  validateBrief,
  validateCitations,
} = require('../src/documents/document-ai');

function queryResult(result) {
  const query = {
    select() { return query; },
    eq() { return query; },
    in() { return query; },
    gte() { return query; },
    order() { return query; },
    limit() { return query; },
    maybeSingle() { return Promise.resolve(result); },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
  };
  return query;
}

function queuedSupabase(resultsByTable) {
  return {
    from(table) {
      const result = resultsByTable[table]?.shift();
      assert.ok(result, `Unexpected ${table} query`);
      return queryResult(result);
    },
  };
}

test('samples long documents from beginning through end', () => {
  const chunks = Array.from({ length: 10 }, (_, index) => ({ id: index + 1, content: 'x'.repeat(100), page_number: index + 1 }));
  const selected = selectCoverageChunks(chunks, 320);
  assert.equal(selected[0].id, 1);
  assert.equal(selected.at(-1).id, 10);
  assert.ok(selected.length >= 2);
  assert.ok(selected.length < chunks.length);
});

test('renders structured briefs with page references', () => {
  const text = briefToText({
    brief_title: 'Decision brief',
    overview: 'The team approved the proposal.',
    sections: [{ heading: 'Decision', points: [{ text: 'Ship the pilot.', page_numbers: [2, 4] }] }],
    uncertainties: ['The source does not state the launch date.'],
  });
  assert.match(text, /Ship the pilot\. \[pages 2, 4\]/);
  assert.match(text, /Open questions and uncertainty/);
});

test('rejects citations that do not appear on the claimed page', () => {
  const chunks = [{ page_number: 3, content: 'The board approved the pilot on Friday.' }];
  assert.doesNotThrow(() => validateCitations([{ page_number: 3, quote: 'approved the pilot' }], chunks));
  assert.throws(() => validateCitations([{ page_number: 2, quote: 'approved the pilot' }], chunks), /could not verify/);
});

test('requires a valid source page for every brief point', () => {
  const chunks = [{ page_number: 1, content: 'The proposal describes a six-week pilot.' }];
  assert.throws(() => validateBrief({
    brief_title: 'Pilot', overview: 'A pilot plan.', citations: [],
    sections: [{ heading: 'Plan', points: [{ text: 'Run a pilot.', page_numbers: [] }] }], uncertainties: [],
  }, chunks), /without a valid source page/);
});

test('reuses an exact saved question without calling the model', async () => {
  const conversationId = '33333333-3333-4333-8333-333333333333';
  const supabase = queuedSupabase({
    documents: [{ data: { id: 'doc-1', status: 'ready' }, error: null }],
    conversations: [{ data: [{ id: conversationId }], error: null }],
    messages: [
      { count: 2, error: null },
      { data: [{ conversation_id: conversationId, created_at: '2026-07-23T10:00:00.000Z' }], error: null },
      { data: [{ content: 'The deadline is Friday.', citations: [{ page_number: 2, quote: 'deadline is Friday' }] }], error: null },
    ],
  });
  const documentAI = createDocumentAI(supabase, {
    client: { messages: { create: async () => { throw new Error('model must not run'); } } },
  });

  const result = await documentAI.answerQuestion({
    documentId: 'doc-1',
    userId: 'user-1',
    question: 'When is the deadline?',
  });

  assert.equal(result.status, 200);
  assert.equal(result.cached, true);
  assert.equal(result.answer.answer, 'The deadline is Friday.');
  assert.equal(result.usage.remaining, 3);
});

test('blocks a sixth new document question before calling the model', async () => {
  const supabase = queuedSupabase({
    documents: [{ data: { id: 'doc-1', status: 'ready' }, error: null }],
    conversations: [{ data: [{ id: 'conversation-1' }], error: null }],
    messages: [
      { count: 5, error: null },
      { data: [], error: null },
    ],
  });
  const documentAI = createDocumentAI(supabase, {
    client: { messages: { create: async () => { throw new Error('model must not run'); } } },
  });

  const result = await documentAI.answerQuestion({
    documentId: 'doc-1',
    userId: 'user-1',
    question: 'What changed?',
  });

  assert.equal(result.status, 429);
  assert.equal(result.usage.remaining, 0);
});
