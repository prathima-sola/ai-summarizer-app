const assert = require('node:assert/strict');
const test = require('node:test');

const { briefToText, selectCoverageChunks, validateBrief, validateCitations } = require('../src/documents/document-ai');

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
