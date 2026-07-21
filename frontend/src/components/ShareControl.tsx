import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { API_URL } from '../lib/api';
import type { ShareLinkMeta } from '../types/database';

type ShareControlProps = {
  resourceType: 'summary' | 'comparison';
  resourceId: string;
};

async function readResponse<T>(response: Response): Promise<T & { error?: string }> {
  if (!response.headers.get('content-type')?.includes('application/json')) return {} as T & { error?: string };
  return response.json() as Promise<T & { error?: string }>;
}

export function ShareControl({ resourceType, resourceId }: ShareControlProps) {
  const { session } = useAuth();
  const [link, setLink] = useState<ShareLinkMeta | null>(null);
  const [shareUrl, setShareUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session) return;
    let current = true;
    const query = new URLSearchParams({ resourceType, resourceId });
    fetch(`${API_URL}/api/shares?${query}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then(async (response) => {
        const body = await readResponse<{ links?: ShareLinkMeta[] }>(response);
        if (current && response.ok) setLink(body.links?.[0] || null);
      })
      .catch(() => { if (current) setError('Share status could not be loaded.'); });
    return () => { current = false; };
  }, [resourceId, resourceType, session]);

  const createLink = async () => {
    if (!session || busy) return;
    setBusy(true);
    setError('');
    setCopied(false);
    try {
      const response = await fetch(`${API_URL}/api/shares`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ resourceType, resourceId }),
      });
      const body = await readResponse<{ link?: ShareLinkMeta; token?: string }>(response);
      if (!response.ok || !body.link || !body.token) throw new Error(body.error || 'The read-only link could not be created.');
      const url = `${window.location.origin}/share/${body.token}`;
      setLink(body.link);
      setShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      } catch {
        setCopied(false);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'The read-only link could not be created.');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    setError('');
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      setError('Select the link and copy it from the field below.');
    }
  };

  const revokeLink = async () => {
    if (!session || !link || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/api/shares/${link.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) {
        const body = await readResponse<Record<string, never>>(response);
        throw new Error(body.error || 'The read-only link could not be revoked.');
      }
      setLink(null);
      setShareUrl('');
      setCopied(false);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'The read-only link could not be revoked.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="share-control">
      {!link && <button type="button" onClick={createLink} disabled={busy}>{busy ? 'Creating read-only link' : 'Create read-only link'}</button>}
      {link && shareUrl && <><button type="button" onClick={copyLink}>{copied ? 'Link copied' : 'Copy read-only link'}</button><button className="revoke-share" type="button" onClick={revokeLink} disabled={busy}>{busy ? 'Revoking link' : 'Revoke link'}</button></>}
      {link && !shareUrl && <><span>One read-only link is active until {new Date(link.expiresAt).toLocaleDateString()}.</span><button type="button" onClick={createLink} disabled={busy}>{busy ? 'Replacing link' : 'Replace and copy link'}</button><button className="revoke-share" type="button" onClick={revokeLink} disabled={busy}>Revoke link</button></>}
      {shareUrl && <input aria-label="Read-only share link" readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} />}
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
