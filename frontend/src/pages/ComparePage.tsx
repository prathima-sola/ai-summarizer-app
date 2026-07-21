import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { API_URL } from '../lib/api';
import { supabase } from '../lib/supabase';
import type { ComparisonCitation, ComparisonRow, DocumentRow } from '../types/database';

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
      const body = await readApiResponse<{ comparison?: ComparisonRow }>(response);
      if (!response.ok || !body.comparison) throw new Error(body.error || 'Briefly could not compare these documents.');
      setComparison(body.comparison);
      setRecentComparisons((current) => [body.comparison!, ...current.filter((item) => item.id !== body.comparison!.id)]);
      navigate(`/app/comparisons/${body.comparison.id}`, { replace: true });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Briefly could not compare these documents.');
    } finally {
      setComparing(false);
    }
  };

  const swapVersions = () => {
    setBaseDocumentId(targetDocumentId);
    setTargetDocumentId(baseDocumentId);
    setComparison(null);
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
          <label>Earlier version<select aria-label="Earlier version" value={baseDocumentId} onChange={(event) => { setBaseDocumentId(event.target.value); setComparison(null); }}>{documents.map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}</select></label>
          <button className="swap-versions" type="button" onClick={swapVersions}>Swap version order</button>
          <label>Later version<select aria-label="Later version" value={targetDocumentId} onChange={(event) => { setTargetDocumentId(event.target.value); setComparison(null); }}>{documents.map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}</select></label>
          <button className="compare-action" type="submit" disabled={comparing || baseDocumentId === targetDocumentId}>{comparing ? 'Comparing source pages' : 'Compare these versions'}</button>
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
        {comparison.structured_content.uncertainties.length > 0 && <aside className="comparison-uncertainties"><h3>Limits of this comparison</h3><ul>{comparison.structured_content.uncertainties.map((item, index) => <li key={index}>{item}</li>)}</ul></aside>}
      </section>}

      {recentComparisons.length > 0 && <section className="comparison-history"><h2>Saved comparisons</h2><div>{recentComparisons.map((item) => <Link key={item.id} to={`/app/comparisons/${item.id}`}><strong>{item.title}</strong><span>{new Date(item.created_at).toLocaleDateString()}</span></Link>)}</div></section>}
    </main>
  );
}
