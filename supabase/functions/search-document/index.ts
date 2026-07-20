import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = { 'Content-Type': 'application/json' };

function hasServiceRole(request: Request, serviceRoleKey: string) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return false;
  if (token === serviceRoleKey) return true;
  try {
    const payloadPart = token.split('.')[1];
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')));
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}

Deno.serve(async (request) => {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!hasServiceRole(request, serviceRoleKey)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  }

  const { documentId, userId, query, matchCount = 8 } = await request.json();
  if (!documentId || !userId || !query) {
    return Response.json({ error: 'documentId, userId, and query are required' }, { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: document } = await supabase
    .from('documents')
    .select('id')
    .eq('id', documentId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!document) return Response.json({ error: 'Document not found' }, { status: 404, headers: corsHeaders });

  const model = new Supabase.ai.Session('gte-small');
  const embedding = await model.run(query, { mean_pool: true, normalize: true });
  const { data, error } = await supabase.rpc('match_document_chunks', {
    p_document_id: documentId,
    query_embedding: JSON.stringify(embedding),
    match_threshold: 0.45,
    match_count: Math.min(Number(matchCount), 12),
  });

  if (error) return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  return Response.json({ matches: data || [] }, { headers: corsHeaders });
});
