alter table public.processing_jobs
  drop constraint processing_jobs_job_type_check;

alter table public.processing_jobs
  add constraint processing_jobs_job_type_check
  check (job_type in ('parse', 'embed', 'summarize', 'compare'));
