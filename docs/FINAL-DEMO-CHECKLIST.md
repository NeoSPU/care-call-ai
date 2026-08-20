# Final Live CALL-E Demo Checklist

Use this checklist only for the final hackathon recording or judge walkthrough.
Practice runs must stop at dry run.

## 1. Participant Readiness

- [ ] The participant or caregiver/staff contact is approved for the recording.
- [ ] Anyone who may answer the phone is listed as an authorized answerer on
      the recipient card, or the call must stop if they answer.
- [ ] If using the `Max Neous` demo card, the operator has edited the approved
      real test phone in the frontend recipient card and saved it.
- [ ] Consent or approved outreach basis is documented outside the repository.
- [ ] The participant knows this is a real outbound CALL-E call.
- [ ] The participant can safely stop the call at any time.
- [ ] No full phone numbers, addresses, consent records, or medical documents
      will be shown in the video.

## 2. CALL-E Readiness

Confirm that the CALL-E dashboard API key is present only in backend `.env` or
backend deployment secrets. Stop if CALL-E credentials or participant readiness
are not confirmed.

## 3. App Readiness

Start the demo stack:

```bash
make demo-up
```

Open:

- dashboard: `http://localhost:3000/dashboard`
- preflight: `http://localhost:3000/dashboard/preflight`
- print orders: `http://localhost:3000/dashboard/orders/print`

Confirm before continuing:

- [ ] Backend is on port `8000`.
- [ ] Frontend is on port `3000`.
- [ ] `make demo-up` started the backend successfully.
- [ ] `python3 scripts/run_frontend_from_env.py` started the frontend
      successfully.
- [ ] The selected call list contains exactly one eligible demo recipient.
- [ ] The preflight row shows the expected authorized answerer rule.
- [ ] Critical, blocked, staff-only, and unreviewed special-handling recipients
      are not selected for unattended automation.
- [ ] The preflight screen shows exactly one ready idempotency key.

## 4. Final Live Gate

For the final approved real call only, configure backend CALL-E values once in
`.env` before starting the app. The approved phone number is edited in the
recipient card, not stored in `.env`.

```text
CARECALL_MAX_LIVE_BATCH_SIZE=1
CARECALL_CALLE_PROVIDER=api
CARECALL_CALLE_API_KEY=...
CARECALL_CALLE_API_BASE_URL=https://api.heycall-e.com
CARECALL_CALLE_REGION=GB
```

Then start the backend with `make demo-up` and the frontend with
`python3 scripts/run_frontend_from_env.py`. All live-call approval happens in
the frontend.

Live execution is allowed only when all of these are true:

- [ ] `CARECALL_MAX_LIVE_BATCH_SIZE=1` is set or the default value is in use.
- [ ] The selected recipient card contains the approved real E.164 phone number.
- [ ] `CARECALL_CALLE_API_KEY` is set only for the backend process.
- [ ] The selected ready key set still matches the backend preflight key set.
- [ ] The operator has checked all four live confirmation boxes:
  - active consent;
  - care route match;
  - exact keyset;
  - irreversible live side effect.
- [ ] The authorization phrase is exactly:

```text
EXECUTE LIVE CALLS
```

Stop if the page reports any support-safe error or if the key set changes.

## 5. Recording Flow

1. Show the dashboard and explain the batch-first workflow.
2. Show recipient categories and why manual/special cases are visible but not
   auto-called.
3. Open preflight and run dry run first.
4. Confirm the preflight row shows the expected authorized answerers.
5. Switch to live only after the dry run result is shown.
6. Execute exactly one approved CALL-E call.
7. After the call reaches a terminal CALL-E status, click
   `Import latest CALL-E result`.
8. Show the imported summary, generated service requests, and print order route.

## 6. Stop Conditions

Stop the demo and do not retry the live call if:

- consent, route, or keyset is uncertain;
- someone answers who is not the named recipient or an authorized answerer;
- the participant sounds distressed or asks to stop;
- the app reports a service error;
- CALL-E returns an auth, readiness, or run error;
- the selected batch contains more than one ready recipient.

Record the issue in technical notes and use the dry-run path for the submitted
video if a safe live call cannot be completed.
