const assert = require('node:assert/strict');
const { test } = require('node:test');

const { estimateCostUsd, evaluateComparison, evaluateSummary, scoreClaimSupport } = require('../src/evaluation/evaluator');

test('scores grounded summary claims and exact citations', () => {
  const pages = [{ page_number: 1, content: 'The launch target is November and the approved budget is $120,000.' }];
  const summary = {
    citations: [{ page_number: 1, quote: 'The launch target is November' }],
    structured_content: { sections: [{ points: [{ text: 'The approved launch target is November with a $120,000 budget.', page_numbers: [1] }] }] },
  };
  const result = evaluateSummary(summary, pages);
  assert.equal(result.faithfulnessScore, 100);
  assert.equal(result.citationCorrectnessScore, 100);
  assert.equal(result.coverageScore, 100);
  assert.equal(result.passed, true);
});

test('rejects a claim whose numbers do not occur in its source pages', () => {
  const result = scoreClaimSupport('The approved budget is $200,000.', 'The approved budget is $120,000.');
  assert.equal(result.numbersSupported, false);
  assert.equal(result.supported, false);
});

test('requires changed comparison findings to cover both documents', () => {
  const baseId = '11111111-1111-4111-8111-111111111111';
  const targetId = '22222222-2222-4222-8222-222222222222';
  const pages = new Map([
    [baseId, [{ page_number: 1, content: 'The launch target is October.' }]],
    [targetId, [{ page_number: 1, content: 'The launch target is November.' }]],
  ]);
  const comparison = { structured_content: { changes: [{
    change_type: 'changed', heading: 'Launch target changed', explanation: 'The launch target moved to November.',
    citations: [{ document_id: targetId, page_number: 1, quote: 'The launch target is November.' }],
  }] } };
  const result = evaluateComparison(comparison, pages);
  assert.equal(result.coverageScore, 0);
  assert.equal(result.passed, false);
});

test('estimates standard API cost from recorded tokens', () => {
  assert.equal(estimateCostUsd('claude-sonnet-4-5', 10_000, 1_000), 0.045);
  assert.equal(estimateCostUsd('unknown-model', 10_000, 1_000), null);
});
