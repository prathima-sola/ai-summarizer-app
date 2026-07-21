import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { DocumentUploader } from '../components/DocumentUploader';
import { supabase } from '../lib/supabase';
import type { DocumentRow } from '../types/database';

export function DashboardPage() {
  const { session, signOut } = useAuth();
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const loadDocuments = useCallback(async (showLoader = false) => {
      if (!supabase) return;
      if (showLoader) setLoading(true);
      const { data, error: queryError } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });
      if (queryError) setError('Your documents could not be loaded.');
      else setDocuments(data || []);
      setLoading(false);
  }, []);

  useEffect(() => { loadDocuments(true); }, [loadDocuments]);

  useEffect(() => {
    if (!documents.some((document) => ['uploading', 'queued', 'processing'].includes(document.status))) return undefined;
    const timer = window.setInterval(() => loadDocuments(), 4_000);
    return () => window.clearInterval(timer);
  }, [documents, loadDocuments]);

  const onUploaded = (document: DocumentRow) => {
    setDocuments((current) => [document, ...current.filter((item) => item.id !== document.id)]);
  };

  const visibleDocuments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return documents;
    return documents.filter((document) => [document.title, document.original_name, ...document.tags]
      .some((value) => value.toLowerCase().includes(normalizedQuery)));
  }, [documents, query]);
  const readyDocumentCount = documents.filter((document) => document.status === 'ready').length;

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <Link className="brand" to="/">Briefly</Link>
        <div>
          <span>{session?.user.email}</span>
          <button type="button" onClick={() => signOut()}>Sign out</button>
        </div>
      </header>

      <main className="dashboard-main">
        <section className="dashboard-intro">
          <div>
            <span className="step-label">Document workspace</span>
            <h1>Continue reading where you left off.</h1>
            <p>Upload a source, generate a cited brief, and ask questions without losing the connection to the original pages.</p>
          </div>
          <div className="dashboard-actions">
            <Link className="quality-link" to="/app/quality">View quality metrics</Link>
            {readyDocumentCount >= 2 && <Link className="compare-link" to="/app/compare">Compare two documents</Link>}
            {session && <DocumentUploader session={session} onUploaded={onUploaded} />}
          </div>
        </section>

        <section className="document-section" aria-labelledby="documents-title">
          <div className="document-section-heading">
            <h2 id="documents-title">Your documents</h2>
            <div><input aria-label="Search documents" type="search" placeholder="Search titles and tags" value={query} onChange={(event) => setQuery(event.target.value)} /><span>{documents.length} saved</span></div>
          </div>

          {loading && <div className="document-loading" role="status">Loading your documents</div>}
          {error && <p className="form-message error" role="alert">{error}</p>}
          {!loading && !error && documents.length === 0 && (
            <div className="document-empty">
              <span>PDF · DOCX · TXT · MD</span>
              <h3>Your first cited brief starts with a source</h3>
              <p>Upload a document up to 15 MB. Briefly will preserve page boundaries for citations.</p>
              {session && <DocumentUploader session={session} onUploaded={onUploaded} variant="empty" />}
            </div>
          )}
          {documents.length > 0 && visibleDocuments.length === 0 && <div className="document-no-results"><h3>No documents match “{query}”</h3><button type="button" onClick={() => setQuery('')}>Clear document search</button></div>}
          {visibleDocuments.length > 0 && (
            <div className="document-grid">
              {visibleDocuments.map((document) => (
                <Link to={`/app/documents/${document.id}`} className="document-card" key={document.id}>
                  <div className="document-card-icon">{document.original_name.split('.').pop()?.toUpperCase()}</div>
                  <div>
                    <h3>{document.title}</h3>
                    <p>{document.page_count ? `${document.page_count} pages` : 'Page count pending'} · {(document.size_bytes / 1024 / 1024).toFixed(1)} MB{document.tags.length ? ` · ${document.tags.join(', ')}` : ''}</p>
                  </div>
                  <span className={`status-pill ${document.status}`}>{document.status}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
