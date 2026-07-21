const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { evaluateSummary } = require('../src/evaluation/evaluator');

const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'evals', 'fixtures.json'), 'utf8'));
let passed = 0;

for (const fixture of fixtures) {
  const result = evaluateSummary(fixture.artifact, fixture.pages);
  try {
    for (const [key, expected] of Object.entries(fixture.expected)) assert.equal(result[key], expected);
    console.log(`PASS ${fixture.name}`);
    passed += 1;
  } catch (error) {
    console.error(`FAIL ${fixture.name}: ${error.message}`);
  }
}

console.log(`${passed}/${fixtures.length} evaluation fixtures passed`);
if (passed !== fixtures.length) process.exitCode = 1;
