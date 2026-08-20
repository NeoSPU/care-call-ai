# Care Call AI final demo readiness

This is the no-call readiness gate before final hackathon packaging.

Use it after product changes and before the final real CALL-E recording. It does not replace `docs/FINAL-DEMO-CHECKLIST.md`; it points to the correct final checks and catches local project drift.

## Product story

The demo should show the application in the order of the product promise:

1. **Care seen** - open `/dashboard` and show the statistics-only view.
2. **Needs heard** - open `/dashboard/operator`, select the approved auto-call batch, and run preflight.
3. **Urgent Callback** - show the separate priority queue and explain that it is urgent support callback handling, not an emergency medical service.
4. **Help delivered** - open `/dashboard/orders/print`, show fulfilment summary, filters, and printable orders.

## Safe local readiness command

Run:

```bash
make final-readiness
```

This checks public demo files, final demo documents, local safety defaults, and public submission placeholders.

It does not:

- call CALL-E;
- require cloud network access;
- print secrets;
- validate real participant consent.

## Required manual checks

Before recording a real call:

- complete `docs/FINAL-DEMO-CHECKLIST.md`;
- confirm CALL-E auth using local CALL-E tooling;
- confirm the approved participant or authorized answerer;
- ensure the recipient card lists anyone who may answer;
- keep real phone numbers only in local recipient-card data, never in git or
  `.env`;
- keep `CARECALL_MAX_LIVE_BATCH_SIZE=1`;
- use the exact live authorization phrase only for the approved final call.

## Submission items still completed manually

The readiness command warns, but does not fail, when these are still placeholders:

- public sanitized repository URL;
- CALL-E contribution PR URL;
- YouTube or Vimeo demo video URL.

Those become hard requirements only at Devpost submission time.
