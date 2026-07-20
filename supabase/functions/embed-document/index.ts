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

  const { documentId, limit = 40 } = await request.json();
  if (!documentId) return Response.json({ error: 'documentId is required' }, { status: 400, headers: corsHeaders });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const model = new Supabase.ai.Session('gte-small');
  const { data: chunks, error } = await supabase
    .from('document_chunks')
    .select('id, content')
    .eq('document_id', documentId)
    .is('embedding', null)
    .order('chunk_index')
    .limit(Math.min(Math.max(Number(limit), 1), 50));

  if (error) return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });

  let embedded = 0;
  for (const chunk of chunks || []) {
    const embedding = await model.run(chunk.content, { mean_pool: true, normalize: true });
    const { error: updateError } = await supabase
      .from('document_chunks')
      .update({ embedding: JSON.stringify(embedding) })
      .eq('id', chunk.id);
    if (updateError) return Response.json({ error: updateError.message }, { status: 500, headers: corsHeaders });
    embedded += 1;
  }

  const { count, error: countError } = await supabase
    .from('document_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', documentId)
    .is('embedding', null);
  if (countError) return Response.json({ error: countError.message }, { status: 500, headers: corsHeaders });
  return Response.json({ documentId, embedded, remaining: count || 0 }, { headers: corsHeaders });
});
