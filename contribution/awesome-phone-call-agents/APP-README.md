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
apps/typescript/care-call-ai/
```

Care Call AI fits the `Apps` area because it is a complete operator workflow.
It also includes a reusable `Agent Skills` contribution in
`agent-skills/carecall-intake/SKILL.md` for explicit-request-only practical
support intake.

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

The public demo uses backend port `8000` and frontend port `3000`.

```bash
cp .env.example .env.local
make demo-up
make demo-smoke
npm --prefix frontend install
npm --prefix frontend run dev
```

Open:

- app: `http://localhost:3000`
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
make secrets-check
make backend-test
make frontend-test
make frontend-build
```

## CALL-E Setup

Put the official CALL-E dashboard Access Key in `.env.local` for backend-only
runtime use:

```bash
CARECALL_CALLE_PROVIDER=api
CARECALL_CALLE_API_BASE_URL=https://api.heycall-e.com
CARECALL_CALLE_API_KEY=<official CALL-E dashboard Access Key>
CARECALL_CALLE_REGION=GB
CARECALL_CALLE_TIMEOUT_SECONDS=45
```

Do not run real outbound calls from ad hoc CLI commands. In this app, live
calls must go through the guarded app execution path after preflight and
explicit operator approval in the browser UI.

## No-Call Preflight And Preview Behaviour

The default app path is safe:

- `/dashboard/preflight` previews planned calls without placing calls;
- no-call preflight reports `real_calls_placed: 0`;
- planned calls use masked phones in operator-facing UI;
- the backend keeps stable idempotency keys out of the operator-facing UI;
- critical, blocked, and operator-only recipients are visible but excluded from
  unattended automation.

## Side Effects

Care Call AI can place real outbound calls only when all live-call gates pass:

- CALL-E is installed and authenticated;
- backend live calls are explicitly enabled;
- the live batch size remains intentionally small;
- the operator has reviewed the exact current preflight list;
- the approval keyset still matches the current planned calls;
- the operator completes the required confirmations and exact authorization
  phrase;
- every participant has consent or an approved outreach basis.

For the final approved real-call demo, edit the fictional recipient card in the
browser with the consented test phone number, run preflight for that selected
recipient, and approve the live call through the UI confirmation gate.

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

## Agent Skill

The reusable intake skill is in:

```text
agent-skills/carecall-intake/SKILL.md
```

It defines the call behavior that prevents common care-intake mistakes:

- collect only needs explicitly requested or confirmed by the recipient or
  authorized answerer;
- preserve quantities, sizes, delivery dates, and practical constraints;
- ignore the agent's own menu of examples when generating requests;
- handle same-day repeat calls as order updates rather than duplicated intake;
- route distress, unsafe situations, unauthorized answerers, and prohibited or
  region-restricted requests to coordinator review;
- close with a courteous personalized goodbye.

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
5. Run `/dashboard/preflight` and verify the exact no-call planned list.
6. For final recording only, run one approved CALL-E call.
7. Open **Help delivered** at `/dashboard/orders/print`.
8. Show generated service requests and printable delivery orders.
9. Open **Urgent Callback** to show the separate priority queue.

For the final approved live-call demo, edit the fictional recipient card in the
browser with the consented test phone number, run preflight for that selected
recipient, and approve the call through the UI confirmation gate. Stop if
consent, answerer identity, route, keyset, or participant comfort is uncertain.
