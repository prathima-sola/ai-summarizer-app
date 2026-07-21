import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { API_URL } from '../lib/api';
import type { ComparisonCitation, Citation, PublicSharePayload } from '../types/database';

function QuoteLedger({ citations, documentNames }: { citations: Array<Citation | ComparisonCitation>; documentNames?: Map<string, string> }) {
  const unique = citations.filter((citation, index) => citations.findIndex((item) => item.page_number === citation.page_number && item.quote === citation.quote && ('document_id' in item ? item.document_id : '') === ('document_id' in citation ? citation.document_id : '')) === index);
  if (!unique.length) return null;
  return <div className="public-evidence">{unique.map((citation, index) => <blockquote key={`${citation.page_number}-${index}`}><span>{'document_id' in citation ? `${documentNames?.get(citation.document_id) || 'Source'} · ` : ''}Page {citation.page_number}</span><p>“{citation.quote}”</p></blockquote>)}</div>;
}

export function PublicSharePage() {
  const { token = '' } = useParams();
  const [payload, setPayload] = useState<PublicSharePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    fetch(`${API_URL}/api/public/shares/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const body = response.headers.get('content-type')?.includes('application/json') ? await response.json() : {};
        if (!response.ok || !body.share) throw new Error(body.error || 'This shared item is unavailable.');
        if (current) setPayload(body.share);
      })
      .catch((caughtError) => { if (current) setError(caughtError instanceof Error ? caughtError.message : 'This shared item is unavailable.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [token]);

  const comparisonDocuments = useMemo(() => {
    if (payload?.resource.type !== 'comparison') return new Map<string, string>();
    return new Map([[payload.resource.baseDocument.id, payload.resource.baseDocument.title], [payload.resource.targetDocument.id, payload.resource.targetDocument.title]]);
  }, [payload]);

  if (loading) return <main className="route-loader"><span /><p>Opening shared brief</p></main>;
  if (!payload) return <main className="public-share-error"><strong>Briefly</strong><h1>Shared item unavailable</h1><p>{error}</p><Link to="/">Open Briefly</Link></main>;

  const { resource } = payload;
  return (
    <main className="public-share-page">
      <header><Link to="/">Briefly</Link><span>Read-only shared view</span><time>Available until {new Date(payload.expiresAt).toLocaleDateString()}</time></header>
      <article className="public-share-content">
        <div className="public-share-kicker">{resource.type === 'summary' ? 'Cited document brief' : 'Cited version comparison'}</div>
        <h1>{resource.title}</h1>
        {resource.type === 'summary' ? <>
          <div className="public-share-meta"><span>{resource.documentTitle}</span><span>{resource.mode.replace('-', ' ')}</span><span>{resource.detailLevel}</span><time>{new Date(resource.createdAt).toLocaleDateString()}</time></div>
          <p className="public-share-overview">{resource.structuredContent.overview}</p>
          {resource.structuredContent.sections.map((section, index) => <section key={`${section.heading}-${index}`}><h2>{section.heading}</h2><ul>{section.points.map((point, pointIndex) => <li key={pointIndex}>{point.text}<small>{point.page_numbers.map((page) => `p. ${page}`).join(' · ')}</small></li>)}</ul></section>)}
          {(resource.structuredContent.uncertainties || []).length > 0 && <aside><h2>Open questions and uncertainty</h2><ul>{resource.structuredContent.uncertainties.map((item, index) => <li key={index}>{item}</li>)}</ul></aside>}
          <section><h2>Source evidence</h2><p>These quotations support the shared brief without exposing the private source file.</p><QuoteLedger citations={resource.citations} /></section>
        </> : <>
          <div className="public-share-meta"><span>Earlier: {resource.baseDocument.title}</span><span>Later: {resource.targetDocument.title}</span><time>{new Date(resource.createdAt).toLocaleDateString()}</time></div>
          <p className="public-share-overview">{resource.structuredContent.overview}</p>
          <div className="public-change-list">{resource.structuredContent.changes.map((change, index) => <section className={`public-change ${change.change_type}`} key={`${change.heading}-${index}`}><span>{change.change_type}</span><h2>{change.heading}</h2><p>{change.explanation}</p><strong>Why it matters</strong><p>{change.significance}</p><QuoteLedger citations={change.citations} documentNames={comparisonDocuments} /></section>)}</div>
          {(resource.structuredContent.uncertainties || []).length > 0 && <aside><h2>Limits of this comparison</h2><ul>{resource.structuredContent.uncertainties.map((item, index) => <li key={index}>{item}</li>)}</ul></aside>}
        </>}
      </article>
      <footer><strong>Briefly</strong><span>The owner can revoke this link at any time.</span><Link to="/">Create your own cited brief</Link></footer>
    </main>
  );
}
