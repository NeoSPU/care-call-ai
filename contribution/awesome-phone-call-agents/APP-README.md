# Care Call AI

Care Call AI is a condition-aware CALL-E user-facing app for charities and care
support teams.

It helps coordinators safely prepare outreach rounds, run no-call preflight,
place a small approved CALL-E batch, and turn phone conversations into practical
service requests and printable delivery orders.

Product promise:

```text
Care seen. Needs heard. Help delivered.
```

## Contribution Area

Suggested location in `awesome-phone-call-agents`:

```text
apps/web/care-call-ai/
```

Care Call AI fits the `Apps` area because it is a complete operator workflow,
not only a prompt or single skill. It includes a dashboard, operator panel,
preflight/approval gate, CALL-E execution path, urgent callback queue, and
service request handoff.

## What It Demonstrates

- **Care seen**: coordinator statistics for recipient readiness, safety
  categories, condition mix, call eligibility, and urgent callback pressure.
- **Needs heard**: an operator panel that prepares the current auto-call round,
  keeps critical and operator-only recipients out of unattended automation, and
  shows the exact preflight list before any live call.
- **Help delivered**: completed call outcomes become structured service
  requests for food, medication, home help, laundry, cleaning, transport, garden
  work, repairs, or other support.
- **Urgent Callback**: recipient-triggered callback requests appear in a
  separate priority queue. This is support callback handling, not an emergency
  medical service.

## Setup

Care Call AI reserves host ports `3000` and `8000`.

```bash
cp .env.example .env
make demo-up
npm --prefix frontend install
python3 scripts/run_frontend_from_env.py
```

Open:

- app: `http://localhost:3000/dashboard`
- backend health: `http://localhost:8000/health`

Default local demo login:

```text
operator: carecall-coordinator
password: carecall-demo-password
```

## Tests

```bash
make test
```

Tests use fake CALL-E runners and never place real calls.

Useful individual checks:

```bash
make final-readiness
make secrets-check
```

## CALL-E Setup

Copy `.env.example` to `.env` once, then keep deployment credentials there or
in your hosting provider's secret manager. For live demos, the backend needs:

```text
CARECALL_BACKEND_API_TOKEN=...
CARECALL_MAX_LIVE_BATCH_SIZE=1
CARECALL_CALLE_PROVIDER=mcp_http
CARECALL_CALLE_MCP_SERVER_URL=https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth
CARECALL_CALLE_AUTH_TOKEN=...
CARECALL_CALLE_REGION=GB
```

Do not run real outbound calls from ad hoc terminal commands. In this app, live
calls must go through the guarded UI path after preflight and explicit operator
approval.

## Dry Run And Preview Behaviour

The default app path is safe:

- `/dashboard/preflight` previews planned calls without placing calls;
- dry-run reports `real_calls_placed: 0`;
- planned calls use masked phones in operator-facing UI;
- each planned call has a stable idempotency key;
- critical, blocked, and operator-only recipients are visible but excluded from
  unattended automation.

## Side Effects

Care Call AI can place real outbound calls only when all live-call gates pass:

- CALL-E is installed and authenticated;
- the live batch size remains intentionally small;
- the operator has reviewed the exact current preflight list;
- the approval keyset still matches the current planned calls;
- the operator completes the required confirmations and exact authorization
  phrase;
- every participant has consent or an approved outreach basis.

For the final approved real-call demo, start the backend with `make demo-up`,
edit the approved participant's phone number in the frontend recipient card,
then complete live mode, four confirmations, and the exact authorization phrase
in the frontend.

## Cancellation And Stop Conditions

Do not start or continue a live call when:

- consent, answerer identity, phone number, language, or comfort is uncertain;
- the recipient is critical, blocked, or marked operator-only;
- the answerer is not the recipient or a trusted answerer;
- the conversation indicates distress, emergency medical need, unsafe living
  situation, legal/financial advice, password/banking details, or identity
  verification requests.

In those cases, the app routes work to human review or urgent support callback
handling. Emergency services are outside the scope of this demo app.

## Credential Handling

- `.env.example` contains placeholders only.
- Browser code never receives the backend bearer token.
- Backend API calls from the frontend go through protected server-side proxy
  routes.
- CALL-E credentials, backend tokens, real phones, and provider secrets must
  remain local environment values or deployment secrets.
- `make secrets-check` should pass before publishing or recording.

## Demo Data

The public demo uses fictional recipients and masked phone numbers. Real
participant details for a final demo call must be injected locally and must not
be committed.

## Demo Path

1. Open **Care seen** at `/dashboard`.
2. Show recipient readiness, category counts, condition mix, and urgent callback
   pressure.
3. Open **Needs heard** at `/dashboard/operator`.
4. Review and adjust the current auto-call round.
5. Run `/dashboard/preflight` and verify the exact dry-run list.
6. For final recording only, run one approved CALL-E call.
7. Open **Help delivered** at `/dashboard/orders/print`.
8. Show generated service requests and printable delivery orders.
9. Open **Urgent Callback** to show the separate priority queue.

Full script: `docs/DEMO-SCRIPT.md`.
Safety notes: `docs/REAL-CALL-SAFETY.md`.
Final live checklist: `docs/FINAL-DEMO-CHECKLIST.md`.
