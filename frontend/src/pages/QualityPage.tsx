import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { API_URL } from '../lib/api';
import type { QualityOverview } from '../types/database';

function percent(value: number | null) {
  return value === null ? 'Not measured' : `${value}%`;
}

function duration(value: number | null) {
  if (value === null) return 'Not measured';
  return value < 1_000 ? `${value} ms` : `${(value / 1_000).toFixed(1)} s`;
}

function tokens(value: number) {
  return value >= 1_000 ? `${(value / 1_000).toFixed(1)}k` : String(value);
}

export function QualityPage() {
  const { session } = useAuth();
  const [overview, setOverview] = useState<QualityOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const loadOverview = useCallback(async () => {
    if (!session) return;
    try {
      const response = await fetch(`${API_URL}/api/quality`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const body = response.headers.get('content-type')?.includes('application/json') ? await response.json() : {};
      if (!response.ok || !body.overview) throw new Error(body.error || 'Quality metrics could not be loaded.');
      setOverview(body.overview);
      setError('');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Quality metrics could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  const runEvaluation = async () => {
    if (!session || running) return;
    setRunning(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/api/evaluations/run`, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } });
      const body = response.headers.get('content-type')?.includes('application/json') ? await response.json() : {};
      if (!response.ok) throw new Error(body.error || 'Saved outputs could not be evaluated.');
      await loadOverview();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Saved outputs could not be evaluated.');
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <main className="route-loader"><span /><p>Loading quality metrics</p></main>;

  return (
    <main className="quality-page">
      <header><Link to="/app">← Document workspace</Link><strong>Briefly Quality</strong><span>{session?.user.email}</span></header>
      <section className="quality-hero">
        <div><span className="step-label">Evaluation and observability</span><h1>Measure whether the output earns trust.</h1><p>Run reproducible checks against saved source pages, then inspect grounding, citations, latency, failures, tokens, and estimated API cost.</p></div>
        <button type="button" onClick={runEvaluation} disabled={running || !overview?.artifacts}>{running ? 'Evaluating saved outputs' : 'Evaluate saved outputs'}</button>
      </section>

      {error && <p className="quality-alert" role="alert">{error}</p>}

      <section className="quality-summary" aria-label="Quality summary">
        <article><span>Faithfulness baseline</span><strong>{percent(overview?.faithfulnessScore ?? null)}</strong><p>Claims supported by their cited pages with matching numbers.</p></article>
        <article><span>Citation correctness</span><strong>{percent(overview?.citationCorrectnessScore ?? null)}</strong><p>Quotations found exactly on the claimed source page.</p></article>
        <article><span>Evidence coverage</span><strong>{percent(overview?.coverageScore ?? null)}</strong><p>Generated claims connected to valid source evidence.</p></article>
        <article><span>Passing outputs</span><strong>{overview?.evaluated ? `${overview.passed}/${overview.evaluated}` : 'Not measured'}</strong><p>Outputs meeting all published quality thresholds.</p></article>
      </section>

      <section className="telemetry-section">
        <div className="quality-section-heading"><div><span className="step-label">Operational telemetry</span><h2>Speed, usage, and cost</h2></div><span>{overview?.artifacts || 0} saved outputs</span></div>
        <div className="telemetry-grid">
          <article><span>Average latency</span><strong>{duration(overview?.averageLatencyMs ?? null)}</strong></article>
          <article><span>P95 latency</span><strong>{duration(overview?.p95LatencyMs ?? null)}</strong></article>
          <article><span>Input tokens</span><strong>{tokens(overview?.inputTokens || 0)}</strong></article>
          <article><span>Output tokens</span><strong>{tokens(overview?.outputTokens || 0)}</strong></article>
          <article><span>Estimated API cost</span><strong>${(overview?.estimatedCostUsd || 0).toFixed(4)}</strong></article>
          <article><span>Failed jobs</span><strong>{overview?.failedJobs || 0}</strong></article>
        </div>
      </section>

      <section className="evaluation-history">
        <div className="quality-section-heading"><div><span className="step-label">Latest run</span><h2>Evaluated outputs</h2></div><span>{overview?.evaluatorVersion}</span></div>
        {!overview?.recent.length && <div className="quality-empty"><h3>No evaluated outputs yet</h3><p>Generate a cited brief or comparison, then run the quality evaluation.</p><Link to="/app">Open document workspace</Link></div>}
        {Boolean(overview?.recent.length) && <div className="evaluation-table" role="table" aria-label="Evaluation results">
          <div className="evaluation-row heading" role="row"><span>Output</span><span>Faithfulness</span><span>Citations</span><span>Coverage</span><span>Latency</span><span>Cost</span></div>
          {overview!.recent.map((result) => <div className="evaluation-row" role="row" key={result.id}><span><strong>{String(result.details.artifactTitle || (result.artifact_type === 'summary' ? 'Cited brief' : 'Comparison'))}</strong><small>{result.source_model} · {result.prompt_version}</small></span><span>{result.faithfulness_score}%</span><span>{result.citation_correctness_score}%</span><span>{result.coverage_score}%</span><span>{duration(result.latency_ms)}</span><span>{result.estimated_cost_usd === null ? 'Unknown' : `$${result.estimated_cost_usd.toFixed(4)}`}</span></div>)}
        </div>}
      </section>

      <section className="quality-method">
        <h2>How this baseline works</h2>
        <p>Briefly checks exact quotations, valid page references, meaningful token overlap, and unsupported numbers. It marks an output as passing at 70% faithfulness, 90% citation correctness, and 100% evidence coverage. This deterministic baseline catches common grounding failures without claiming human-level semantic judgment.</p>
        <small>Cost estimates use the recorded model and token counts. Pricing reference: {overview?.pricingVersion}.</small>
      </section>
    </main>
  );
}
