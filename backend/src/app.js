const crypto = require('node:crypto');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const MODES = new Set(['executive', 'key-points', 'study-notes', 'action-items']);
const LENGTHS = new Set(['concise', 'balanced', 'detailed']);
const AUDIENCES = new Set(['general', 'beginner', 'expert']);
const MAX_TEXT_LENGTH = 20_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeLogPath(path) {
  return path.replace(/^\/api\/public\/shares\/[^/]+$/, '/api/public/shares/:token');
}

function validateDocumentSummaryOptions(body = {}) {
  const mode = body.mode || 'executive';
  const detail = body.detail || 'balanced';
  const audience = body.audience || 'general';
  if (!MODES.has(mode)) return { error: 'Choose a supported brief format.' };
  if (!LENGTHS.has(detail)) return { error: 'Choose a supported detail level.' };
  if (!AUDIENCES.has(audience)) return { error: 'Choose a supported audience.' };
  return { value: { mode, detail, audience } };
}

function parseAllowedOrigins(value) {
  const defaults = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://ai-summarizer-app-zeta.vercel.app',
  ];

  return new Set(
    (value ? value.split(',') : defaults)
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function validateSummaryRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Send a JSON object with text and summary options.' };
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const mode = body.mode || 'executive';
  const length = body.length || 'balanced';
  const audience = body.audience || 'general';

  if (!text) return { error: 'Add text before generating a brief.' };
  if (text.length > MAX_TEXT_LENGTH) {
    return { error: `Keep the source under ${MAX_TEXT_LENGTH.toLocaleString('en-US')} characters.` };
  }
  if (!MODES.has(mode)) return { error: 'Choose a supported brief format.' };
  if (!LENGTHS.has(length)) return { error: 'Choose a supported detail level.' };
  if (!AUDIENCES.has(audience)) return { error: 'Choose a supported audience.' };

  return { value: { text, mode, length, audience } };
}

function createApp({ summarize, requireAuth, documentService, documentAI, comparisonAI, shareService, evaluationService, healthCheck, logger = console, allowedOrigins = process.env.ALLOWED_ORIGINS } = {}) {
  if (typeof summarize !== 'function') {
    throw new TypeError('createApp requires a summarize function.');
  }

  const app = express();
  const origins = parseAllowedOrigins(allowedOrigins);

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    req.requestId = req.get('x-request-id') || crypto.randomUUID();
    req.startedAt = process.hrtime.bigint();
    res.set('x-request-id', req.requestId);
    res.set('cache-control', 'no-store');
    res.on('finish', () => {
      if (req.path === '/health') return;
      const durationMs = Number(process.hrtime.bigint() - req.startedAt) / 1_000_000;
      logger.log(JSON.stringify({
        level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
        event: 'http_request',
        requestId: req.requestId,
        cfRay: req.get('cf-ray') || null,
        method: req.method,
        path: safeLogPath(req.path),
        status: res.statusCode,
        durationMs: Math.round(durationMs),
      }));
    });
    next();
  });
  app.use(cors({
    origin(origin, callback) {
      if (!origin || origins.has(origin)) return callback(null, true);
      return callback(new Error('Origin not allowed'));
    },
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
  }));
  app.use(express.json({ limit: '128kb' }));

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_MAX || 20),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'You reached the preview limit. Try again in 15 minutes.' },
  });

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'briefly-api',
      release: process.env.RENDER_GIT_COMMIT?.slice(0, 7) || process.env.APP_RELEASE || 'local',
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  app.get('/ready', async (req, res) => {
    if (typeof healthCheck !== 'function') {
      return res.status(503).json({ status: 'unavailable', checks: { database: 'not_configured' } });
    }
    try {
      const checks = await healthCheck();
      return res.json({ status: 'ready', service: 'briefly-api', checks });
    } catch (error) {
      logger.error(JSON.stringify({
        level: 'error',
        event: 'readiness_failed',
        requestId: req.requestId,
        message: error instanceof Error ? error.message : 'Readiness check failed.',
      }));
      return res.status(503).json({ status: 'unavailable', checks: { database: 'failed' }, requestId: req.requestId });
    }
  });

  const handleSummary = async (req, res, next) => {
    const validation = validateSummaryRequest(req.body);
    if (validation.error) return res.status(400).json({ error: validation.error });

    try {
      const summary = await summarize(validation.value);
      return res.status(201).json({
        summary,
        meta: {
          ...validation.value,
          text: undefined,
          characterCount: validation.value.text.length,
          generatedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      error.requestId = req.requestId;
      return next(error);
    }
  };

  app.post('/api/summaries', limiter, handleSummary);
  app.post('/summarize', limiter, handleSummary);

  app.get('/api/public/shares/:token', limiter, async (req, res, next) => {
    if (!shareService) return res.status(503).json({ error: 'Shared briefs have not been configured.' });
    try {
      const result = await shareService.resolve(req.params.token);
      if (result.error) return res.status(result.status).json({ error: result.error });
      return res.status(result.status).json({ share: result.share });
    } catch (error) {
      return next(error);
    }
  });

  if (requireAuth) {
    app.post('/api/documents/:documentId/ingest', limiter, requireAuth, async (req, res, next) => {
      if (!documentService) {
        return res.status(503).json({ error: 'The document workspace has not been configured.' });
      }
      if (!UUID_PATTERN.test(req.params.documentId)) {
        return res.status(400).json({ error: 'Provide a valid document ID.' });
      }

      try {
        const result = await documentService.enqueue({
          documentId: req.params.documentId,
          userId: req.user.id,
        });
        if (result.error) return res.status(result.status).json({ error: result.error });
        return res.status(result.status).json({ job: result.job, duplicate: result.duplicate });
      } catch (error) {
        return next(error);
      }
    });

    app.post('/api/documents/:documentId/summaries', limiter, requireAuth, async (req, res, next) => {
      if (!documentAI) return res.status(503).json({ error: 'Document AI has not been configured.' });
      if (!UUID_PATTERN.test(req.params.documentId)) return res.status(400).json({ error: 'Provide a valid document ID.' });
      const validation = validateDocumentSummaryOptions(req.body);
      if (validation.error) return res.status(400).json({ error: validation.error });
      try {
        const result = await documentAI.enqueueSummary({
          documentId: req.params.documentId,
          userId: req.user.id,
          options: validation.value,
        });
        if (result.error) return res.status(result.status).json({ error: result.error });
        return res.status(result.status).json({ job: result.job });
      } catch (error) {
        return next(error);
      }
    });

    app.post('/api/documents/:documentId/questions', limiter, requireAuth, async (req, res, next) => {
      if (!documentAI) return res.status(503).json({ error: 'Document AI has not been configured.' });
      if (!UUID_PATTERN.test(req.params.documentId)) return res.status(400).json({ error: 'Provide a valid document ID.' });
      const question = typeof req.body.question === 'string' ? req.body.question.trim() : '';
      if (question.length < 3 || question.length > 2_000) {
        return res.status(400).json({ error: 'Ask a question between 3 and 2,000 characters.' });
      }
      if (req.body.conversationId && !UUID_PATTERN.test(req.body.conversationId)) {
        return res.status(400).json({ error: 'Provide a valid conversation ID.' });
      }
      try {
        const result = await documentAI.answerQuestion({
          documentId: req.params.documentId,
          userId: req.user.id,
          question,
          conversationId: req.body.conversationId,
        });
        if (result.error) return res.status(result.status).json({ error: result.error });
        return res.status(result.status).json({ conversationId: result.conversationId, answer: result.answer });
      } catch (error) {
        return next(error);
      }
    });

    app.post('/api/comparisons', limiter, requireAuth, async (req, res, next) => {
      if (!comparisonAI) return res.status(503).json({ error: 'Document comparison has not been configured.' });
      const baseDocumentId = typeof req.body.baseDocumentId === 'string' ? req.body.baseDocumentId : '';
      const targetDocumentId = typeof req.body.targetDocumentId === 'string' ? req.body.targetDocumentId : '';
      if (!UUID_PATTERN.test(baseDocumentId) || !UUID_PATTERN.test(targetDocumentId)) {
        return res.status(400).json({ error: 'Choose two valid documents.' });
      }
      if (baseDocumentId === targetDocumentId) return res.status(400).json({ error: 'Choose two different documents.' });
      try {
        const result = await comparisonAI.enqueueComparison({ baseDocumentId, targetDocumentId, userId: req.user.id });
        if (result.error) return res.status(result.status).json({ error: result.error });
        return res.status(result.status).json({ job: result.job });
      } catch (error) {
        return next(error);
      }
    });

    app.get('/api/shares', limiter, requireAuth, async (req, res, next) => {
      if (!shareService) return res.status(503).json({ error: 'Shared briefs have not been configured.' });
      const resourceType = req.query.resourceType;
      const resourceId = req.query.resourceId;
      if (!['summary', 'comparison'].includes(resourceType) || !UUID_PATTERN.test(resourceId || '')) {
        return res.status(400).json({ error: 'Choose a valid brief or comparison.' });
      }
      try {
        const links = await shareService.list({ resourceType, resourceId, userId: req.user.id });
        return res.json({ links });
      } catch (error) {
        return next(error);
      }
    });

    app.post('/api/shares', limiter, requireAuth, async (req, res, next) => {
      if (!shareService) return res.status(503).json({ error: 'Shared briefs have not been configured.' });
      const resourceType = req.body.resourceType;
      const resourceId = req.body.resourceId;
      if (!['summary', 'comparison'].includes(resourceType) || !UUID_PATTERN.test(resourceId || '')) {
        return res.status(400).json({ error: 'Choose a valid brief or comparison.' });
      }
      try {
        const result = await shareService.create({ resourceType, resourceId, userId: req.user.id });
        if (result.error) return res.status(result.status).json({ error: result.error });
        return res.status(result.status).json({ link: result.link, token: result.token });
      } catch (error) {
        return next(error);
      }
    });

    app.delete('/api/shares/:shareId', limiter, requireAuth, async (req, res, next) => {
      if (!shareService) return res.status(503).json({ error: 'Shared briefs have not been configured.' });
      if (!UUID_PATTERN.test(req.params.shareId)) return res.status(400).json({ error: 'Provide a valid share link ID.' });
      try {
        const result = await shareService.revoke({ shareId: req.params.shareId, userId: req.user.id });
        if (result.error) return res.status(result.status).json({ error: result.error });
        return res.status(204).end();
      } catch (error) {
        return next(error);
      }
    });

    app.get('/api/quality', limiter, requireAuth, async (req, res, next) => {
      if (!evaluationService) return res.status(503).json({ error: 'Quality evaluation has not been configured.' });
      try {
        const overview = await evaluationService.overview({ userId: req.user.id });
        return res.json({ overview });
      } catch (error) {
        return next(error);
      }
    });

    app.post('/api/evaluations/run', limiter, requireAuth, async (req, res, next) => {
      if (!evaluationService) return res.status(503).json({ error: 'Quality evaluation has not been configured.' });
      try {
        const result = await evaluationService.run({ userId: req.user.id });
        return res.status(result.status).json({ evaluated: result.evaluated });
      } catch (error) {
        return next(error);
      }
    });
  }

  app.use((req, res) => {
    res.status(404).json({ error: 'Route not found.' });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);

    const status = error.type === 'entity.too.large' ? 413 : 500;
    const message = status === 413
      ? 'The request is too large.'
      : 'The request could not be completed. Try again.';

    logger.error(JSON.stringify({
      level: 'error',
      event: 'request_failed',
      requestId: req.requestId,
      cfRay: req.get('cf-ray') || null,
      method: req.method,
      path: safeLogPath(req.path),
      status,
      message: error.message,
    }));

    return res.status(status).json({ error: message, requestId: req.requestId });
  });

  return app;
}

module.exports = {
  MAX_TEXT_LENGTH,
  createApp,
  validateSummaryRequest,
  validateDocumentSummaryOptions,
};
