# CareCall Three-Minute Demo Script

This script is for the hackathon video and live judge walkthrough. It assumes
the final recording uses approved real participants or approved internal test
numbers. For practice runs, use the no-call preflight only.

## Before Recording

1. Confirm CALL-E is installed and authenticated with the commands in
   `CALL-E-installation-guide.md`.
2. Complete the final live-call gate in `docs/FINAL-DEMO-CHECKLIST.md`.
3. Confirm the approved participant list, consent evidence, phone numbers,
   care profiles, and call suitability.
4. Keep the first real demo batch small: one non-critical auto-call recipient is
   enough to prove the path without wasting the 20 free calls.
5. For practice, start the app:

   ```bash
   make demo-up
   ```

   For the final live test with the fictional `Max Neous` card, supply the real
   approved phone only in the local shell:

   ```bash
   CARECALL_DEMO_MAX_PHONE=+44... LIVE_DEMO_ACK=EXECUTE_LIVE_CALLS make demo-live-max-up
   ```

6. Open `http://localhost:3001/dashboard`.

## 0:00-0:30 Opening

Say:

CareCall is a condition-aware CALL-E intake layer for charities and care
services. It helps a coordinator safely run an outreach round, adapt calls to a
person's condition, and turn phone conversations into service requests.

Show:

- Daily Round Control
- CALL-E credits
- Automation Queue
- Needs Human Attention

## 0:30-1:10 Recipient Safety And Selection

Show the Recipient Call List.

Explain:

- Non-critical recipients can be selected for the automated CALL-E round.
- Critical, blocked, and special-handling recipients are visible but not placed
  into unattended automation.
- Operators can sort by criticality, group by delivery area, and open a
  recipient card before deciding.
- Authorized answerers are part of the care card, so the agent knows whether a
  caregiver such as Marija may answer intake questions for Alex.

Point out examples:

- A non-critical recipient selected for automated calling.
- A special-handling Alzheimer's profile kept under human review.
- A blocked/severe dementia profile excluded from automation.
- A critical case routed to operator-led contact.

## 1:10-1:45 No-Call Preflight

Open `http://localhost:3001/dashboard/preflight`.

Explain:

- Preflight validates the exact call list before approval.
- Dry run places zero calls.
- The coordinator reviews masked numbers, routes, status, and idempotency keys.
- Real execution requires the exact approval phrase and the same pending key
  set.

Optional backend proof:

Run:

```bash
curl -H "Authorization: Bearer ${CARECALL_BACKEND_API_TOKEN:-carecall-local-backend-token}" \
  http://localhost:8001/preflight
```

Then show:

- `dry_run: true`
- `real_calls_placed: 0`
- ready and blocked preview rows
- authorized answerer line for the selected real-call recipient

## 1:45-2:25 Real CALL-E Moment

For the final video only, run one approved real CALL-E call through the controlled
Phase 4 execution path after preflight and approval.

Say:

This is the only part that spends a CALL-E credit. We keep it small because the
hackathon grants 20 free calls after registration.

Show:

- The approved recipient.
- The generated condition-aware call goal.
- The stored run id and the CALL-E provider status.
- The `Import latest CALL-E result` action after the call reaches a terminal
  status.

Do not include private phone numbers or consent evidence in the recording.

## 2:25-3:00 Service Requests And Close

Return to the dashboard.
Show the imported request created from the CALL-E result, then open
`/dashboard/orders/print` to display the printable order.

Show:

- Service Requests lanes.
- Urgent medication/review examples.
- Printable service order page at
  `http://localhost:3001/dashboard/orders/print`.

Close with:

CareCall is not replacing the charity CRM. It gives care coordinators a safe
phone-intake layer that can later send structured requests into systems such as
Bitrix24, Okdesk, or charity case-management tools.
