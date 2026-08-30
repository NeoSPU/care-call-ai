# Care Call AI

Care Call AI is a condition-aware CALL-E app for charities and care support teams.

It helps coordinators safely prepare outreach rounds, run no-call preflight, place a small approved CALL-E batch, and turn phone conversations into practical service requests and printable delivery orders.

## Product Promise

**Care seen. Needs heard. Help delivered.**

- **Care seen** - dashboard statistics show recipient readiness, safety categories, condition mix, and urgent callback pressure.
- **Needs heard** - the operator panel prepares the approved auto-call batch and keeps critical/operator-only recipients out of unattended automation.
- **Help delivered** - call outcomes become structured service requests and printable fulfilment orders.
- **Urgent Callback** - recipient-triggered callback requests appear in a separate priority queue. This is urgent support callback handling, not an emergency medical service.

## Why This Exists

Care teams spend a lot of time calling vulnerable people, listening carefully, writing down requests, and routing those requests to delivery, medication, transport, cleaning, laundry, home help, or other support teams.

The phone call is only useful if the person's needs are understood and nothing is lost between the conversation and the actual help being delivered.

Care Call AI uses CALL-E inside a safer workflow:

- recipient safety categories;
- condition-aware call goals;
- trusted answerers;
- no-call preflight;
- exact approval before live calls;
- structured service request generation.

## Screens

- `/dashboard` - Care seen statistics.
- `/dashboard/operator` - Needs heard auto-call round preparation.
- `/dashboard/preflight` - no-call preflight and approval gate.
- `/dashboard/urgent-callback` - priority callback queue.
- `/dashboard/recipients` - recipient cards.
- `/dashboard/orders/print` - Help delivered summary and printable orders.

## Safe Defaults

The project is safe by default:

- tests use fake CALL-E runners;
- no-call preflight places zero calls;
- live calls are disabled unless explicitly enabled;
- maximum live batch size is `1`;
- real phones are not committed;
- protected backend calls require a bearer token;
- browser code does not receive backend credentials.

## Local Run

Copy the env example if needed:

```bash
cp .env.example .env.local
```

Fill the required backend, operator, and optional CALL-E values in `.env.local`.
The Docker backend and local Next.js dev server both load this file without
printing secret values.

Start the backend in Docker:

```bash
make demo-up
```

In another terminal, verify the backend:

```bash
make demo-smoke
```

Start the frontend locally in a second terminal:

```bash
npm --prefix frontend install
npm --prefix frontend run dev
```

Open:

```text
http://localhost:3000
```

Default local demo login:

```text
operator: carecall-coordinator
password: carecall-demo-password
```

Use port `3000` for the frontend and `8000` for the backend in the public demo
repository.

## Environment Variables And Secret Placement

Use `.env.local` for local development. For hosted deployments, place the same
values in the secret manager or environment variable settings of the relevant
runtime. Do not commit real values.

Backend runtime only:

```text
CARECALL_BACKEND_API_TOKEN=<long shared frontend-to-backend bearer token>
CARECALL_CALLE_PROVIDER=api
CARECALL_CALLE_API_BASE_URL=https://api.heycall-e.com
CARECALL_CALLE_API_KEY=<official CALL-E dashboard Access Key>
CARECALL_CALLE_REGION=GB
CARECALL_CALLE_TIMEOUT_SECONDS=45
CARECALL_LIVE_CALLS_ENABLED=true
CARECALL_MAX_LIVE_BATCH_SIZE=1
```

Frontend server runtime only:

```text
CARECALL_API_BASE_URL=https://<your-backend-origin>
CARECALL_BACKEND_API_TOKEN=<same bearer token configured in the backend>
CARECALL_OPERATOR_USERNAME=<operator username>
CARECALL_OPERATOR_PASSWORD=<operator password>
CARECALL_AUTH_SECRET=<long random cookie/session signing secret>
CARECALL_SIRI_CALLBACK_TOKENS=rec-001=<recipient callback token>
```

Optional frontend server runtime variables:

```text
CH_RAIXON_ENABLED=false
CH_RAIXON_API_URL=<assistant API URL if enabled>
CH_RAIXON_SERVICE_TOKEN=<assistant service token if enabled>
CARECALL_SUPPORT_EMAIL_ENDPOINT=<server-side support delivery endpoint>
CARECALL_SUPPORT_EMAIL_TOKEN=<server-side support delivery token>
CARECALL_SUPPORT_RATE_LIMIT_KEY_SECRET=<long random rate-limit secret>
```

Never place backend tokens, CALL-E keys, assistant service tokens, or support
delivery tokens in variables prefixed with `NEXT_PUBLIC_` or `VITE_`. Browser
code must call same-origin frontend routes only; those routes attach server-side
credentials when talking to protected backend services.

## Tests

Run the product gate:

```bash
make test
```

Useful individual checks:

```bash
make backend-test
make frontend-test
make frontend-build
make secrets-check
```

## CALL-E Readiness

Configure the official CALL-E dashboard Access Key once in `.env.local`:

```bash
CARECALL_CALLE_PROVIDER=api
CARECALL_CALLE_API_BASE_URL=https://api.heycall-e.com
CARECALL_CALLE_API_KEY=<official CALL-E dashboard Access Key>
CARECALL_CALLE_REGION=GB
CARECALL_CALLE_TIMEOUT_SECONDS=45
```

Do not run real outbound calls from ad hoc CLI commands. In Care Call AI, real
calls must go through the guarded browser workflow: Operator Panel selection,
Round preflight, four confirmation checkboxes, and the exact authorization
phrase shown in the UI.

## Generic Deployment Notes

The public demo can be deployed on any standard web and container platform:

1. Build and run the Python backend container.
2. Expose the backend through HTTPS.
3. Configure the backend runtime secrets listed above.
4. Deploy the Next.js frontend as a server-rendered app.
5. Configure the frontend server runtime secrets listed above.
6. Set the frontend `CARECALL_API_BASE_URL` to the HTTPS backend origin.
7. Confirm that unauthenticated backend API requests return `401`.
8. Confirm that authenticated frontend proxy requests return dashboard data.
9. Run the no-call smoke checks before any live CALL-E call.

For a scalable production shape, use a protected backend API behind HTTPS, a
durable database, queue workers for retries and busy recipients, and a load
balancer in front of horizontally scalable services. The public repository does
not include provider-specific cluster scripts or private infrastructure notes.

## Siri Callback MVP

Apple Shortcuts can submit a recipient-triggered callback request to:

```text
POST https://<your-carecall-frontend-domain>/api/callback-requests
Authorization: Bearer <recipient-callback-token>
Content-Type: application/json
```

Map recipient callback tokens in the Next.js server environment only:

```text
CARECALL_SIRI_CALLBACK_TOKENS=rec-001=<recipient-callback-token>
```

After frontend token validation, the protected backend starts an immediate
CALL-E callback for eligible recipients and records the linked run in the
Urgent Callback queue. The MVP default is no more than three automatic
recipient-triggered callbacks per recipient per day. It is not an emergency
medical service.

## Final Real Call

For final approved demos only, edit the test recipient card in the browser,
enter the consented phone number, select only that eligible recipient, run Round
preflight, complete every approval checkbox, type the authorization phrase shown
in the UI, and start the call from the browser. Stop if consent, answerer
identity, route, keyset, or participant comfort is uncertain.

## Hackathon Submission

CALL-E contribution material:

```text
contribution/awesome-phone-call-agents/
```

Suggested contribution areas:

- `Apps` for the full Care Call AI operator workflow.
- `Agent Skills` for the reusable CareCall intake skill in
  `agent-skills/carecall-intake/SKILL.md`.

## Public Safety Note

Care Call AI is not a CRM replacement, medical device, emergency service, or clinical decision system. It is a care-intake and service-request workflow that helps coordinators use CALL-E responsibly for approved outreach.
