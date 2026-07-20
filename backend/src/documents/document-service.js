const { chunkPages } = require('./chunker');
const { parseDocument } = require('./parser');

function batch(items, size) {
  const batches = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function createDocumentService(supabaseAdmin, { generateSummaryJob } = {}) {
  if (!supabaseAdmin) return null;

  async function enqueue({ documentId, userId }) {
    const { data: document, error: documentError } = await supabaseAdmin
      .from('documents')
      .select('id, user_id, status')
      .eq('id', documentId)
      .eq('user_id', userId)
      .maybeSingle();

    if (documentError) throw documentError;
    if (!document) return { status: 404, error: 'Document not found.' };

    const { data: activeJob, error: activeJobError } = await supabaseAdmin
      .from('processing_jobs')
      .select('id, status')
      .eq('document_id', documentId)
      .in('status', ['queued', 'processing'])
      .maybeSingle();

    if (activeJobError) throw activeJobError;
    if (activeJob) return { status: 202, job: activeJob, duplicate: true };

    const { data: job, error: jobError } = await supabaseAdmin
      .from('processing_jobs')
      .insert({ document_id: documentId, user_id: userId, job_type: 'parse' })
      .select('id, status, progress')
      .single();

    if (jobError) throw jobError;
    await supabaseAdmin.from('documents').update({ status: 'queued', error_message: null }).eq('id', documentId);
    return { status: 202, job, duplicate: false };
  }

  async function processParseJob(job) {
    const { data: document, error: documentError } = await supabaseAdmin
      .from('documents')
      .select('*')
      .eq('id', job.document_id)
      .single();
    if (documentError) throw documentError;

    await Promise.all([
      supabaseAdmin.from('documents').update({ status: 'processing', error_message: null }).eq('id', document.id),
      supabaseAdmin.from('processing_jobs').update({ progress: 10 }).eq('id', job.id),
    ]);

    const { data: file, error: downloadError } = await supabaseAdmin.storage
      .from('documents')
      .download(document.storage_path);
    if (downloadError) throw downloadError;

    const parsed = await parseDocument(Buffer.from(await file.arrayBuffer()), document.mime_type);
    const chunks = chunkPages(parsed.pages);

    await supabaseAdmin.from('processing_jobs').update({ progress: 45 }).eq('id', job.id);
    await supabaseAdmin.from('document_pages').delete().eq('document_id', document.id);
    await supabaseAdmin.from('document_chunks').delete().eq('document_id', document.id);

    const pageRows = parsed.pages.map((page) => ({
      document_id: document.id,
      page_number: page.pageNumber,
      content: page.content,
    }));
    const { error: pageError } = await supabaseAdmin.from('document_pages').insert(pageRows);
    if (pageError) throw pageError;

    for (const chunkBatch of batch(chunks, 250)) {
      const { error: chunkError } = await supabaseAdmin.from('document_chunks').insert(
        chunkBatch.map((chunk) => ({ ...chunk, document_id: document.id })),
      );
      if (chunkError) throw chunkError;
    }

    await Promise.all([
      supabaseAdmin.from('documents').update({
        status: 'ready',
        page_count: parsed.pages.length,
        character_count: parsed.characterCount,
        text_coverage: parsed.textCoverage,
        requires_ocr: parsed.requiresOcr,
        error_message: null,
      }).eq('id', document.id),
      supabaseAdmin.from('processing_jobs').update({
        status: 'completed',
        progress: 100,
        completed_at: new Date().toISOString(),
        error_message: null,
      }).eq('id', job.id),
    ]);

    const { error: embeddingJobError } = await supabaseAdmin.from('processing_jobs').insert({
      document_id: document.id,
      user_id: document.user_id,
      job_type: 'embed',
    });
    if (embeddingJobError) {
      console.warn(JSON.stringify({ level: 'warn', documentId: document.id, message: embeddingJobError.message }));
    }
  }

  async function processEmbeddingJob(job) {
    let remaining = 1;
    let embedded = 0;
    let rounds = 0;
    while (remaining > 0 && rounds < 100) {
      const { data, error } = await supabaseAdmin.functions.invoke('embed-document', {
        body: { documentId: job.document_id, limit: 40 },
      });
      if (error) throw error;
      embedded += Number(data?.embedded || 0);
      remaining = Number(data?.remaining || 0);
      rounds += 1;
      const progress = remaining === 0 ? 100 : Math.min(95, Math.max(5, Math.round((embedded / (embedded + remaining)) * 100)));
      await supabaseAdmin.from('processing_jobs').update({ progress }).eq('id', job.id);
    }
    if (remaining > 0) throw new Error('Document indexing exceeded the worker batch limit.');

    await supabaseAdmin.from('processing_jobs').update({
      status: 'completed',
      progress: 100,
      completed_at: new Date().toISOString(),
      error_message: null,
    }).eq('id', job.id);
  }

  async function failJob(job, error) {
    const safeMessage = error instanceof Error ? error.message.slice(0, 500) : 'Document processing failed.';
    const willRetry = job.attempts < 3;
    const updates = [
      supabaseAdmin.from('processing_jobs').update({
        status: willRetry ? 'queued' : 'failed',
        progress: 0,
        error_message: safeMessage,
        completed_at: willRetry ? null : new Date().toISOString(),
      }).eq('id', job.id),
    ];
    if (job.job_type === 'parse') {
      updates.push(supabaseAdmin.from('documents').update({ status: willRetry ? 'queued' : 'failed', error_message: safeMessage }).eq('id', job.document_id));
    }
    await Promise.all(updates);
  }

  async function processNextJob() {
    const { data, error } = await supabaseAdmin.rpc('claim_processing_job');
    if (error) throw error;
    const job = Array.isArray(data) ? data[0] : data;
    if (!job) return false;

    try {
      if (job.job_type === 'parse') await processParseJob(job);
      else if (job.job_type === 'embed') await processEmbeddingJob(job);
      else if (job.job_type === 'summarize' && generateSummaryJob) await generateSummaryJob(job);
      else throw new Error(`Unsupported worker job type: ${job.job_type}`);
    } catch (processingError) {
      await failJob(job, processingError);
      throw processingError;
    }
    return true;
  }

  return { enqueue, processNextJob };
}

module.exports = { createDocumentService };
