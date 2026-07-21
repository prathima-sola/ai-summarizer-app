const { createWorker, OEM } = require('tesseract.js');
const english = require('@tesseract.js-data/eng');

async function createOcrSession() {
  const worker = await createWorker(english.code, OEM.LSTM_ONLY, {
    langPath: english.langPath,
    gzip: english.gzip,
    cacheMethod: 'none',
  });

  return {
    async recognize(image) {
      const result = await worker.recognize(image);
      return {
        text: result.data.text || '',
        confidence: Number.isFinite(result.data.confidence) ? result.data.confidence : null,
      };
    },
    async terminate() {
      await worker.terminate();
    },
  };
}

module.exports = { createOcrSession };
