const DEFAULT_CHUNK_SIZE = 1_600;
const DEFAULT_OVERLAP = 220;

function normalizeText(value) {
  return value
    .replace(/\u0000/g, '')
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function findBoundary(text, start, targetEnd) {
  if (targetEnd >= text.length) return text.length;
  const minimumEnd = start + Math.floor((targetEnd - start) * 0.6);
  const candidates = [
    text.lastIndexOf('\n', targetEnd),
    text.lastIndexOf('. ', targetEnd),
    text.lastIndexOf('? ', targetEnd),
    text.lastIndexOf('! ', targetEnd),
  ];
  const boundary = Math.max(...candidates);
  return boundary >= minimumEnd ? boundary + 1 : targetEnd;
}

function chunkPages(pages, { chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_OVERLAP } = {}) {
  const chunks = [];
  let chunkIndex = 0;

  for (const page of pages) {
    const content = normalizeText(page.content);
    let start = 0;

    while (start < content.length) {
      const end = findBoundary(content, start, Math.min(start + chunkSize, content.length));
      const chunkContent = content.slice(start, end).trim();

      if (chunkContent) {
        chunks.push({
          page_number: page.pageNumber,
          chunk_index: chunkIndex,
          content: chunkContent,
          token_count: Math.max(1, Math.ceil(chunkContent.length / 4)),
        });
        chunkIndex += 1;
      }

      if (end >= content.length) break;
      const nextStart = Math.max(start + 1, end - overlap);
      start = nextStart;
    }
  }

  return chunks;
}

module.exports = { chunkPages, normalizeText };
