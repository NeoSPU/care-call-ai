# Care Call AI Contribution Safety Checklist

Use this before opening a PR to `CALLE-AI/awesome-phone-call-agents`.

- [ ] No real phone numbers are committed.
- [ ] No CALL-E credentials or auth tokens are committed.
- [ ] No backend bearer token, provider secret, deployment secret, or kubeconfig
      is committed.
- [ ] `make secrets-check` passes before publishing or recording the demo.
- [ ] `make test` passes before publishing or recording the demo.
- [ ] GitHub Actions CI passes on the pushed branch.
- [ ] README states which commands are safe readiness checks.
- [ ] README states which commands can place real calls.
- [ ] README documents setup, side effects, cancellation/stop conditions,
      credential handling, and no-call preflight/preview behaviour.
- [ ] README documents the official CALL-E dashboard Access Key as a backend
      environment secret, never as browser or CLI state.
- [ ] Tests use fake runners and do not run `calle run_call`.
- [ ] No-call preflight route reports zero real calls.
- [ ] Real-call demo participants have consent or approved outreach basis.
- [ ] Critical, blocked, and special-handling recipients are not auto-called.
- [ ] Urgent Callback is described as support callback handling, not an
      emergency medical service.
- [ ] Medical, legal, financial, emergency, password, banking, and identity
      boundaries are documented.
- [ ] Illegal, unsafe, exploitative, age-restricted, and region-restricted
      requests route to coordinator review rather than printable fulfilment.
- [ ] Demo video hides full phone numbers, private addresses, and consent
      records.
- [ ] Public demo data uses fictional or masked people, addresses, and phone
      numbers.
