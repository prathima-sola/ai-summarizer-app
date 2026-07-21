const assert = require('node:assert/strict');
const test = require('node:test');

const { validateComparison, validateComparisonCitations } = require('../src/documents/comparison-ai');

const baseId = '11111111-1111-4111-8111-111111111111';
const targetId = '22222222-2222-4222-8222-222222222222';
const chunks = new Map([
  [baseId, [{ page_number: 1, content: 'The launch target is September with a budget of ten thousand dollars.' }]],
  [targetId, [{ page_number: 2, content: 'The launch target is November with a budget of fifteen thousand dollars.' }]],
]);

test('accepts a changed finding with verified evidence from both versions', () => {
  const comparison = {
    title: 'Launch plan changes',
    overview: 'The date and budget changed.',
    changes: [{
      change_type: 'changed',
      heading: 'Launch date and budget',
      explanation: 'The launch moved from September to November and the budget increased.',
      significance: 'The team needs a revised delivery and spending plan.',
      citations: [
        { document_id: baseId, page_number: 1, quote: 'launch target is September' },
        { document_id: targetId, page_number: 2, quote: 'launch target is November' },
      ],
    }],
    uncertainties: [],
  };

  assert.doesNotThrow(() => validateComparison(comparison, chunks, baseId, targetId));
});

test('rejects changed findings that cite only one version', () => {
  assert.throws(() => validateComparison({
    title: 'Launch plan changes', overview: 'The date changed.', uncertainties: [],
    changes: [{
      change_type: 'changed', heading: 'Launch date', explanation: 'The date changed.', significance: 'Planning changes.',
      citations: [{ document_id: targetId, page_number: 2, quote: 'launch target is November' }],
    }],
  }, chunks, baseId, targetId), /cite both versions/);
});

test('rejects comparison evidence that does not occur on the cited page', () => {
  assert.throws(() => validateComparisonCitations([
    { document_id: baseId, page_number: 1, quote: 'launch target is December' },
  ], chunks), /could not verify/);
});
