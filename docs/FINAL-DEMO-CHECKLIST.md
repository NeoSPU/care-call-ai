# Final Live CALL-E Demo Checklist

Use this checklist only for the final hackathon recording or judge walkthrough.
Practice runs must stop at dry run.

## 1. Participant Readiness

- [ ] The participant or caregiver/staff contact is approved for the recording.
- [ ] Anyone who may answer the phone is listed as an authorized answerer on
      the recipient card, or the call must stop if they answer.
- [ ] If using the `Max Neous` demo card, the real test phone is supplied only
      through `CARECALL_DEMO_MAX_PHONE` and is not committed.
- [ ] Consent or approved outreach basis is documented outside the repository.
- [ ] The participant knows this is a real outbound CALL-E call.
- [ ] The participant can safely stop the call at any time.
- [ ] No full phone numbers, addresses, consent records, or medical documents
      will be shown in the video.

## 2. CALL-E Readiness

Run only safe readiness checks first:

```bash
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 calle --help
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 calle auth status
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 calle mcp tools
```

The tool list must include:

- `plan_call`
- `run_call`
- `get_call_run`

Stop if CALL-E auth, tools, or participant readiness are not confirmed.

## 3. App Readiness

Start the demo stack:

```bash
make demo-reset
```

Open:

- dashboard: `http://localhost:3001/dashboard`
- preflight: `http://localhost:3001/dashboard/preflight`
- print orders: `http://localhost:3001/dashboard/orders/print`

Confirm before continuing:

- [ ] Backend is on port `8001`.
- [ ] Frontend is on port `3001`.
- [ ] `make demo-reset` completed its smoke check.
- [ ] The selected call list contains exactly one eligible demo recipient.
- [ ] The preflight row shows the expected authorized answerer rule.
- [ ] Critical, blocked, staff-only, and unreviewed special-handling recipients
      are not selected for unattended automation.
- [ ] The preflight screen shows exactly one ready idempotency key.

## 4. Final Live Gate

For the final approved real call only, stop the dry-run stack and restart the
backend with the live gate enabled:

```bash
make demo-down
CARECALL_DEMO_MAX_PHONE=+44... LIVE_DEMO_ACK=EXECUTE_LIVE_CALLS make demo-live-max-up
```

Live execution is allowed only when all of these are true:

- [ ] `CARECALL_LIVE_CALLS_ENABLED=true` is set for the backend process.
- [ ] `CARECALL_MAX_LIVE_BATCH_SIZE=1` is set or the default value is in use.
- [ ] `CARECALL_DEMO_MAX_PHONE` is set only in the local shell when the `Max
      Neous` runtime demo card is the selected live recipient.
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
