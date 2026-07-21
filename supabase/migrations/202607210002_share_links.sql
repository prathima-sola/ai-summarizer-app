create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resource_type text not null check (resource_type in ('summary', 'comparison')),
  summary_id uuid references public.summaries(id) on delete cascade,
  comparison_id uuid references public.comparisons(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  view_count integer not null default 0 check (view_count >= 0),
  last_viewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (resource_type = 'summary' and summary_id is not null and comparison_id is null)
    or
    (resource_type = 'comparison' and comparison_id is not null and summary_id is null)
  )
);

create unique index share_links_active_summary_idx
  on public.share_links (summary_id)
  where revoked_at is null and summary_id is not null;

create unique index share_links_active_comparison_idx
  on public.share_links (comparison_id)
  where revoked_at is null and comparison_id is not null;

create index share_links_user_created_idx
  on public.share_links (user_id, created_at desc);

alter table public.share_links enable row level security;

create policy "Users can read their share link metadata"
on public.share_links for select to authenticated
using ((select auth.uid()) = user_id);
