function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function createDocumentWorker(documentService, {
  pollInterval = 2_000,
  sleep = wait,
  logger = console,
} = {}) {
  if (!documentService) throw new Error('A document service is required to start the worker.');

  let running = false;
  let loopPromise = null;

  async function run() {
    logger.log('Briefly document worker started.');
    while (running) {
      try {
        const processed = await documentService.processNextJob();
        if (!processed && running) await sleep(pollInterval);
      } catch (error) {
        logger.error(JSON.stringify({
          level: 'error',
          worker: 'documents',
          message: error instanceof Error ? error.message : 'Document processing failed.',
        }));
        if (running) await sleep(pollInterval);
      }
    }
  }

  function start() {
    if (running) return;
    running = true;
    loopPromise = run();
  }

  async function stop() {
    running = false;
    await loopPromise;
  }

  return { start, stop };
}

module.exports = { createDocumentWorker };
