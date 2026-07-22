import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { API_URL } from './lib/api';

type BriefMode = 'executive' | 'key-points' | 'study-notes' | 'action-items';
type DetailLevel = 'concise' | 'balanced' | 'detailed';
type Audience = 'general' | 'beginner' | 'expert';
type RequestStatus = 'idle' | 'loading' | 'success' | 'error';

type HistoryItem = {
  id: string;
  source: string;
  summary: string;
  title: string;
  mode: BriefMode;
  detail: DetailLevel;
  audience: Audience;
  createdAt: Date;
};

type ApiResponse = {
  summary?: string;
  error?: string;
  requestId?: string;
};

const MAX_CHARACTERS = 20_000;
const MIN_CHARACTERS = 80;

const SAMPLE_TEXT = `A product team reviewed customer feedback after a six-week beta. Users completed the main workflow successfully, but many did not understand why processing sometimes took longer than expected. Support requests focused on missing progress indicators, unclear errors, and the inability to return to previous results. The team agreed to add visible processing stages, preserve recent work, and replace generic error messages with recovery steps. Engineering will ship the reliability changes before expanding file support. The product manager will measure completion rate, retry rate, and time to first useful result after launch.`;

const modeOptions: Array<{ value: BriefMode; label: string; description: string }> = [
  { value: 'executive', label: 'Executive brief', description: 'Findings, risks, and next steps' },
  { value: 'key-points', label: 'Key points', description: 'Prioritized claims and details' },
  { value: 'study-notes', label: 'Study notes', description: 'Concepts, definitions, and review' },
  { value: 'action-items', label: 'Action items', description: 'Decisions, owners, and open questions' },
];

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.8c.5 4.8 2.4 6.7 7.2 7.2-4.8.5-6.7 2.4-7.2 7.2-.5-4.8-2.4-6.7-7.2-7.2 4.8-.5 6.7-2.4 7.2-7.2Z" />
      <path d="M19 15.5c.2 2.1 1.1 3 3.2 3.2-2.1.2-3 1.1-3.2 3.2-.2-2.1-1.1-3-3.2-3.2 2.1-.2 3-1.1 3.2-3.2Z" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h11M11 6l4 4-4 4" />
    </svg>
  );
}

function App() {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<BriefMode>('executive');
  const [detail, setDetail] = useState<DetailLevel>('balanced');
  const [audience, setAudience] = useState<Audience>('general');
  const [summary, setSummary] = useState('');
  const [status, setStatus] = useState<RequestStatus>('idle');
  const [error, setError] = useState('');
  const [requestId, setRequestId] = useState('');
  const [resultConfig, setResultConfig] = useState<{ mode: BriefMode; detail: DetailLevel } | null>(null);
  const [progressStep, setProgressStep] = useState(0);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLElement>(null);

  const wordCount = useMemo(
    () => text.trim() ? text.trim().split(/\s+/).length : 0,
    [text],
  );
  const canGenerate = text.trim().length >= MIN_CHARACTERS && status !== 'loading';
  const selectedMode = modeOptions.find((option) => option.value === mode)!;

  useEffect(() => {
    if (status !== 'loading') return undefined;

    setProgressStep(0);
    const firstTimer = window.setTimeout(() => setProgressStep(1), 1_200);
    const secondTimer = window.setTimeout(() => setProgressStep(2), 3_500);
    return () => {
      window.clearTimeout(firstTimer);
      window.clearTimeout(secondTimer);
    };
  }, [status]);

  useEffect(() => {
    if (status === 'success') resultRef.current?.focus();
  }, [status]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const generateBrief = async () => {
    if (!canGenerate) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 65_000);
    abortRef.current = controller;
    setStatus('loading');
    setError('');
    setRequestId('');
    setCopied(false);

    try {
      const response = await fetch(`${API_URL}/api/summaries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, mode, length: detail, audience }),
        signal: controller.signal,
      });
      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json')
        ? await response.json() as ApiResponse
        : {};

      if (data.requestId) setRequestId(data.requestId);

      if (!response.ok || !data.summary) {
        throw new Error(data.error || 'The brief could not be generated.');
      }

      const item: HistoryItem = {
        id: crypto.randomUUID(),
        source: text,
        summary: data.summary,
        title: text.trim().split(/\s+/).slice(0, 8).join(' '),
        mode,
        detail,
        audience,
        createdAt: new Date(),
      };
      setSummary(data.summary);
      setResultConfig({ mode, detail });
      setHistory((current) => [item, ...current].slice(0, 5));
      setStatus('success');
    } catch (caughtError) {
      const isTimeout = caughtError instanceof DOMException && caughtError.name === 'AbortError';
      const isNetworkError = caughtError instanceof TypeError;
      setError(
        isTimeout
          ? 'The request took too long. Your text is still here, so you can try again.'
          : isNetworkError
            ? 'The API could not be reached. Your text is still here, so you can try again.'
            : caughtError instanceof Error
              ? caughtError.message
              : 'The brief could not be generated.',
      );
      setStatus('error');
    } finally {
      window.clearTimeout(timeout);
      abortRef.current = null;
    }
  };

  const copySummary = async () => {
    await navigator.clipboard.writeText(summary);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  };

  const downloadSummary = () => {
    const file = new Blob([summary], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `brief-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const startNewBrief = () => {
    setText('');
    setSummary('');
    setStatus('idle');
    setError('');
    setRequestId('');
    setResultConfig(null);
    document.getElementById('source-text')?.focus();
  };

  const loadHistoryItem = (item: HistoryItem) => {
    setText(item.source);
    setSummary(item.summary);
    setMode(item.mode);
    setDetail(item.detail);
    setAudience(item.audience);
    setResultConfig({ mode: item.mode, detail: item.detail });
    setStatus('success');
    setError('');
  };

  const summaryLines = summary.split('\n').filter((line) => line.trim());

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">Skip to brief generator</a>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Briefly home">
          <span className="brand-mark"><SparkIcon /></span>
          <span>Briefly</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#workspace">Workspace</a>
          <a href="#how-it-works">How it works</a>
          <a href="/demo">View sample</a>
          <a className="github-link" href="/app">
            Open workspace
          </a>
        </nav>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="eyebrow"><span />AI-assisted reading workspace</div>
          <h1 id="hero-title">Turn dense text into a brief you can use.</h1>
          <p>Generate cited briefs, question private documents, compare versions, and check every important claim against its source page.</p>
          <div className="hero-actions"><a href="/demo">Explore the sample workspace</a><a href="/auth">Create a private workspace</a></div>
          <div className="trust-row" aria-label="Preview details">
            <span>No account required</span>
            <span>Up to 20,000 characters</span>
            <span>Results stay in this tab</span>
          </div>
        </section>

        <section className="workspace" id="workspace" aria-label="Brief generator">
          <div className="workspace-main">
            <div className="panel composer-panel">
              <div className="panel-heading">
                <div>
                  <span className="step-label">01 · Source</span>
                  <h2>Add the text you need to understand</h2>
                </div>
                <button className="text-button" type="button" onClick={() => setText(SAMPLE_TEXT)} disabled={status === 'loading'}>
                  Use an example
                </button>
              </div>

              <label className="sr-only" htmlFor="source-text">Source text</label>
              <textarea
                id="source-text"
                value={text}
                onChange={(event) => setText(event.target.value.slice(0, MAX_CHARACTERS))}
                placeholder="Paste a report, article, meeting transcript, or technical note..."
                disabled={status === 'loading'}
              />
              <div className="input-meta">
                <span>{wordCount.toLocaleString()} words</span>
                <span className={text.length > MAX_CHARACTERS * 0.9 ? 'near-limit' : ''}>
                  {text.length.toLocaleString()} / {MAX_CHARACTERS.toLocaleString()}
                </span>
              </div>

              <fieldset className="mode-fieldset" disabled={status === 'loading'}>
                <legend><span className="step-label">02 · Outcome</span>Choose a brief format</legend>
                <div className="mode-grid">
                  {modeOptions.map((option) => (
                    <label className={`mode-card ${mode === option.value ? 'selected' : ''}`} key={option.value}>
                      <input
                        type="radio"
                        name="mode"
                        value={option.value}
                        checked={mode === option.value}
                        onChange={() => setMode(option.value)}
                      />
                      <span className="radio-indicator" />
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="select-row">
                <label>
                  Detail level
                  <select value={detail} onChange={(event) => setDetail(event.target.value as DetailLevel)} disabled={status === 'loading'}>
                    <option value="concise">Concise</option>
                    <option value="balanced">Balanced</option>
                    <option value="detailed">Detailed</option>
                  </select>
                </label>
                <label>
                  Reader
                  <select value={audience} onChange={(event) => setAudience(event.target.value as Audience)} disabled={status === 'loading'}>
                    <option value="general">General professional</option>
                    <option value="beginner">New to the topic</option>
                    <option value="expert">Domain expert</option>
                  </select>
                </label>
              </div>

              {text.length > 0 && text.trim().length < MIN_CHARACTERS && (
                <p className="validation-hint">Add at least {MIN_CHARACTERS - text.trim().length} more characters for a useful brief.</p>
              )}

              <button className="primary-button" type="button" onClick={generateBrief} disabled={!canGenerate}>
                {status === 'loading' ? 'Building your brief' : `Generate ${selectedMode.label.toLowerCase()}`}
                {status !== 'loading' && <ArrowIcon />}
                {status === 'loading' && <span className="button-spinner" aria-hidden="true" />}
              </button>
            </div>

            <section className="panel result-panel" ref={resultRef} tabIndex={-1} aria-live="polite" aria-label="Generated brief">
              <div className="result-header">
                <div>
                  <span className="step-label">03 · Brief</span>
                  <h2>Your reading brief</h2>
                </div>
                {status === 'success' && (
                  <div className="result-actions">
                    <button type="button" onClick={copySummary}>{copied ? 'Copied' : 'Copy brief'}</button>
                    <button type="button" onClick={downloadSummary}>Download .txt</button>
                  </div>
                )}
              </div>

              {status === 'idle' && (
                <div className="empty-state">
                  <div className="empty-visual" aria-hidden="true">
                    <span /><span /><span /><i />
                  </div>
                  <h3>Your result will appear here</h3>
                  <p>Briefly will organize the source around your selected outcome and audience.</p>
                  <ul>
                    <li>Important details stay visible</li>
                    <li>Clear sections improve scanning</li>
                    <li>Copy and export come built in</li>
                  </ul>
                </div>
              )}

              {status === 'loading' && (
                <div className="processing-state">
                  <div className="processing-orbit"><SparkIcon /></div>
                  <h3>Building {mode === 'executive' || mode === 'action-items' ? 'an' : 'a'} {selectedMode.label.toLowerCase()}</h3>
                  <p>Longer sources can take up to a minute on the public preview.</p>
                  <ol>
                    {['Reading the source', 'Finding the signal', 'Structuring the brief'].map((label, index) => (
                      <li className={index < progressStep ? 'complete' : index === progressStep ? 'active' : ''} key={label}>
                        <span>{index < progressStep ? '✓' : index + 1}</span>{label}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {status === 'error' && (
                <div className="error-state" role="alert">
                  <span className="error-icon">!</span>
                  <h3>Brief generation stopped</h3>
                  <p>{error}</p>
                  {requestId && <small>Request ID {requestId}</small>}
                  <button type="button" onClick={generateBrief}>Try generating again</button>
                </div>
              )}

              {status === 'success' && (
                <div className="summary-content">
                  <div className="summary-badge">
                    {modeOptions.find((option) => option.value === resultConfig?.mode)?.label || selectedMode.label} · {resultConfig?.detail || detail}
                  </div>
                  {summaryLines.map((line, index) => {
                    const trimmed = line.trim();
                    const isBullet = /^[•*-]\s/.test(trimmed);
                    const isHeading = !isBullet && trimmed.length < 64 && index !== summaryLines.length - 1;
                    if (isBullet) return <p className="summary-bullet" key={`${index}-${trimmed}`}>{trimmed.replace(/^[•*-]\s*/, '')}</p>;
                    if (isHeading) return <h3 key={`${index}-${trimmed}`}>{trimmed.replace(/:$/, '')}</h3>;
                    return <p key={`${index}-${trimmed}`}>{trimmed}</p>;
                  })}
                  <div className="result-footer">
                    <span>Check important details against the original source.</span>
                    <button type="button" onClick={startNewBrief}>Start a new brief</button>
                  </div>
                </div>
              )}
            </section>
          </div>

          {history.length > 0 && (
            <aside className="history-strip" aria-labelledby="history-title">
              <div>
                <span className="step-label">This tab only</span>
                <h2 id="history-title">Recent briefs</h2>
              </div>
              <div className="history-list">
                {history.map((item) => (
                  <button type="button" key={item.id} onClick={() => loadHistoryItem(item)}>
                    <strong>{item.title}</strong>
                    <span>{modeOptions.find((option) => option.value === item.mode)?.label} · {item.createdAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                  </button>
                ))}
              </div>
            </aside>
          )}
        </section>

        <section className="how-it-works" id="how-it-works" aria-labelledby="how-title">
          <div className="section-heading">
            <span className="eyebrow"><span />Built for careful reading</span>
            <h2 id="how-title">A faster first pass without hiding uncertainty</h2>
            <p>The preview helps you identify structure and decide what deserves closer reading.</p>
          </div>
          <div className="principle-grid">
            <article>
              <span>01</span>
              <h3>You choose the outcome</h3>
              <p>Different tasks need different briefs. Choose decisions, study notes, key points, or an executive view before generation.</p>
            </article>
            <article>
              <span>02</span>
              <h3>You keep control of detail</h3>
              <p>Match the depth and terminology to the reader instead of accepting a generic five-bullet response.</p>
            </article>
            <article>
              <span>03</span>
              <h3>You verify important claims</h3>
              <p>AI can miss context. The interface keeps that limitation visible and treats the brief as a reading aid.</p>
            </article>
          </div>
          <div className="privacy-note">
            <div className="privacy-icon" aria-hidden="true">✓</div>
            <div>
              <h3>Clear preview boundaries</h3>
              <p>Briefly sends source text only when you generate a brief. This version keeps recent results in memory and clears them when you close the tab.</p>
            </div>
            <a href="#workspace">Create a reading brief <ArrowIcon /></a>
          </div>
        </section>
      </main>

      <footer>
        <a className="brand" href="#top"><span className="brand-mark"><SparkIcon /></span><span>Briefly</span></a>
        <p>© 2026 Briefly</p>
      </footer>
    </div>
  );
}

export default App;
