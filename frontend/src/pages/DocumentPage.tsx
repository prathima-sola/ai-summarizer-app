import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { API_URL } from '../lib/api';
import { supabase } from '../lib/supabase';
import { ShareControl } from '../components/ShareControl';
import type {
  Citation,
  DocumentPageRow,
  DocumentRow,
  MessageRow,
  ProcessingJobRow,
  SummaryRow,
} from '../types/database';

type WorkspaceTab = 'brief' | 'ask' | 'evidence';
type SummaryOptions = { mode: string; detail: string; audience: string };

async function readApiResponse<T>(response: Response): Promise<T & { error?: string }> {
  if (!response.headers.get('content-type')?.includes('application/json')) return {} as T & { error?: string };
  return response.json() as Promise<T & { error?: string }>;
}

function CitationButtons({ citations, onSelect }: { citations: Citation[]; onSelect: (page: number) => void }) {
  const pages = [...new Set(citations.map((citation) => citation.page_number))].sort((a, b) => a - b);
  if (!pages.length) return null;
  return (
    <span className="citation-buttons" aria-label="Source pages">
      {pages.map((page) => <button type="button" key={page} onClick={() => onSelect(page)}>p. {page}</button>)}
    </span>
  );
}

export function DocumentPage() {
  const { documentId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [document, setDocument] = useState<DocumentRow | null>(null);
  const [pages, setPages] = useState<DocumentPageRow[]>([]);
  const [summaries, setSummaries] = useState<SummaryRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [signedUrl, setSignedUrl] = useState('');
  const requestedPage = Number(searchParams.get('page'));
  const [activePage, setActivePage] = useState(Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('brief');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summaryJob, setSummaryJob] = useState<ProcessingJobRow | null>(null);
  const [indexJob, setIndexJob] = useState<ProcessingJobRow | null>(null);
  const [summaryOptions, setSummaryOptions] = useState<SummaryOptions>({ mode: 'executive', detail: 'balanced', audience: 'general' });
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingMetadata, setEditingMetadata] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftTags, setDraftTags] = useState('');

  const loadWorkspace = useCallback(async (showLoader = false) => {
    if (!supabase || !documentId) return;
    if (showLoader) setLoading(true);
    const [documentResult, pagesResult, summariesResult, conversationsResult, indexJobsResult] = await Promise.all([
      supabase.from('documents').select('*').eq('id', documentId).maybeSingle(),
      supabase.from('document_pages').select('*').eq('document_id', documentId).order('page_number'),
      supabase.from('summaries').select('*').eq('document_id', documentId).order('created_at', { ascending: false }),
      supabase.from('conversations').select('*').eq('document_id', documentId).order('updated_at', { ascending: false }).limit(1),
      supabase.from('processing_jobs').select('*').eq('document_id', documentId).eq('job_type', 'embed').order('created_at', { ascending: false }).limit(1),
    ]);

    if (documentResult.error || !documentResult.data) {
      setError('This document could not be found.');
      setLoading(false);
      return;
    }
    setDocument(documentResult.data);
    setDraftTitle(documentResult.data.title);
    setDraftTags(documentResult.data.tags.join(', '));
    setPages(pagesResult.data || []);
    setSummaries(summariesResult.data || []);
    setIndexJob(indexJobsResult.data?.[0] || null);

    const currentConversation = conversationsResult.data?.[0];
    if (currentConversation) {
      setConversationId(currentConversation.id);
      const { data } = await supabase.from('messages').select('*').eq('conversation_id', currentConversation.id).order('created_at');
      setMessages(data || []);
    }
    setLoading(false);
  }, [documentId]);

  useEffect(() => { loadWorkspace(true); }, [loadWorkspace]);

  useEffect(() => {
    if (!document || !['uploading', 'queued', 'processing'].includes(document.status)) return undefined;
    const timer = window.setInterval(() => loadWorkspace(), 4_000);
    return () => window.clearInterval(timer);
  }, [document, loadWorkspace]);

  useEffect(() => {
    if (!supabase || !document?.storage_path) return;
    let current = true;
    supabase.storage.from('documents').createSignedUrl(document.storage_path, 3_600).then(({ data }) => {
      if (current) setSignedUrl(data?.signedUrl || '');
    });
    return () => { current = false; };
  }, [document?.storage_path]);

  useEffect(() => {
    if (!summaryJob || !['queued', 'processing'].includes(summaryJob.status) || !supabase) return undefined;
    const client = supabase;
    const timer = window.setInterval(async () => {
      const { data } = await client.from('processing_jobs').select('*').eq('id', summaryJob.id).maybeSingle();
      if (!data) return;
      setSummaryJob(data);
      if (data.status === 'completed') {
        await loadWorkspace();
        setActiveTab('brief');
      }
      if (data.status === 'failed') setError(data.error_message || 'The brief could not be generated.');
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [summaryJob, loadWorkspace]);

  useEffect(() => {
    if (!indexJob || !['queued', 'processing'].includes(indexJob.status)) return undefined;
    const timer = window.setInterval(() => loadWorkspace(), 4_000);
    return () => window.clearInterval(timer);
  }, [indexJob, loadWorkspace]);

  const selectSourcePage = (page: number) => {
    setActivePage(Math.max(1, Math.min(page, document?.page_count || page)));
  };

  const generateBrief = async () => {
    if (!session || !document) return;
    setError('');
    const response = await fetch(`${API_URL}/api/documents/${document.id}/summaries`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(summaryOptions),
    });
    const body = await readApiResponse<{ job?: ProcessingJobRow }>(response);
    if (!response.ok || !body.job) {
      setError(body.error || 'The brief could not be queued.');
      return;
    }
    setSummaryJob(body.job);
  };

  const askQuestion = async (event: FormEvent) => {
    event.preventDefault();
    const nextQuestion = question.trim();
    if (!session || !document || nextQuestion.length < 3 || asking) return;
    setAsking(true);
    setError('');
    setQuestion('');
    const optimisticUser: MessageRow = {
      id: crypto.randomUUID(), conversation_id: conversationId || '', user_id: session.user.id,
      role: 'user', content: nextQuestion, citations: [], model: null, created_at: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimisticUser]);
    try {
      const response = await fetch(`${API_URL}/api/documents/${document.id}/questions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: nextQuestion, conversationId }),
      });
      const body = await readApiResponse<{ conversationId?: string; answer?: { answer: string; citations: Citation[] } }>(response);
      if (!response.ok || !body.answer || !body.conversationId) throw new Error(body.error || 'Briefly could not answer that question.');
      setConversationId(body.conversationId);
      setMessages((current) => [...current, {
        id: crypto.randomUUID(), conversation_id: body.conversationId!, user_id: session.user.id,
        role: 'assistant', content: body.answer!.answer, citations: body.answer!.citations,
        model: null, created_at: new Date().toISOString(),
      }]);
    } catch (caughtError) {
      setMessages((current) => current.filter((message) => message.id !== optimisticUser.id));
      setQuestion(nextQuestion);
      setError(caughtError instanceof Error ? caughtError.message : 'Briefly could not answer that question.');
    } finally {
      setAsking(false);
    }
  };

  const deleteDocument = async () => {
    if (!supabase || !document || !window.confirm(`Delete “${document.title}” and its saved briefs?`)) return;
    setDeleting(true);
    const { error: storageError } = await supabase.storage.from('documents').remove([document.storage_path]);
    const { error: databaseError } = await supabase.from('documents').delete().eq('id', document.id);
    if (storageError || databaseError) {
      setError('The document could not be deleted.');
      setDeleting(false);
      return;
    }
    navigate('/app');
  };

  const saveMetadata = async () => {
    if (!supabase || !document) return;
    const title = draftTitle.trim().slice(0, 180);
    const tags = [...new Set(draftTags.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 8);
    if (!title || tags.some((tag) => tag.length > 32)) {
      setError('Use a title and keep each tag under 33 characters.');
      return;
    }
    const { data, error: updateError } = await supabase.from('documents').update({ title, tags }).eq('id', document.id).select('*').single();
    if (updateError || !data) {
      setError('The document details could not be saved.');
      return;
    }
    setDocument(data);
    setEditingMetadata(false);
  };

  const copyBrief = async () => {
    if (latestSummary) await navigator.clipboard.writeText(latestSummary.content);
  };

  const downloadBrief = () => {
    if (!latestSummary || !document) return;
    const blob = new Blob([latestSummary.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = `${document.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'brief'}-brief.txt`;
    anchor.style.display = 'none';
    window.document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  const latestSummary = summaries[0];
  const brief = latestSummary?.structured_content;
  const evidence = useMemo(() => {
    const all = [...(brief?.citations || []), ...messages.flatMap((message) => message.citations || [])];
    return all.filter((citation, index) => all.findIndex((item) => item.page_number === citation.page_number && item.quote === citation.quote) === index);
  }, [brief, messages]);

  if (loading) return <main className="route-loader"><span /><p>Opening your document</p></main>;
  if (!document) return <main className="workspace-error"><h1>Document unavailable</h1><p>{error}</p><Link to="/app">Return to your documents</Link></main>;

  const isPdf = document.mime_type === 'application/pdf';
  const sourcePage = pages.find((page) => page.page_number === activePage);
  const summaryBusy = Boolean(summaryJob && ['queued', 'processing'].includes(summaryJob.status));

  return (
    <main className="document-workspace">
      <header className="workspace-header">
        <div>
          <Link to="/app">← All documents</Link>
          <span className={`status-pill ${document.status}`}>{indexJob && ['queued', 'processing'].includes(indexJob.status) ? 'indexing' : document.status}</span>
        </div>
        <button className="document-title-button" type="button" title="Rename or tag document" onClick={() => setEditingMetadata(true)}>{document.title}</button>
        <div className="workspace-actions"><button type="button" onClick={() => setEditingMetadata(true)}>Edit details</button><button className="danger-button" type="button" onClick={deleteDocument} disabled={deleting}>{deleting ? 'Deleting document' : 'Delete document'}</button></div>
      </header>

      {editingMetadata && <div className="metadata-editor"><label>Document title<input value={draftTitle} maxLength={180} onChange={(event) => setDraftTitle(event.target.value)} /></label><label>Tags<input value={draftTags} placeholder="research, client, planning" onChange={(event) => setDraftTags(event.target.value)} /></label><div><button type="button" onClick={() => setEditingMetadata(false)}>Cancel changes</button><button type="button" onClick={saveMetadata}>Save document details</button></div></div>}

      {error && <div className="workspace-alert" role="alert">{error}<button type="button" onClick={() => setError('')}>Dismiss</button></div>}

      <div className="workspace-grid">
        <section className="source-panel" aria-label="Original document">
          <div className="source-toolbar">
            <div><span>Original source</span><small>{document.page_count || pages.length || '0'} pages{document.text_coverage !== null ? ` · ${document.text_coverage}% text coverage` : ''}{document.requires_ocr ? ' · scanned pages detected' : ''}</small></div>
            <div className="page-controls">
              <button type="button" onClick={() => selectSourcePage(activePage - 1)} disabled={activePage <= 1}>Previous</button>
              <span>Page {activePage}</span>
              <button type="button" onClick={() => selectSourcePage(activePage + 1)} disabled={activePage >= (document.page_count || pages.length)}>Next</button>
            </div>
          </div>
          <div className="source-viewer">
            {document.status !== 'ready' && <div className="source-empty"><span className="processing-ring" /><h2>Analyzing your source</h2><p>This page updates when text extraction finishes.</p></div>}
            {document.status === 'ready' && isPdf && signedUrl && <iframe key={activePage} title={`${document.title}, page ${activePage}`} src={`${signedUrl}#page=${activePage}&view=FitH`} />}
            {document.status === 'ready' && isPdf && !signedUrl && <div className="source-empty"><p>The private preview could not be opened.</p></div>}
            {document.status === 'ready' && !isPdf && <article className="text-source"><span>Page {activePage}</span><p>{sourcePage?.content || 'No extracted text appears on this page.'}</p></article>}
          </div>
        </section>

        <section className="insight-panel" aria-label="Document insights">
          <nav className="workspace-tabs" aria-label="Workspace views">
            {(['brief', 'ask', 'evidence'] as WorkspaceTab[]).map((tab) => (
              <button type="button" key={tab} aria-selected={activeTab === tab} onClick={() => setActiveTab(tab)}>{tab === 'ask' ? 'Ask the document' : tab}</button>
            ))}
          </nav>

          <div className="insight-content">
            {activeTab === 'brief' && (
              <>
                <div className="brief-controls">
                  <label>Format<select value={summaryOptions.mode} onChange={(event) => setSummaryOptions({ ...summaryOptions, mode: event.target.value })}><option value="executive">Executive brief</option><option value="key-points">Key points</option><option value="study-notes">Study notes</option><option value="action-items">Action items</option></select></label>
                  <label>Detail<select value={summaryOptions.detail} onChange={(event) => setSummaryOptions({ ...summaryOptions, detail: event.target.value })}><option value="concise">Concise</option><option value="balanced">Balanced</option><option value="detailed">Detailed</option></select></label>
                  <label>Reader<select value={summaryOptions.audience} onChange={(event) => setSummaryOptions({ ...summaryOptions, audience: event.target.value })}><option value="general">General</option><option value="beginner">Beginner</option><option value="expert">Expert</option></select></label>
                  <button type="button" onClick={generateBrief} disabled={document.status !== 'ready' || summaryBusy}>{summaryBusy ? `Building brief · ${summaryJob?.progress || 0}%` : latestSummary ? 'Generate a new brief' : 'Generate cited brief'}</button>
                </div>

                {!brief && <div className="insight-empty"><span>Source-grounded output</span><h1>Turn this document into a brief you can verify.</h1><p>Briefly links key points to the source pages so you can check context before using them.</p></div>}
                {brief && <article className="brief-output">
                  <div className="brief-meta"><span>{latestSummary.mode.replace('-', ' ')}</span><div><button type="button" onClick={copyBrief}>Copy brief</button><button type="button" onClick={downloadBrief}>Download brief</button><ShareControl resourceType="summary" resourceId={latestSummary.id} /><time>{new Date(latestSummary.created_at).toLocaleString()}</time></div></div>
                  <h1>{brief.brief_title}</h1>
                  <p className="brief-overview">{brief.overview}</p>
                  {brief.sections.map((section, sectionIndex) => <section key={`${section.heading}-${sectionIndex}`}><h2>{section.heading}</h2><ul>{section.points.map((point, pointIndex) => <li key={pointIndex}><span>{point.text}</span><CitationButtons citations={point.page_numbers.map((page) => ({ page_number: page, quote: '' }))} onSelect={selectSourcePage} /></li>)}</ul></section>)}
                  {brief.uncertainties.length > 0 && <section className="uncertainty-block"><h2>Open questions and uncertainty</h2><ul>{brief.uncertainties.map((item, index) => <li key={index}>{item}</li>)}</ul></section>}
                </article>}
              </>
            )}

            {activeTab === 'ask' && <div className="ask-view">
              <div className="ask-thread">
                {messages.length === 0 && <div className="insight-empty"><span>Grounded Q&amp;A</span><h1>Ask about a claim, decision, or detail.</h1><p>Answers use the extracted source and include page citations. Briefly tells you when the document does not support an answer.</p></div>}
                {messages.map((message) => <article className={`message ${message.role}`} key={message.id}><small>{message.role === 'user' ? 'You' : 'Briefly'}</small><p>{message.content}</p><CitationButtons citations={message.citations || []} onSelect={selectSourcePage} /></article>)}
                {asking && <article className="message assistant pending"><small>Briefly</small><p>Checking the source pages…</p></article>}
              </div>
              <form className="question-form" onSubmit={askQuestion}><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a question about this document" maxLength={2000} disabled={document.status !== 'ready' || asking} /><button type="submit" disabled={question.trim().length < 3 || asking}>Ask with source citations</button></form>
            </div>}

            {activeTab === 'evidence' && <div className="evidence-view">
              <div className="evidence-heading"><span>Evidence ledger</span><h1>Every saved source quotation</h1><p>Open a cited page beside the quote to check its original context.</p></div>
              {evidence.length === 0 && <div className="insight-empty compact"><p>Generate a brief or ask a question to collect source evidence here.</p></div>}
              {evidence.map((citation, index) => <button className="evidence-card" type="button" key={`${citation.page_number}-${index}`} onClick={() => selectSourcePage(citation.page_number)}><span>Page {citation.page_number}</span><blockquote>“{citation.quote}”</blockquote><small>Open source page</small></button>)}
            </div>}
          </div>
        </section>
      </div>
    </main>
  );
}
