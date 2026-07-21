alter table public.documents
  add column ocr_status text not null default 'not_needed'
    check (ocr_status in ('not_needed', 'processing', 'completed', 'partial', 'failed')),
  add column ocr_page_count integer not null default 0
    check (ocr_page_count >= 0),
  add column ocr_confidence integer
    check (ocr_confidence is null or ocr_confidence between 0 and 100);

comment on column public.documents.ocr_status is
  'Outcome of page-image OCR for sparse PDF pages.';

comment on column public.documents.ocr_page_count is
  'Number of PDF pages whose readable text came from OCR.';

comment on column public.documents.ocr_confidence is
  'Mean Tesseract confidence for successfully recovered pages.';
