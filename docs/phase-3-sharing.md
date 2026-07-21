# Phase 3 read-only sharing

## User workflow

### Current friction

Users copy generated text into email or chat, which strips citations and separates conclusions from their evidence. Sending the source file exposes more information than the recipient needs.

### Core trigger

A user finishes a cited brief or comparison and needs a client, teammate, or interviewer to review the result without creating an account or gaining workspace access.

### Desired outcome

The user creates one link, copies it, and sends a focused read-only view. The recipient sees the findings and cited quotations without seeing the private source file, extracted pages, storage location, or account details.

## Fears and objections checklist

- [x] “Will this expose my original document?” The public payload contains generated findings and cited quotations only.
- [x] “Can someone edit my work?” Public routes provide no write controls or authenticated workspace access.
- [x] “Can I turn the link off?” Owners can revoke a link immediately.
- [x] “Will the link remain active forever?” Every link expires after 30 days.
- [x] “What happens if someone steals the database?” The database stores a SHA-256 token hash, not the capability token from the URL.
- [x] “Can old links reveal deleted work?” Foreign-key cascades delete share records with their summary, comparison, source document, or account.
- [x] “Can recipients verify claims?” Shared views keep page numbers and verbatim evidence quotations beside the relevant findings.

## Security model

The API generates 32 random bytes and returns the base64url token once. The database stores only its SHA-256 hash. Creating a replacement link revokes the previous link. Public requests receive a purpose-built response that omits user IDs, model metadata, token usage, full extracted pages, source files, and signed storage URLs.
