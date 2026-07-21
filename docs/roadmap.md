# Product roadmap

## User job

### Current friction

Readers copy sections into generic chat tools, receive shallow summaries, lose previous results, and spend time checking whether the model missed important context.

### Core trigger

A report, research paper, specification, transcript, or article arrives before the reader has time to review it fully.

### Desired outcome

The reader creates a useful first-pass brief, verifies important claims against the source, asks focused follow-up questions, and exports the result.

## Fears and objections checklist

- [x] The interface warns readers to verify important details.
- [x] The interface explains when the application sends source text.
- [x] The interface shows the preview limit before submission.
- [x] The interface shows processing stages during slow requests.
- [x] The interface preserves the source after a failed request.
- [x] The interface supports copying and exporting results.
- [x] Page-level citations connect claims to uploaded documents.
- [x] Document controls let users delete private files and saved workspace data.
- [x] Extraction coverage identifies PDFs that contain scanned pages.
- [ ] OCR will make fully scanned PDFs searchable in Phase 3.

## Phase 1: Reliable text workflow

Acceptance criteria:

- [x] Git no longer tracks installed dependencies.
- [x] The project uses Node.js 24 LTS.
- [x] The frontend uses React, TypeScript, and Vite.
- [x] Users can select brief format, depth, and audience.
- [x] Users see validation, progress, errors, retry actions, and success actions.
- [x] Users can copy, download, and revisit briefs during the current session.
- [x] The API validates input and returns safe errors.
- [x] The prompt resists instructions embedded in source material.
- [x] Automated tests cover the frontend and API.
- [x] CI runs tests, type checks, and builds.

## Phase 2: Grounded document workspace

Acceptance criteria:

- [x] Users can authenticate and manage their workspaces.
- [x] Users can upload PDF, DOCX, Markdown, and text files.
- [x] A background worker parses, chunks, and indexes documents.
- [x] The interface reports upload, parsing, indexing, and generation progress.
- [x] Brief claims link to page-level source passages.
- [x] Users can ask questions and receive cited answers.
- [x] Users can search, rename, tag, and delete documents.
- [x] Storage access uses signed URLs and ownership checks.

## Phase 3: Evaluation and collaboration

Acceptance criteria:

- [x] Users can compare multiple document versions.
- [x] Users can create read-only share links.
- [ ] An evaluation suite measures faithfulness, citation correctness, coverage, latency, and cost.
- [ ] The system records prompt versions and model metadata.
- [ ] Dashboards report failures, latency, token usage, and cost.
- [ ] End-to-end tests cover upload through export and deletion.
- [ ] OCR extracts text from fully scanned PDFs.
