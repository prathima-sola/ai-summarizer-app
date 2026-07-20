const mammoth = require('mammoth');
const { normalizeText } = require('./chunker');

const SUPPORTED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
]);
const MAX_EXTRACTED_CHARACTERS = 2_000_000;

async function parsePdf(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
  const pages = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const content = textContent.items
        .filter((item) => 'str' in item)
        .map((item) => item.str)
        .join(' ');
      pages.push({ pageNumber, content: normalizeText(content) });
      page.cleanup();
    }
  } finally {
    await document.destroy();
  }

  return pages;
}

async function parseDocx(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return [{ pageNumber: 1, content: normalizeText(result.value) }];
}

function parsePlainText(buffer) {
  return [{ pageNumber: 1, content: normalizeText(new TextDecoder('utf-8', { fatal: false }).decode(buffer)) }];
}

async function parseDocument(buffer, mimeType) {
  if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
    throw new Error('This file type is not supported.');
  }

  let pages;
  if (mimeType === 'application/pdf') pages = await parsePdf(buffer);
  else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') pages = await parseDocx(buffer);
  else pages = parsePlainText(buffer);

  const characterCount = pages.reduce((total, page) => total + page.content.length, 0);
  if (characterCount === 0 && mimeType === 'application/pdf') throw new Error('This PDF appears scanned. OCR processing is required before Briefly can read it.');
  if (characterCount === 0) throw new Error('No readable text was found in this document.');
  if (characterCount > MAX_EXTRACTED_CHARACTERS) {
    throw new Error('This document contains too much text for the current workspace limit.');
  }

  const readablePages = pages.filter((page) => page.content.length >= 20).length;
  const textCoverage = Math.round((readablePages / pages.length) * 100);
  return { pages, characterCount, textCoverage, requiresOcr: mimeType === 'application/pdf' && textCoverage < 80 };
}

module.exports = {
  MAX_EXTRACTED_CHARACTERS,
  SUPPORTED_MIME_TYPES,
  parseDocument,
};
