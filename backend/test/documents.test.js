const assert = require('node:assert/strict');
const test = require('node:test');
const { createCanvas } = require('@napi-rs/canvas');
const { PDFDocument } = require('pdf-lib');

const { chunkPages, normalizeText } = require('../src/documents/chunker');
const { calculatePdfMetrics, parseDocument } = require('../src/documents/parser');

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
  assert.equal(result.ocrStatus, 'not_needed');
  assert.match(result.pages[0].content, /useful conclusion/);
});

test('uses OCR to recover printed text from an image-only PDF page', async () => {
  const canvas = createCanvas(1_600, 700);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#111111';
  context.font = 'bold 78px sans-serif';
  context.fillText('SCANNED RELEASE NOTES', 90, 210);
  context.font = '52px sans-serif';
  context.fillText('Launch review approved for Friday.', 90, 340);
  context.fillText('Owners must verify every citation.', 90, 450);

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([800, 350]);
  const image = await pdf.embedPng(canvas.toBuffer('image/png'));
  page.drawImage(image, { x: 0, y: 0, width: 800, height: 350 });

  const result = await parseDocument(Buffer.from(await pdf.save()), 'application/pdf');

  assert.equal(result.pages.length, 1);
  assert.equal(result.pages[0].pageNumber, 1);
  assert.match(result.pages[0].content, /SCANNED RELEASE NOTES/i);
  assert.match(result.pages[0].content, /verify every citation/i);
  assert.equal(result.textCoverage, 100);
  assert.equal(result.requiresOcr, false);
  assert.equal(result.ocrStatus, 'completed');
  assert.equal(result.ocrPageCount, 1);
  assert.ok(result.ocrConfidence >= 70);
});

test('reports partial OCR without hiding unreadable pages', () => {
  const metrics = calculatePdfMetrics([
    { pageNumber: 1, content: 'Native text covers the first document page.' },
    { pageNumber: 2, content: 'OCR recovered the second scanned document page.' },
    { pageNumber: 3, content: '' },
  ], 1, [
    { pageNumber: 2, succeeded: true, confidence: 88 },
    { pageNumber: 3, succeeded: false, confidence: null },
  ]);

  assert.equal(metrics.ocrStatus, 'partial');
  assert.equal(metrics.ocrPageCount, 1);
  assert.equal(metrics.ocrConfidence, 88);
  assert.equal(metrics.textCoverage, 67);
  assert.equal(metrics.requiresOcr, true);
});

test('rejects unsupported file types', async () => {
  await assert.rejects(
    () => parseDocument(Buffer.from('data'), 'image/png'),
    (error) => {
      assert.match(error.message, /not supported/);
      assert.equal(error.retryable, false);
      return true;
    },
  );
});
