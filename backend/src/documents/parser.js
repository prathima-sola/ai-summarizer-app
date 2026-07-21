const mammoth = require('mammoth');
const { normalizeText } = require('./chunker');
const { createOcrSession } = require('./ocr');

const SUPPORTED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
]);
const MAX_EXTRACTED_CHARACTERS = 2_000_000;
const MIN_READABLE_PAGE_CHARACTERS = 20;
const DEFAULT_MAX_OCR_PAGES = 25;
const DEFAULT_OCR_RENDER_SCALE = 2;

class DocumentContentError extends Error {
  constructor(message, { ocrStatus } = {}) {
    super(message);
    this.name = 'DocumentContentError';
    this.retryable = false;
    this.ocrStatus = ocrStatus;
  }
}

function positiveNumber(value, fallback, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(number, maximum);
}

async function renderPageAsPng(page, scale) {
  const { createCanvas } = require('@napi-rs/canvas');
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const canvasContext = canvas.getContext('2d');
  canvasContext.fillStyle = '#ffffff';
  canvasContext.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext, viewport }).promise;
  return canvas.toBuffer('image/png');
}

function calculatePdfMetrics(pages, nativeReadablePages, ocrResults) {
  const characterCount = pages.reduce((total, page) => total + page.content.length, 0);
  const readablePages = pages.filter((page) => page.content.length >= MIN_READABLE_PAGE_CHARACTERS).length;
  const textCoverage = pages.length ? Math.round((readablePages / pages.length) * 100) : 0;
  const sparsePageCount = pages.length - nativeReadablePages;
  const successfulResults = ocrResults.filter((result) => result.succeeded);
  const confidences = successfulResults
    .map((result) => result.confidence)
    .filter((confidence) => Number.isFinite(confidence));

  let ocrStatus = 'not_needed';
  if (sparsePageCount > 0 && successfulResults.length === sparsePageCount) ocrStatus = 'completed';
  else if (successfulResults.length > 0) ocrStatus = 'partial';
  else if (sparsePageCount > 0) ocrStatus = 'failed';

  return {
    characterCount,
    textCoverage,
    requiresOcr: textCoverage < 80,
    ocrStatus,
    ocrPageCount: successfulResults.length,
    ocrConfidence: confidences.length
      ? Math.round(confidences.reduce((total, confidence) => total + confidence, 0) / confidences.length)
      : null,
  };
}

async function parsePdf(buffer, {
  maxOcrPages = positiveNumber(process.env.OCR_MAX_PAGES, DEFAULT_MAX_OCR_PAGES, 100),
  ocrRenderScale = positiveNumber(process.env.OCR_RENDER_SCALE, DEFAULT_OCR_RENDER_SCALE, 3),
  onOcrProgress = async () => {},
  createSession = createOcrSession,
} = {}) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
  const document = await loadingTask.promise;
  const pages = [];
  const pageProxies = [];
  const ocrResults = [];
  let ocrSession;

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      pageProxies.push(page);
      const textContent = await page.getTextContent();
      const content = textContent.items
        .filter((item) => 'str' in item)
        .map((item) => item.str)
        .join(' ');
      pages.push({ pageNumber, content: normalizeText(content) });
    }

    const nativeReadablePages = pages.filter((page) => page.content.length >= MIN_READABLE_PAGE_CHARACTERS).length;
    const sparsePages = pages.filter((page) => page.content.length < MIN_READABLE_PAGE_CHARACTERS);
    const eligiblePages = sparsePages.slice(0, Math.floor(maxOcrPages));

    if (eligiblePages.length) {
      ocrSession = await createSession();
      for (let index = 0; index < eligiblePages.length; index += 1) {
        const target = eligiblePages[index];
        await onOcrProgress({ completed: index, total: eligiblePages.length, pageNumber: target.pageNumber });
        try {
          const image = await renderPageAsPng(pageProxies[target.pageNumber - 1], ocrRenderScale);
          const recognized = await ocrSession.recognize(image);
          const content = normalizeText(recognized.text);
          const succeeded = content.length >= MIN_READABLE_PAGE_CHARACTERS;
          if (succeeded && content.length > target.content.length) target.content = content;
          ocrResults.push({ pageNumber: target.pageNumber, succeeded, confidence: recognized.confidence });
        } catch (error) {
          ocrResults.push({ pageNumber: target.pageNumber, succeeded: false, confidence: null });
          console.warn(JSON.stringify({
            level: 'warn',
            pageNumber: target.pageNumber,
            message: error instanceof Error ? error.message : 'OCR page processing failed.',
          }));
        }
        await onOcrProgress({ completed: index + 1, total: eligiblePages.length, pageNumber: target.pageNumber });
      }
    }

    return { pages, ...calculatePdfMetrics(pages, nativeReadablePages, ocrResults) };
  } finally {
    try {
      if (ocrSession) await ocrSession.terminate();
    } finally {
      pageProxies.forEach((page) => page.cleanup());
      await loadingTask.destroy();
    }
  }
}

async function parseDocx(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return [{ pageNumber: 1, content: normalizeText(result.value) }];
}

function parsePlainText(buffer) {
  return [{ pageNumber: 1, content: normalizeText(new TextDecoder('utf-8', { fatal: false }).decode(buffer)) }];
}

async function parseDocument(buffer, mimeType, options = {}) {
  if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
    throw new DocumentContentError('This file type is not supported.');
  }

  if (mimeType === 'application/pdf') {
    const parsed = await parsePdf(buffer, options);
    if (parsed.characterCount === 0) {
      throw new DocumentContentError(
        'OCR could not find readable printed text in this PDF. Try a clearer scan or a text-based PDF.',
        { ocrStatus: 'failed' },
      );
    }
    if (parsed.characterCount > MAX_EXTRACTED_CHARACTERS) {
      throw new DocumentContentError('This document contains too much text for the current workspace limit.');
    }
    return parsed;
  }

  const pages = mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ? await parseDocx(buffer)
    : parsePlainText(buffer);
  const characterCount = pages.reduce((total, page) => total + page.content.length, 0);
  if (characterCount === 0) throw new DocumentContentError('No readable text was found in this document.');
  if (characterCount > MAX_EXTRACTED_CHARACTERS) {
    throw new DocumentContentError('This document contains too much text for the current workspace limit.');
  }

  const readablePages = pages.filter((page) => page.content.length >= MIN_READABLE_PAGE_CHARACTERS).length;
  return {
    pages,
    characterCount,
    textCoverage: Math.round((readablePages / pages.length) * 100),
    requiresOcr: false,
    ocrStatus: 'not_needed',
    ocrPageCount: 0,
    ocrConfidence: null,
  };
}

module.exports = {
  DEFAULT_MAX_OCR_PAGES,
  MAX_EXTRACTED_CHARACTERS,
  MIN_READABLE_PAGE_CHARACTERS,
  SUPPORTED_MIME_TYPES,
  calculatePdfMetrics,
  parseDocument,
};
