# Operations guide

## Service checks

| Check | Purpose | Expected response |
| --- | --- | --- |
| `GET /health` | Confirms that the Node process can serve requests | HTTP 200 with `status`, `service`, `release`, and `uptimeSeconds` |
| `GET /ready` | Confirms database access and reports worker mode | HTTP 200 with `status: ready` and dependency checks |
| Frontend root | Confirms that Vercel serves the client bundle | HTTP 200 |

The `Uptime probe` GitHub workflow checks the frontend and API readiness every six hours. Render’s free tier can sleep during inactivity, so the API probe allows up to 90 seconds and retries twice.

## Structured request logs

The API writes one JSON record for each request outside `/health`.

```json
{
  "level": "info",
  "event": "http_request",
  "requestId": "request-id",
  "cfRay": "cloudflare-trace-id",
  "method": "GET",
  "path": "/ready",
  "status": 200,
  "durationMs": 42
}
```

Failed handlers log `request_failed`. Failed dependency checks log `readiness_failed`. Search Render logs by `requestId` to follow one failed browser action. Use `cfRay` when comparing application logs with Cloudflare activity.

## Production smoke workflow

The manual or weekly `Production smoke` workflow runs the full browser lifecycle. It creates a temporary confirmed Supabase user, uploads a fixture, waits for processing, generates and exports a cited brief, creates and revokes a share, deletes the document, and removes the temporary user during teardown.

Configure these GitHub values:

| Type | Name | Value |
| --- | --- | --- |
| Repository variable | `E2E_BASE_URL` | `https://ai-summarizer-app-zeta.vercel.app` |
| Repository variable | `E2E_ENABLED` | `true` when weekly paid-provider calls are acceptable |
| Repository secret | `SUPABASE_URL` | Production Supabase project URL |
| Repository secret | `SUPABASE_PUBLISHABLE_KEY` | Production publishable key |
| Repository secret | `SUPABASE_SERVICE_ROLE_KEY` | Production service-role key |

Never expose the service-role key through a `VITE_` variable or commit it to the repository.

## Incident checklist

1. Open `/health`. If it fails, inspect the Render deployment and startup logs.
2. Open `/ready`. If health passes and readiness fails, inspect Supabase availability and backend environment variables.
3. Search Render logs by the request ID shown to the user.
4. Check the job status and latest processing error for document failures.
5. Confirm the worker mode in `/ready`. Restart the external worker or the API when embedded worker mode stops polling.
6. Re-run the production smoke workflow after the service recovers.
7. Confirm teardown removed the temporary user, files, records, and public link.

## Alerting upgrade path

The repository provides uptime detection and structured diagnostic logs without a third-party account. Add Sentry or another error tracker when the project has an alert destination and DSN. Send request IDs and release metadata, but do not send document text, extracted pages, model prompts, or signed source URLs.
