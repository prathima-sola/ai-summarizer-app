const EVALUATOR_VERSION = 'deterministic-grounding-v1';
const PRICING_VERSION = 'anthropic-2026-05-27';
const MODEL_PRICING_PER_MILLION = {
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};
const STOP_WORDS = new Set('a an and are as at be been but by can could did do does for from had has have if in into is it its may might of on or our should that the their them there these they this to was were will with would you your'.split(' '));

function normalize(value = '') {
  return String(value).toLowerCase().replace(/[‐‑‒–—]/g, '-').replace(/\s+/g, ' ').trim();
}

function contentTokens(value) {
  return [...new Set(normalize(value).match(/[a-z0-9]+(?:\.[0-9]+)?%?/g) || [])]
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function numericTokens(value) {
  return [...new Set(normalize(value).match(/\$?\d+(?:[,.]\d+)*%?/g) || [])]
    .map((token) => token.replace(/,/g, ''));
}

function pageContentMap(pages, documentId) {
  const map = new Map();
  for (const page of pages || []) {
    const key = documentId ? `${documentId}:${page.page_number}` : String(page.page_number);
    map.set(key, normalize(`${map.get(key) || ''} ${page.content}`));
  }
  return map;
}

function scoreClaimSupport(claim, sourceText) {
  const claimTokens = contentTokens(claim);
  const sourceTokens = new Set(contentTokens(sourceText));
  const numbersSupported = numericTokens(claim).every((number) => numericTokens(sourceText).includes(number));
  if (!claimTokens.length || !sourceText) return { supported: false, overlap: 0, numbersSupported };
  const matched = claimTokens.filter((token) => sourceTokens.has(token)).length;
  const overlap = matched / claimTokens.length;
  return { supported: numbersSupported && overlap >= 0.35, overlap, numbersSupported };
}

function percentage(passed, total) {
  return total === 0 ? 0 : Math.round((passed / total) * 100);
}

function citationMatches(citation, content) {
  const quote = normalize(citation?.quote);
  return Boolean(content && quote.length >= 8 && content.includes(quote));
}

function estimateCostUsd(model, inputTokens, outputTokens) {
  const pricing = MODEL_PRICING_PER_MILLION[model];
  if (!pricing || !Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) return null;
  return Number((((inputTokens * pricing.input) + (outputTokens * pricing.output)) / 1_000_000).toFixed(6));
}

function evaluateSummary(summary, pages) {
  const pageMap = pageContentMap(pages);
  const citations = Array.isArray(summary.citations) ? summary.citations : [];
  const correctCitations = citations.filter((citation) => citationMatches(citation, pageMap.get(String(citation.page_number)))).length;
  const points = (summary.structured_content?.sections || []).flatMap((section) => section.points || []);
  const pointResults = points.map((point) => {
    const validPages = (point.page_numbers || []).filter((page) => pageMap.has(String(page)));
    const sourceText = validPages.map((page) => pageMap.get(String(page))).join(' ');
    return { text: point.text, validPageCount: validPages.length, ...scoreClaimSupport(point.text, sourceText) };
  });
  const coverageScore = percentage(pointResults.filter((result) => result.validPageCount > 0).length, pointResults.length);
  const faithfulnessScore = percentage(pointResults.filter((result) => result.supported).length, pointResults.length);
  const citationCorrectnessScore = percentage(correctCitations, citations.length);
  return {
    faithfulnessScore,
    citationCorrectnessScore,
    coverageScore,
    passed: faithfulnessScore >= 70 && citationCorrectnessScore >= 90 && coverageScore === 100,
    details: {
      claims: pointResults.length,
      supportedClaims: pointResults.filter((result) => result.supported).length,
      citations: citations.length,
      correctCitations,
      pointResults,
    },
  };
}

function evaluateComparison(comparison, pagesByDocument) {
  const pageMap = new Map();
  for (const [documentId, pages] of pagesByDocument.entries()) {
    for (const [key, content] of pageContentMap(pages, documentId)) pageMap.set(key, content);
  }
  const changes = comparison.structured_content?.changes || [];
  const citations = changes.flatMap((change) => change.citations || []);
  const correctCitations = citations.filter((citation) => citationMatches(citation, pageMap.get(`${citation.document_id}:${citation.page_number}`))).length;
  const changeResults = changes.map((change) => {
    const validCitations = (change.citations || []).filter((citation) => pageMap.has(`${citation.document_id}:${citation.page_number}`));
    const citedDocuments = new Set(validCitations.map((citation) => citation.document_id));
    const requiredDocumentsPresent = change.change_type !== 'changed' || citedDocuments.size >= 2;
    const sourceText = validCitations.map((citation) => pageMap.get(`${citation.document_id}:${citation.page_number}`)).join(' ');
    return { heading: change.heading, validCitationCount: validCitations.length, requiredDocumentsPresent, ...scoreClaimSupport(`${change.heading} ${change.explanation}`, sourceText) };
  });
  const covered = changeResults.filter((result) => result.validCitationCount > 0 && result.requiredDocumentsPresent).length;
  const coverageScore = percentage(covered, changeResults.length);
  const faithfulnessScore = percentage(changeResults.filter((result) => result.supported).length, changeResults.length);
  const citationCorrectnessScore = percentage(correctCitations, citations.length);
  return {
    faithfulnessScore,
    citationCorrectnessScore,
    coverageScore,
    passed: faithfulnessScore >= 70 && citationCorrectnessScore >= 90 && coverageScore === 100,
    details: {
      claims: changeResults.length,
      supportedClaims: changeResults.filter((result) => result.supported).length,
      citations: citations.length,
      correctCitations,
      changeResults,
    },
  };
}

module.exports = {
  EVALUATOR_VERSION,
  MODEL_PRICING_PER_MILLION,
  PRICING_VERSION,
  estimateCostUsd,
  evaluateComparison,
  evaluateSummary,
  scoreClaimSupport,
};
