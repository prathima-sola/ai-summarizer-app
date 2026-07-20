create extension if not exists vector with schema extensions;

create type public.document_status as enum (
  'uploading',
  'queued',
  'processing',
  'ready',
  'failed'
);

create type public.job_status as enum (
  'queued',
  'processing',
  'completed',
  'failed'
);

create type public.message_role as enum ('user', 'assistant');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text check (char_length(full_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  original_name text not null check (char_length(original_name) between 1 and 255),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 15728640),
  storage_path text not null unique,
  status public.document_status not null default 'uploading',
  page_count integer check (page_count is null or page_count > 0),
  character_count integer check (character_count is null or character_count >= 0),
  text_coverage integer check (text_coverage is null or text_coverage between 0 and 100),
  requires_ocr boolean not null default false,
  language text,
  tags text[] not null default '{}',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index documents_user_created_idx
  on public.documents (user_id, created_at desc);

alter publication supabase_realtime add table public.documents;

create table public.document_pages (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.documents(id) on delete cascade,
  page_number integer not null check (page_number > 0),
  content text not null,
  created_at timestamptz not null default now(),
  unique (document_id, page_number)
);

create index document_pages_document_idx
  on public.document_pages (document_id, page_number);

create table public.document_chunks (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.documents(id) on delete cascade,
  page_number integer not null check (page_number > 0),
  chunk_index integer not null check (chunk_index >= 0),
  content text not null check (char_length(content) > 0),
  token_count integer check (token_count is null or token_count > 0),
  embedding extensions.vector(384),
  search_vector tsvector generated always as (to_tsvector('english', content)) stored,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index document_chunks_document_idx
  on public.document_chunks (document_id, chunk_index);

create index document_chunks_search_idx
  on public.document_chunks using gin (search_vector);

create index document_chunks_embedding_idx
  on public.document_chunks using hnsw (embedding extensions.vector_ip_ops)
  where embedding is not null;

create table public.summaries (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('executive', 'key-points', 'study-notes', 'action-items')),
  detail_level text not null check (detail_level in ('concise', 'balanced', 'detailed')),
  audience text not null check (audience in ('general', 'beginner', 'expert')),
  content text not null,
  structured_content jsonb not null default '{}'::jsonb,
  citations jsonb not null default '[]'::jsonb,
  model text not null,
  prompt_version text not null,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  created_at timestamptz not null default now()
);

create index summaries_document_created_idx
  on public.summaries (document_id, created_at desc);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Document questions' check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_document_idx
  on public.conversations (document_id, updated_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.message_role not null,
  content text not null check (char_length(content) between 1 and 12000),
  citations jsonb not null default '[]'::jsonb,
  model text,
  created_at timestamptz not null default now()
);

create index messages_conversation_idx
  on public.messages (conversation_id, created_at);

create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  job_type text not null check (job_type in ('parse', 'embed', 'summarize')),
  status public.job_status not null default 'queued',
  attempts integer not null default 0 check (attempts between 0 and 5),
  progress integer not null default 0 check (progress between 0 and 100),
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index processing_jobs_status_idx
  on public.processing_jobs (status, created_at)
  where status in ('queued', 'processing');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger documents_set_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

create trigger conversations_set_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

create trigger processing_jobs_set_updated_at
before update on public.processing_jobs
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.document_pages enable row level security;
alter table public.document_chunks enable row level security;
alter table public.summaries enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.processing_jobs enable row level security;

create policy "Users can read their profile"
on public.profiles for select to authenticated
using ((select auth.uid()) = id);

create policy "Users can update their profile"
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "Users can read their documents"
on public.documents for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their documents"
on public.documents for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their documents"
on public.documents for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their documents"
on public.documents for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their document pages"
on public.document_pages for select to authenticated
using (exists (
  select 1 from public.documents
  where documents.id = document_pages.document_id
    and documents.user_id = (select auth.uid())
));

create policy "Users can read their document chunks"
on public.document_chunks for select to authenticated
using (exists (
  select 1 from public.documents
  where documents.id = document_chunks.document_id
    and documents.user_id = (select auth.uid())
));

create policy "Users can read their summaries"
on public.summaries for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their summaries"
on public.summaries for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.documents
    where documents.id = summaries.document_id
      and documents.user_id = (select auth.uid())
  )
);

create policy "Users can delete their summaries"
on public.summaries for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can manage their conversations"
on public.conversations for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.documents
    where documents.id = conversations.document_id
      and documents.user_id = (select auth.uid())
  )
);

create policy "Users can manage their messages"
on public.messages for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.conversations
    where conversations.id = messages.conversation_id
      and conversations.user_id = (select auth.uid())
  )
);

create policy "Users can read their processing jobs"
on public.processing_jobs for select to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.claim_processing_job()
returns setof public.processing_jobs
language sql
security definer
set search_path = ''
as $$
  update public.processing_jobs
  set
    status = 'processing',
    attempts = attempts + 1,
    started_at = now(),
    updated_at = now()
  where id = (
    select id
    from public.processing_jobs
    where (
        status = 'queued'
        or (status = 'processing' and updated_at < now() - interval '10 minutes')
      )
      and attempts < 5
    order by created_at
    for update skip locked
    limit 1
  )
  returning *;
$$;

revoke all on function public.claim_processing_job() from public, anon, authenticated;
grant execute on function public.claim_processing_job() to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  15728640,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Users can upload documents to their folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Users can read their document objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'documents'
  and owner_id = (select auth.uid()::text)
);

create policy "Users can update their document objects"
on storage.objects for update to authenticated
using (
  bucket_id = 'documents'
  and owner_id = (select auth.uid()::text)
)
with check (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Users can delete their document objects"
on storage.objects for delete to authenticated
using (
  bucket_id = 'documents'
  and owner_id = (select auth.uid()::text)
);

create or replace function public.match_document_chunks(
  p_document_id uuid,
  query_embedding extensions.vector(384),
  match_threshold float default 0.55,
  match_count integer default 8
)
returns table (
  id bigint,
  page_number integer,
  content text,
  similarity float
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    chunks.id,
    chunks.page_number,
    chunks.content,
    -(chunks.embedding OPERATOR(extensions.<#>) query_embedding) as similarity
  from public.document_chunks as chunks
  join public.documents as source_document on source_document.id = chunks.document_id
  where chunks.document_id = p_document_id
    and (
      (select auth.role()) = 'service_role'
      or source_document.user_id = (select auth.uid())
    )
    and chunks.embedding is not null
    and -(chunks.embedding OPERATOR(extensions.<#>) query_embedding) >= match_threshold
  order by chunks.embedding OPERATOR(extensions.<#>) query_embedding
  limit least(match_count, 20);
$$;

create or replace function public.search_document_chunks(
  p_document_id uuid,
  search_query text,
  match_count integer default 8
)
returns table (
  id bigint,
  page_number integer,
  content text,
  rank real
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    chunks.id,
    chunks.page_number,
    chunks.content,
    ts_rank(chunks.search_vector, websearch_to_tsquery('english', search_query)) as rank
  from public.document_chunks as chunks
  join public.documents as source_document on source_document.id = chunks.document_id
  where chunks.document_id = p_document_id
    and (
      (select auth.role()) = 'service_role'
      or source_document.user_id = (select auth.uid())
    )
    and chunks.search_vector @@ websearch_to_tsquery('english', search_query)
  order by rank desc
  limit least(match_count, 20);
$$;

revoke all on function public.match_document_chunks(uuid, extensions.vector, float, integer) from public;
grant execute on function public.match_document_chunks(uuid, extensions.vector, float, integer) to authenticated;
grant execute on function public.match_document_chunks(uuid, extensions.vector, float, integer) to service_role;
revoke all on function public.search_document_chunks(uuid, text, integer) from public;
grant execute on function public.search_document_chunks(uuid, text, integer) to authenticated;
grant execute on function public.search_document_chunks(uuid, text, integer) to service_role;
