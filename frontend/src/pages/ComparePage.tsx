import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { API_URL } from '../lib/api';
import { supabase } from '../lib/supabase';
import type { ComparisonCitation, ComparisonRow, DocumentRow, ProcessingJobRow } from '../types/database';

async function readApiResponse<T>(response: Response): Promise<T & { error?: string }> {
  if (!response.headers.get('content-type')?.includes('application/json')) return {} as T & { error?: string };
  return response.json() as Promise<T & { error?: string }>;
}

function EvidenceLinks({ citations, documents }: { citations: ComparisonCitation[]; documents: Map<string, DocumentRow> }) {
  return (
    <div className="comparison-evidence" aria-label="Comparison evidence">
      {citations.map((citation, index) => {
        const document = documents.get(citation.document_id);
        return (
          <Link key={`${citation.document_id}-${citation.page_number}-${index}`} to={`/app/documents/${citation.document_id}?page=${citation.page_number}`}>
            <span>{document?.title || 'Document'} · page {citation.page_number}</span>
            <q>{citation.quote}</q>
          </Link>
        );
      })}
    </div>
  );
}

export function ComparePage() {
  const { comparisonId } = useParams();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [recentComparisons, setRecentComparisons] = useState<ComparisonRow[]>([]);
  const [comparison, setComparison] = useState<ComparisonRow | null>(null);
  const [comparisonJob, setComparisonJob] = useState<ProcessingJobRow | null>(null);
  const [baseDocumentId, setBaseDocumentId] = useState('');
  const [targetDocumentId, setTargetDocumentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState('');

  const loadPage = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [documentsResult, comparisonsResult] = await Promise.all([
      supabase.from('documents').select('*').eq('status', 'ready').order('created_at', { ascending: false }),
      supabase.from('comparisons').select('*').order('created_at', { ascending: false }).limit(8),
    ]);
    if (documentsResult.error || comparisonsResult.error) {
      setError('Your comparison workspace could not be loaded.');
      setLoading(false);
      return;
    }
    const readyDocuments = documentsResult.data || [];
    const savedComparisons = comparisonsResult.data || [];
    setDocuments(readyDocuments);
    setRecentComparisons(savedComparisons);
    if (!baseDocumentId && readyDocuments[1]) setBaseDocumentId(readyDocuments[1].id);
    if (!targetDocumentId && readyDocuments[0]) setTargetDocumentId(readyDocuments[0].id);
    if (comparisonId) {
      const saved = savedComparisons.find((item) => item.id === comparisonId);
      if (saved) {
        setComparison(saved);
        setBaseDocumentId(saved.base_document_id);
        setTargetDocumentId(saved.target_document_id);
      } else setError('This saved comparison could not be found.');
    }
    setLoading(false);
  }, [comparisonId]);

  useEffect(() => { loadPage(); }, [loadPage]);

  useEffect(() => {
    if (!supabase || !comparisonJob) return;

    const client = supabase;
    let cancelled = false;
    let interval: number | undefined;
    const pollJob = async () => {
      const { data, error: jobError } = await client
        .from('processing_jobs')
        .select('*')
        .eq('id', comparisonJob.id)
        .single();
      if (cancelled) return;
      if (jobError) {
        setError('Briefly could not check the comparison progress.');
        setComparing(false);
        return;
      }

      const job = data as ProcessingJobRow;
      setComparisonJob(job);
      if (job.status === 'failed') {
        if (interval) window.clearInterval(interval);
        setError(job.error_message || 'Briefly could not compare these documents.');
        setComparing(false);
        return;
      }
      if (job.status !== 'completed') return;
      if (interval) window.clearInterval(interval);

      const savedComparisonId = typeof job.payload?.comparisonId === 'string' ? job.payload.comparisonId : '';
      if (!savedComparisonId) {
        setError('Briefly completed the job but could not find the saved comparison.');
        setComparing(false);
        return;
      }
      const { data: savedComparison, error: comparisonError } = await client
        .from('comparisons')
        .select('*')
        .eq('id', savedComparisonId)
        .single();
      if (cancelled) return;
      if (comparisonError || !savedComparison) {
        setError('Briefly could not open the completed comparison.');
        setComparing(false);
        return;
      }

      const result = savedComparison as ComparisonRow;
      setComparison(result);
      setBaseDocumentId(result.base_document_id);
      setTargetDocumentId(result.target_document_id);
      setRecentComparisons((current) => [result, ...current.filter((item) => item.id !== result.id)]);
      setComparing(false);
      navigate(`/app/comparisons/${result.id}`, { replace: true });
    };

    pollJob();
    interval = window.setInterval(pollJob, 3_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [comparisonJob?.id, navigate]);

  const documentMap = useMemo(() => new Map(documents.map((document) => [document.id, document])), [documents]);
  const baseDocument = documentMap.get(comparison?.base_document_id || baseDocumentId);
  const targetDocument = documentMap.get(comparison?.target_document_id || targetDocumentId);

  const compare = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || !baseDocumentId || !targetDocumentId || baseDocumentId === targetDocumentId || comparing) return;
    setComparing(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/api/comparisons`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseDocumentId, targetDocumentId }),
      });
      const body = await readApiResponse<{ job?: ProcessingJobRow }>(response);
      if (!response.ok || !body.job) throw new Error(body.error || 'Briefly could not compare these documents.');
      setComparisonJob(body.job);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Briefly could not compare these documents.');
      setComparing(false);
    }
  };

  const swapVersions = () => {
    setBaseDocumentId(targetDocumentId);
    setTargetDocumentId(baseDocumentId);
    setComparison(null);
    setComparisonJob(null);
    setComparing(false);
  };

  if (loading) return <main className="route-loader"><span /><p>Opening document comparison</p></main>;

  return (
    <main className="comparison-page">
      <header className="comparison-header">
        <Link to="/app">← Document workspace</Link>
        <strong>Briefly Compare</strong>
        <span>{session?.user.email}</span>
      </header>

      <section className="comparison-hero">
        <span className="step-label">Version intelligence</span>
        <h1>See what changed between two sources.</h1>
        <p>Choose the earlier and later versions. Briefly separates additions, removals, and changed claims, then links each finding to the source pages.</p>
      </section>

      {error && <p className="form-message error comparison-alert" role="alert">{error}</p>}

      {documents.length < 2 ? (
        <section className="comparison-empty"><h2>Add two processed documents</h2><p>Comparison starts after both sources reach Ready.</p><Link to="/app">Upload another document</Link></section>
      ) : (
        <form className="comparison-picker" onSubmit={compare}>
          <label>Earlier version<select aria-label="Earlier version" value={baseDocumentId} onChange={(event) => { setBaseDocumentId(event.target.value); setComparison(null); setComparisonJob(null); setComparing(false); }}>{documents.map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}</select></label>
          <button className="swap-versions" type="button" onClick={swapVersions}>Swap version order</button>
          <label>Later version<select aria-label="Later version" value={targetDocumentId} onChange={(event) => { setTargetDocumentId(event.target.value); setComparison(null); setComparisonJob(null); setComparing(false); }}>{documents.map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}</select></label>
          <button className="compare-action" type="submit" disabled={comparing || baseDocumentId === targetDocumentId}>{comparing ? `Comparing source pages · ${comparisonJob?.progress || 0}%` : 'Compare these versions'}</button>
        </form>
      )}

      {baseDocumentId === targetDocumentId && documents.length >= 2 && <p className="comparison-guidance">Choose two different documents to start comparison.</p>}

      {comparison && <section className="comparison-result">
        <div className="comparison-result-meta"><span>Earlier: {baseDocument?.title}</span><span>Later: {targetDocument?.title}</span><time>{new Date(comparison.created_at).toLocaleString()}</time></div>
        <h2>{comparison.structured_content.title}</h2>
        <p className="comparison-overview">{comparison.structured_content.overview}</p>
        <div className="change-list">
          {comparison.structured_content.changes.map((change, index) => <article className={`change-card ${change.change_type}`} key={`${change.heading}-${index}`}>
            <span>{change.change_type}</span>
            <h3>{change.heading}</h3>
            <p>{change.explanation}</p>
            <strong>Why it matters</strong>
            <p>{change.significance}</p>
            <EvidenceLinks citations={change.citations} documents={documentMap} />
          </article>)}
        </div>
        {(comparison.structured_content.uncertainties || []).length > 0 && <aside className="comparison-uncertainties"><h3>Limits of this comparison</h3><ul>{comparison.structured_content.uncertainties.map((item, index) => <li key={index}>{item}</li>)}</ul></aside>}
      </section>}

      {recentComparisons.length > 0 && <section className="comparison-history"><h2>Saved comparisons</h2><div>{recentComparisons.map((item) => <Link key={item.id} to={`/app/comparisons/${item.id}`}><strong>{item.title}</strong><span>{new Date(item.created_at).toLocaleDateString()}</span></Link>)}</div></section>}
    </main>
  );
}
