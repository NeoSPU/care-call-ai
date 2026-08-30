# Pull Request Description Draft

## Summary

Adds Care Call AI, a condition-aware care outreach app for safe CALL-E rounds.
Care Call AI helps coordinators prepare approved call batches, run no-call
preflight, place a small guarded CALL-E batch, and turn conversations into
practical service requests and printable delivery orders.

Suggested contribution areas: `Apps` and `Agent Skills`.

Suggested path:

```text
apps/typescript/care-call-ai/
agent-skills/carecall-intake/
```

## What Makes It Different

Existing examples in `awesome-phone-call-agents` cover useful primitives such as
batch running, callback-window coordination, approval gates, delegated calls,
and broker/OAuth clients. Care Call AI combines those safety patterns into a
domain-specific support workflow:

- recipients have condition, severity, consent, language, timezone, and call
  suitability;
- Alzheimer's/dementia handling adapts by severity;
- critical, blocked, and special-handling records are visible but not placed
  into unattended automation;
- no-call preflight shows masked phones, routes, blocked reasons, and
  idempotency keys;
- urgent callback requests are handled in a separate priority queue;
- generated outputs are coordinator-ready service requests and printable orders
  rather than generic transcripts.
- reusable intake-agent rules preserve explicit recipient requests and prevent
  the agent's own example list from becoming generated orders.

## Product Flow

- **Care seen**: statistics-only dashboard for recipient readiness, safety
  categories, condition mix, and urgent callback pressure.
- **Needs heard**: operator panel for auto-call round selection, safety review,
  and CALL-E preflight/approval.
- **Help delivered**: structured service requests and printable fulfilment
  orders for food, medication, transport, cleaning, laundry, garden work,
  repairs, and other support.
- **Urgent Callback**: recipient-triggered priority callback queue. This is
  support callback handling, not an emergency medical service.

## Safety

- Tests and no-call preflight paths place zero real calls.
- Real calls require CALL-E readiness, live-call env gates, valid
  consent/outreach basis, reviewed preflight, selected-recipient approval, and
  an authorization phrase. Backend idempotency keys remain a server-side safety
  mechanism, not an operator-facing workflow step.
- Examples use masked or fictional phone data.
- The app documents stop conditions for distress, emergency, medical/legal/
  financial requests, and unsafe living situations.
- Browser code never receives backend or CALL-E credentials.
- The included CareCall intake skill routes prohibited or region-restricted
  requests to coordinator review rather than printable fulfilment.

## Verification

```bash
PYTHONPATH=backend python3 -m unittest discover backend/tests
npm --prefix frontend test -- --run
npm --prefix frontend run build
make secrets-check
```

## Notes

Care Call AI is an intake and dispatch layer. It is intentionally not a CRM
replacement, medical device, emergency service, or clinical decision system.
