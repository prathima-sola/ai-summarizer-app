const dotenv = require('dotenv');

dotenv.config({ path: '.env' });

const { createDocumentService } = require('./src/documents/document-service');
const { createDocumentAI } = require('./src/documents/document-ai');
const { createDocumentWorker } = require('./src/documents/worker-runtime');
const { createSupabaseAdmin } = require('./src/supabase');

const pollInterval = Number(process.env.WORKER_POLL_INTERVAL_MS || 2_000);
const supabaseAdmin = createSupabaseAdmin();
const documentAI = createDocumentAI(supabaseAdmin);
const documentService = createDocumentService(supabaseAdmin, {
  generateSummaryJob: documentAI?.generateSummaryJob,
});

if (!documentService) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before starting the worker.');
  process.exit(1);
}

const documentWorker = createDocumentWorker(documentService, { pollInterval });

async function shutdown() {
  await documentWorker.stop();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

documentWorker.start();
