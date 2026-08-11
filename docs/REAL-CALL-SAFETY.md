# Real CALL-E Call Safety Notes

CareCall can trigger real outbound phone calls through CALL-E. Treat every real
call as a side effect that requires consent, operator review, and a small
approved batch.

## Real-Call Preconditions

Before any real call:

- The participant has explicit consent or an approved outreach basis.
- The phone number is valid E.164 and belongs to the approved participant or
  caregiver/staff contact.
- Any person who may answer the phone is listed as an authorized answerer if
  they may answer intake questions for the recipient.
- The care profile has condition, severity, language, timezone, and call
  suitability.
- The recipient is not marked `blocked` or `do_not_call`.
- The operator has reviewed the exact preflight list and idempotency keys.
- The operator has checked the preflight authorized-answerer line for the
  selected recipient.
- CALL-E CLI readiness passes: `calle --help`, `calle auth status`, and
  `calle mcp tools`.
- The final go/no-go checklist in `docs/FINAL-DEMO-CHECKLIST.md` is complete.

## Who Can Be Auto-Called

Auto-call eligible:

- Non-critical recipients.
- Valid consent or approved outreach.
- Direct call suitability.
- Named recipient, or an authorized answerer listed on the recipient card.
- No unresolved preflight blockers.

Human-led only:

- Critical cases.
- Blocked records.
- Severe dementia or otherwise unsuitable direct-call profiles.
- Special-handling cases that require caregiver/staff review.
- Missing consent, missing evidence, invalid phone, or unclear route.
- Unknown answerer who is not approved to answer intake questions.

## Demo Batch Policy

For the hackathon video:

- Use one to three approved real participants.
- Prefer one non-critical auto-call for the first recorded proof.
- Avoid calling vulnerable recipients directly unless the charity/support
  organization has explicitly approved that route.
- Use caregiver/staff contacts for moderate or severe cognitive impairment
  scenarios unless direct calling has been reviewed as suitable.
- Do not expose full phone numbers, private addresses, or consent records in the
  video.

## What Tests And Dry Runs May Do

Allowed:

- Run backend tests with fake CALL-E runners.
- Run frontend tests.
- Run the frontend preflight screen, or call backend `/preflight` with the
  configured backend bearer credential.
- Run CALL-E readiness checks that do not place calls.

Not allowed:

- Running `calle run_call` from tests.
- Placing exploratory real calls.
- Running a batch whose exact recipient list has changed after approval.
- Continuing intake with someone who is not the named recipient or an
  authorized answerer.
- Calling blocked, critical, or special-handling recipients unattended.

## Stop Conditions

Stop intake and route to human review if the recipient:

- appears distressed, confused in a concerning way, or unable to continue;
- asks to stop;
- reports immediate danger, severe pain, a fall, no food, no medication access,
  or unsafe living conditions;
- asks for medical, legal, financial, emergency, password, banking, or identity
  help.

CareCall should capture practical needs and urgency. It must not provide
diagnosis, dosage advice, legal advice, financial advice, or emergency triage.
