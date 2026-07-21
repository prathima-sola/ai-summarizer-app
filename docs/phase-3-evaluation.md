# Phase 3 quality evaluation

## Purpose

Briefly needs evidence that generated outputs remain grounded as prompts, models, and document workflows change. The evaluation suite provides a deterministic regression baseline and an authenticated operational dashboard.

## Metrics

### Faithfulness baseline

The evaluator checks each generated claim against its cited source pages. A claim passes when meaningful source tokens support it and every number in the claim appears in those pages. This reproducible proxy catches unsupported dates, percentages, amounts, and low-overlap claims. It does not replace human semantic review.

Passing threshold: 70% or higher.

### Citation correctness

The evaluator normalizes whitespace and verifies each saved quotation against the claimed page. Comparison citations also retain their source document identifier.

Passing threshold: 90% or higher.

### Evidence coverage

Every brief point must reference a valid page. Every comparison finding must contain valid evidence, and changed findings must cover both compared documents.

Passing threshold: 100%.

### Latency, tokens, and cost

Briefly already records model, prompt version, input tokens, output tokens, and request latency for every saved brief and comparison. The dashboard reports average latency, P95 latency, total tokens, failed jobs, and estimated standard API cost.

The `anthropic-2026-05-27` pricing version uses $3 per million input tokens and $15 per million output tokens for Claude Sonnet 4.5. Source: [Anthropic model pricing](https://www-cdn.anthropic.com/files/4zrzovbb/website/3684c2faafb97418665782cea0001f439f74b1d2.pdf).

## Regression fixtures

Run the deterministic suite with:

```bash
cd backend
npm run eval
```

The committed fixtures cover a grounded claim, unsupported numbers, and invalid page evidence. The command exits with a failure code when observed metrics differ from their expected scores.

## Dashboard workflow

Authenticated users open `/app/quality`, select **Evaluate saved outputs**, and review aggregate metrics plus per-output model, prompt, latency, cost, and quality scores. Evaluation results use row-level security and cascade when their underlying output or account gets deleted.
