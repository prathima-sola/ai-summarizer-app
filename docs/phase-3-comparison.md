# Phase 3 document comparison

## User workflow

Readers select an earlier and later document from their private workspace. Briefly reports material additions, removals, changed claims, and meaningful unchanged commitments. Each finding links to the page and quotation that supports it.

## Trust controls

- The API verifies ownership and processing status for both documents.
- The prompt labels each source as earlier or later and treats uploaded text as untrusted content.
- Added findings must cite the later document.
- Removed findings must cite the earlier document.
- Changed findings must cite both documents.
- The server checks every quotation against extracted text before saving the comparison.
- The interface states comparison limits instead of hiding unsupported conclusions.

## Persistence

The `comparisons` table stores the ordered document IDs, structured findings, citations, prompt version, model, token usage, and latency. Row-level security restricts saved comparisons to their owner. Deleting either source also deletes comparisons that depend on it.
