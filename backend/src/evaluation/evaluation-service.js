const {
  EVALUATOR_VERSION,
  PRICING_VERSION,
  estimateCostUsd,
  evaluateComparison,
  evaluateSummary,
} = require('./evaluator');

function average(values) {
  const available = values.filter(Number.isFinite);
  return available.length ? Math.round(available.reduce((sum, value) => sum + value, 0) / available.length) : null;
}

function percentile(values, percentileValue) {
  const available = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!available.length) return null;
  return available[Math.min(available.length - 1, Math.ceil((percentileValue / 100) * available.length) - 1)];
}

function evaluationRow(artifactType, artifact, result) {
  return {
    user_id: artifact.user_id,
    artifact_type: artifactType,
    summary_id: artifactType === 'summary' ? artifact.id : null,
    comparison_id: artifactType === 'comparison' ? artifact.id : null,
    faithfulness_score: result.faithfulnessScore,
    citation_correctness_score: result.citationCorrectnessScore,
    coverage_score: result.coverageScore,
    passed: result.passed,
    details: {
      ...result.details,
      artifactTitle: artifactType === 'summary' ? artifact.structured_content?.brief_title : artifact.title,
    },
    source_model: artifact.model,
    prompt_version: artifact.prompt_version,
    input_tokens: artifact.input_tokens,
    output_tokens: artifact.output_tokens,
    latency_ms: artifact.latency_ms,
    estimated_cost_usd: estimateCostUsd(artifact.model, artifact.input_tokens, artifact.output_tokens),
    pricing_version: PRICING_VERSION,
    evaluator_version: EVALUATOR_VERSION,
  };
}

function createEvaluationService(supabaseAdmin) {
  if (!supabaseAdmin) return null;

  async function run({ userId }) {
    const [summaryResult, comparisonResult] = await Promise.all([
      supabaseAdmin.from('summaries').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100),
      supabaseAdmin.from('comparisons').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100),
    ]);
    if (summaryResult.error) throw summaryResult.error;
    if (comparisonResult.error) throw comparisonResult.error;
    const rows = [];

    for (const summary of summaryResult.data || []) {
      const { data: pages, error } = await supabaseAdmin.from('document_pages').select('page_number, content').eq('document_id', summary.document_id).order('page_number');
      if (error) throw error;
      rows.push(evaluationRow('summary', summary, evaluateSummary(summary, pages || [])));
    }

    for (const comparison of comparisonResult.data || []) {
      const documentIds = [comparison.base_document_id, comparison.target_document_id];
      const { data: pages, error } = await supabaseAdmin.from('document_pages').select('document_id, page_number, content').in('document_id', documentIds).order('page_number');
      if (error) throw error;
      const pagesByDocument = new Map(documentIds.map((documentId) => [documentId, (pages || []).filter((page) => page.document_id === documentId)]));
      rows.push(evaluationRow('comparison', comparison, evaluateComparison(comparison, pagesByDocument)));
    }

    const summaryRows = rows.filter((row) => row.artifact_type === 'summary');
    const comparisonRows = rows.filter((row) => row.artifact_type === 'comparison');
    if (summaryRows.length) {
      const { error } = await supabaseAdmin.from('evaluation_results').upsert(summaryRows, { onConflict: 'summary_id,evaluator_version' });
      if (error) throw error;
    }
    if (comparisonRows.length) {
      const { error } = await supabaseAdmin.from('evaluation_results').upsert(comparisonRows, { onConflict: 'comparison_id,evaluator_version' });
      if (error) throw error;
    }
    return { status: 200, evaluated: rows.length };
  }

  async function overview({ userId }) {
    const [evaluationsResult, summariesResult, comparisonsResult, failuresResult] = await Promise.all([
      supabaseAdmin.from('evaluation_results').select('*').eq('user_id', userId).eq('evaluator_version', EVALUATOR_VERSION).order('created_at', { ascending: false }).limit(100),
      supabaseAdmin.from('summaries').select('id, model, prompt_version, input_tokens, output_tokens, latency_ms').eq('user_id', userId).limit(100),
      supabaseAdmin.from('comparisons').select('id, model, prompt_version, input_tokens, output_tokens, latency_ms').eq('user_id', userId).limit(100),
      supabaseAdmin.from('processing_jobs').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'failed'),
    ]);
    if (evaluationsResult.error || summariesResult.error || comparisonsResult.error || failuresResult.error) {
      throw evaluationsResult.error || summariesResult.error || comparisonsResult.error || failuresResult.error;
    }
    const artifacts = [...(summariesResult.data || []), ...(comparisonsResult.data || [])];
    const evaluations = evaluationsResult.data || [];
    const latencies = artifacts.map((artifact) => artifact.latency_ms).filter(Number.isFinite);
    const costs = artifacts.map((artifact) => estimateCostUsd(artifact.model, artifact.input_tokens, artifact.output_tokens)).filter(Number.isFinite);
    return {
      artifacts: artifacts.length,
      evaluated: evaluations.length,
      passed: evaluations.filter((evaluation) => evaluation.passed).length,
      failedJobs: failuresResult.count || 0,
      faithfulnessScore: average(evaluations.map((evaluation) => evaluation.faithfulness_score)),
      citationCorrectnessScore: average(evaluations.map((evaluation) => evaluation.citation_correctness_score)),
      coverageScore: average(evaluations.map((evaluation) => evaluation.coverage_score)),
      averageLatencyMs: average(latencies),
      p95LatencyMs: percentile(latencies, 95),
      inputTokens: artifacts.reduce((sum, artifact) => sum + (artifact.input_tokens || 0), 0),
      outputTokens: artifacts.reduce((sum, artifact) => sum + (artifact.output_tokens || 0), 0),
      estimatedCostUsd: Number(costs.reduce((sum, value) => sum + value, 0).toFixed(6)),
      evaluatorVersion: EVALUATOR_VERSION,
      pricingVersion: PRICING_VERSION,
      recent: evaluations.slice(0, 20),
    };
  }

  return { overview, run };
}

module.exports = { createEvaluationService };
