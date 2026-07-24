import { useState } from 'react';
import { Link } from 'react-router';

type DemoTab = 'brief' | 'ask' | 'evidence';

const sourcePages = [
  {
    number: 1,
    text: `Release readiness review\n\nThe product team reviewed the document workspace after a six-week pilot with researchers and operations managers. Participants completed uploads successfully, but they hesitated when processing took longer than expected. The team decided that each document must show a visible queue state, processing progress, and a clear recovery message when extraction fails.\n\nResearchers said summaries only become useful when they can verify the supporting source. The release criteria require page-level citations, a source viewer beside each brief, and an evidence ledger that collects quoted passages.`,
  },
  {
    number: 2,
    text: `Operations and security review\n\nOperations managers need a controlled way to send results to colleagues who do not have accounts. A shared brief must expose the generated result and supporting quotations without exposing the private source file, account details, model telemetry, or unrelated documents. Owners must be able to revoke each link immediately.\n\nThe security review requires private storage paths scoped to the owner, row-level database policies, short-lived source previews, and server-side ownership checks for every document action. Automated tests must remove files, summaries, links, and temporary users even when a test fails.`,
  },
];

const evidence = [
  { page: 1, quote: 'Researchers said summaries only become useful when they can verify the supporting source.' },
  { page: 1, quote: 'The release criteria require page-level citations, a source viewer beside each brief, and an evidence ledger.' },
  { page: 2, quote: 'Owners must be able to revoke each link immediately.' },
  { page: 2, quote: 'Automated tests must remove files, summaries, links, and temporary users even when a test fails.' },
];

export function DemoWorkspacePage() {
  const [tab, setTab] = useState<DemoTab>('brief');
  const [activePage, setActivePage] = useState(1);
  const [question, setQuestion] = useState('Why are citations required?');
  const source = sourcePages[activePage - 1];

  const openEvidence = (page: number) => {
    setActivePage(page);
    setTab('evidence');
  };

  return (
    <div className="demo-shell">
      <a className="skip-link" href="#demo-content">Skip to sample workspace</a>
      <header className="demo-header">
        <Link className="brand" to="/">Briefly</Link>
        <span>Read-only sample workspace</span>
        <Link className="demo-header-cta" to="/auth">Create your workspace</Link>
      </header>

      <main id="demo-content">
        <section className="demo-intro" aria-labelledby="demo-title">
          <div>
            <span className="step-label">Just a demo</span>
            <h1 id="demo-title">Inspect the complete grounded-reading workflow.</h1>
            <p>This sample uses committed product data. Explore the source, cited brief, document Q&amp;A, and evidence ledger without uploading a file or calling the AI provider.</p>
          </div>
          <div className="demo-proof" aria-label="Verified project capabilities">
            <div><strong>100%</strong><span>citation correctness fixture</span></div>
            <div><strong>38</strong><span>backend tests</span></div>
            <div><strong>E2E</strong><span>production lifecycle coverage</span></div>
          </div>
        </section>

        <section className="demo-document" aria-label="Sample document workspace">
          <header className="demo-document-header">
            <div><span className="status-pill ready">ready</span><small>2 pages · 100% text coverage</small></div>
            <strong>Release readiness review</strong>
            <span>Executive brief · balanced</span>
          </header>

          <div className="demo-workspace-grid">
            <section className="demo-source-panel" aria-label="Sample original source">
              <div className="source-toolbar">
                <div><span>Original source</span><small>Use citations to move between source pages</small></div>
                <div className="page-controls">
                  <button type="button" onClick={() => setActivePage(1)} disabled={activePage === 1}>Previous</button>
                  <span>Page {activePage}</span>
                  <button type="button" onClick={() => setActivePage(2)} disabled={activePage === 2}>Next</button>
                </div>
              </div>
              <article className="demo-source-page" aria-live="polite">
                <span>Page {source.number}</span>
                {source.text.split('\n\n').map((paragraph, index) => index === 0
                  ? <h2 key={paragraph}>{paragraph}</h2>
                  : <p key={paragraph}>{paragraph}</p>)}
              </article>
            </section>

            <section className="demo-insight-panel" aria-label="Sample document insights">
              <div className="workspace-tabs" role="tablist" aria-label="Sample workspace views">
                {(['brief', 'ask', 'evidence'] as DemoTab[]).map((item) => (
                  <button
                    id={`demo-tab-${item}`}
                    type="button"
                    role="tab"
                    aria-selected={tab === item}
                    aria-controls={`demo-panel-${item}`}
                    key={item}
                    onClick={() => setTab(item)}
                  >{item === 'ask' ? 'Ask the document' : item}</button>
                ))}
              </div>

              {tab === 'brief' && <article id="demo-panel-brief" className="demo-brief" role="tabpanel" aria-labelledby="demo-tab-brief">
                <span className="demo-kicker">Source-grounded executive brief</span>
                <h2>Trust depends on visible evidence and recoverable workflows</h2>
                <p className="brief-overview">The pilot validated the core upload workflow, then exposed two release requirements: readers need visible processing feedback and every important claim needs a path back to its source.</p>
                <section>
                  <h3>Release decisions</h3>
                  <ul>
                    <li>Show queue state, processing progress, and recovery guidance during document ingestion. <button type="button" onClick={() => openEvidence(1)}>p. 1</button></li>
                    <li>Keep the source beside generated output and collect supporting quotations in an evidence ledger. <button type="button" onClick={() => openEvidence(1)}>p. 1</button></li>
                    <li>Expose generated results through revocable links without exposing private files. <button type="button" onClick={() => openEvidence(2)}>p. 2</button></li>
                  </ul>
                </section>
                <aside><strong>Open question</strong><p>The review does not define a target processing time for large scanned PDFs.</p></aside>
              </article>}

              {tab === 'ask' && <div id="demo-panel-ask" className="demo-ask" role="tabpanel" aria-labelledby="demo-tab-ask">
                <div className="demo-question-picker" aria-label="Choose a sample question">
                  {['Why are citations required?', 'What can a shared link expose?', 'How does cleanup work?'].map((item) => <button type="button" key={item} aria-pressed={question === item} onClick={() => setQuestion(item)}>{item}</button>)}
                </div>
                <article className="message user"><small>Sample question</small><p>{question}</p></article>
                <article className="message assistant"><small>Briefly</small><p>{question === 'Why are citations required?'
                  ? 'Researchers only considered a summary useful when they could verify its supporting source. The release criteria therefore connect claims to pages and preserve quotations in an evidence ledger.'
                  : question === 'What can a shared link expose?'
                    ? 'A shared link can expose the generated result and supporting quotations. It must not expose the private file, account details, model telemetry, or unrelated documents.'
                    : 'Automated tests remove files, summaries, links, and temporary users even when a test fails.'}</p><button type="button" className="demo-citation" onClick={() => setActivePage(question === 'Why are citations required?' ? 1 : 2)}>Open page {question === 'Why are citations required?' ? 1 : 2}</button></article>
              </div>}

              {tab === 'evidence' && <div id="demo-panel-evidence" className="demo-evidence" role="tabpanel" aria-labelledby="demo-tab-evidence">
                <span className="demo-kicker">Evidence ledger</span>
                <h2>Check each quotation in context</h2>
                {evidence.map((item) => <button type="button" key={item.quote} onClick={() => setActivePage(item.page)}><span>Page {item.page}</span><blockquote>“{item.quote}”</blockquote><small>Open beside the source</small></button>)}
              </div>}
            </section>
          </div>
        </section>

        <section className="demo-next">
          <div><span className="step-label">Try your own source</span><h2>Move from the sample to a private workspace.</h2><p>Your documents use owner-scoped storage, row-level access rules, and revocable sharing.</p></div>
          <div><Link to="/auth">Create a private workspace</Link></div>
        </section>
      </main>
    </div>
  );
}
