const dotenv = require('dotenv');

dotenv.config({ path: '.env' });

const { createApp } = require('./src/app');
const { createRequireAuth } = require('./src/auth');
const { createDocumentAI } = require('./src/documents/document-ai');
const { createDocumentService } = require('./src/documents/document-service');
const { createAnthropicSummarizer } = require('./src/summarizer');
const { createSupabaseAdmin } = require('./src/supabase');

const port = Number(process.env.PORT || 3001);
const summarize = createAnthropicSummarizer();
const supabaseAdmin = createSupabaseAdmin();
const requireAuth = createRequireAuth(supabaseAdmin);
const documentAI = createDocumentAI(supabaseAdmin);
const documentService = createDocumentService(supabaseAdmin, {
  generateSummaryJob: documentAI?.generateSummaryJob,
});
const app = createApp({ summarize, requireAuth, documentService, documentAI });

const server = app.listen(port, () => {
  console.log(`Briefly API listening on port ${port}`);
});

const shutdown = (signal) => {
  console.log(`${signal} received. Closing HTTP server.`);
  server.close(() => process.exit(0));
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
