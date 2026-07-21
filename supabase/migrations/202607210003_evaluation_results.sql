create table public.evaluation_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  artifact_type text not null check (artifact_type in ('summary', 'comparison')),
  summary_id uuid references public.summaries(id) on delete cascade,
  comparison_id uuid references public.comparisons(id) on delete cascade,
  faithfulness_score integer not null check (faithfulness_score between 0 and 100),
  citation_correctness_score integer not null check (citation_correctness_score between 0 and 100),
  coverage_score integer not null check (coverage_score between 0 and 100),
  passed boolean not null,
  details jsonb not null default '{}'::jsonb,
  source_model text not null,
  prompt_version text not null,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  estimated_cost_usd numeric(12, 6) check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  pricing_version text not null,
  evaluator_version text not null,
  created_at timestamptz not null default now(),
  check (
    (artifact_type = 'summary' and summary_id is not null and comparison_id is null)
    or
    (artifact_type = 'comparison' and comparison_id is not null and summary_id is null)
  )
);

create unique index evaluation_results_summary_version_idx
  on public.evaluation_results (summary_id, evaluator_version);

create unique index evaluation_results_comparison_version_idx
  on public.evaluation_results (comparison_id, evaluator_version);

create index evaluation_results_user_created_idx
  on public.evaluation_results (user_id, created_at desc);

alter table public.evaluation_results enable row level security;

create policy "Users can read their evaluation results"
on public.evaluation_results for select to authenticated
using ((select auth.uid()) = user_id);
