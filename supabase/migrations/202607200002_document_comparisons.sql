create table public.comparisons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  base_document_id uuid not null references public.documents(id) on delete cascade,
  target_document_id uuid not null references public.documents(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  structured_content jsonb not null default '{}'::jsonb,
  citations jsonb not null default '[]'::jsonb,
  model text not null,
  prompt_version text not null,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  created_at timestamptz not null default now(),
  check (base_document_id <> target_document_id)
);

create index comparisons_user_created_idx
  on public.comparisons (user_id, created_at desc);

alter table public.comparisons enable row level security;

create policy "Users can read their comparisons"
on public.comparisons for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can delete their comparisons"
on public.comparisons for delete to authenticated
using ((select auth.uid()) = user_id);
