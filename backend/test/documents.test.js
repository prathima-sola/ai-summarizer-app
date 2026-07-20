const assert = require('node:assert/strict');
const test = require('node:test');

const { chunkPages, normalizeText } = require('../src/documents/chunker');
const { parseDocument } = require('../src/documents/parser');

test('normalizes extracted document text', () => {
  assert.equal(normalizeText('One\t\tline.\n\n\n\nTwo   words.'), 'One line.\n\nTwo words.');
});

test('keeps chunks attached to their source page', () => {
  const pages = [
    { pageNumber: 1, content: `${'First page sentence. '.repeat(80)}End.` },
    { pageNumber: 2, content: 'Second page contains a short conclusion.' },
  ];
  const chunks = chunkPages(pages, { chunkSize: 400, overlap: 60 });

  assert.ok(chunks.length > 2);
  assert.equal(chunks[0].page_number, 1);
  assert.equal(chunks.at(-1).page_number, 2);
  assert.deepEqual(chunks.map((chunk) => chunk.chunk_index), chunks.map((_, index) => index));
});

test('parses UTF-8 text documents', async () => {
  const result = await parseDocument(Buffer.from('A readable source with a useful conclusion.'), 'text/plain');
  assert.equal(result.pages.length, 1);
  assert.equal(result.pages[0].pageNumber, 1);
  assert.equal(result.textCoverage, 100);
  assert.equal(result.requiresOcr, false);
  assert.match(result.pages[0].content, /useful conclusion/);
});

test('rejects unsupported file types', async () => {
  await assert.rejects(
    () => parseDocument(Buffer.from('data'), 'image/png'),
    /not supported/,
  );
});
