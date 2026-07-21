const crypto = require('node:crypto');

const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SHARE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

function hashShareToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function publicLinkRow(row) {
  return {
    id: row.id,
    resourceType: row.resource_type,
    resourceId: row.summary_id || row.comparison_id,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    viewCount: row.view_count,
    lastViewedAt: row.last_viewed_at,
  };
}

function createShareService(supabaseAdmin) {
  if (!supabaseAdmin) return null;

  async function findOwnedResource(resourceType, resourceId, userId) {
    const table = resourceType === 'summary' ? 'summaries' : 'comparisons';
    const { data, error } = await supabaseAdmin
      .from(table)
      .select('id')
      .eq('id', resourceId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function list({ resourceType, resourceId, userId }) {
    const resourceColumn = resourceType === 'summary' ? 'summary_id' : 'comparison_id';
    const { data, error } = await supabaseAdmin
      .from('share_links')
      .select('*')
      .eq('user_id', userId)
      .eq('resource_type', resourceType)
      .eq(resourceColumn, resourceId)
      .is('revoked_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const now = Date.now();
    return (data || []).filter((row) => new Date(row.expires_at).getTime() > now).map(publicLinkRow);
  }

  async function create({ resourceType, resourceId, userId }) {
    const resource = await findOwnedResource(resourceType, resourceId, userId);
    if (!resource) return { status: 404, error: 'The item you want to share could not be found.' };

    const resourceColumn = resourceType === 'summary' ? 'summary_id' : 'comparison_id';
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SHARE_LIFETIME_MS);
    const { error: revokeError } = await supabaseAdmin
      .from('share_links')
      .update({ revoked_at: now.toISOString() })
      .eq('user_id', userId)
      .eq('resource_type', resourceType)
      .eq(resourceColumn, resourceId)
      .is('revoked_at', null);
    if (revokeError) throw revokeError;

    const token = crypto.randomBytes(32).toString('base64url');
    const { data: link, error: insertError } = await supabaseAdmin
      .from('share_links')
      .insert({
        user_id: userId,
        resource_type: resourceType,
        [resourceColumn]: resourceId,
        token_hash: hashShareToken(token),
        expires_at: expiresAt.toISOString(),
      })
      .select('*')
      .single();
    if (insertError) throw insertError;
    return { status: 201, link: publicLinkRow(link), token };
  }

  async function revoke({ shareId, userId }) {
    const { data, error } = await supabaseAdmin
      .from('share_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', shareId)
      .eq('user_id', userId)
      .is('revoked_at', null)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) return { status: 404, error: 'This active share link could not be found.' };
    return { status: 204 };
  }

  async function resolveSummary(row) {
    const { data: summary, error: summaryError } = await supabaseAdmin
      .from('summaries')
      .select('id, document_id, mode, detail_level, audience, structured_content, citations, created_at')
      .eq('id', row.summary_id)
      .maybeSingle();
    if (summaryError) throw summaryError;
    if (!summary) return null;
    const { data: document, error: documentError } = await supabaseAdmin
      .from('documents')
      .select('title')
      .eq('id', summary.document_id)
      .maybeSingle();
    if (documentError) throw documentError;
    if (!document) return null;
    return {
      type: 'summary',
      title: summary.structured_content?.brief_title || document.title,
      documentTitle: document.title,
      mode: summary.mode,
      detailLevel: summary.detail_level,
      audience: summary.audience,
      structuredContent: summary.structured_content,
      citations: summary.citations,
      createdAt: summary.created_at,
    };
  }

  async function resolveComparison(row) {
    const { data: comparison, error: comparisonError } = await supabaseAdmin
      .from('comparisons')
      .select('id, base_document_id, target_document_id, title, structured_content, citations, created_at')
      .eq('id', row.comparison_id)
      .maybeSingle();
    if (comparisonError) throw comparisonError;
    if (!comparison) return null;
    const { data: documents, error: documentsError } = await supabaseAdmin
      .from('documents')
      .select('id, title')
      .in('id', [comparison.base_document_id, comparison.target_document_id]);
    if (documentsError) throw documentsError;
    const titles = new Map((documents || []).map((document) => [document.id, document.title]));
    if (titles.size !== 2) return null;
    return {
      type: 'comparison',
      title: comparison.title,
      baseDocument: { id: comparison.base_document_id, title: titles.get(comparison.base_document_id) },
      targetDocument: { id: comparison.target_document_id, title: titles.get(comparison.target_document_id) },
      structuredContent: comparison.structured_content,
      citations: comparison.citations,
      createdAt: comparison.created_at,
    };
  }

  async function resolve(token) {
    if (!SHARE_TOKEN_PATTERN.test(token)) return { status: 404, error: 'This shared item is unavailable.' };
    const { data: row, error } = await supabaseAdmin
      .from('share_links')
      .select('*')
      .eq('token_hash', hashShareToken(token))
      .is('revoked_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!row || new Date(row.expires_at).getTime() <= Date.now()) {
      return { status: 404, error: 'This shared item is unavailable.' };
    }

    const resource = row.resource_type === 'summary' ? await resolveSummary(row) : await resolveComparison(row);
    if (!resource) return { status: 404, error: 'This shared item is unavailable.' };
    await supabaseAdmin.from('share_links').update({
      view_count: row.view_count + 1,
      last_viewed_at: new Date().toISOString(),
    }).eq('id', row.id);
    return { status: 200, share: { expiresAt: row.expires_at, resource } };
  }

  return { create, list, resolve, revoke };
}

module.exports = { SHARE_TOKEN_PATTERN, createShareService, hashShareToken };
