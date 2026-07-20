const dotenv = require('dotenv');

dotenv.config({ path: '.env' });

const { createDocumentService } = require('./src/documents/document-service');
const { createDocumentAI } = require('./src/documents/document-ai');
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

let running = true;

async function run() {
  console.log('Briefly document worker started.');
  while (running) {
    try {
      const processed = await documentService.processNextJob();
      if (!processed) await new Promise((resolve) => setTimeout(resolve, pollInterval));
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', worker: 'documents', message: error.message }));
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }
}

process.on('SIGTERM', () => { running = false; });
process.on('SIGINT', () => { running = false; });

run();
