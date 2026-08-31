# CareCall AI project rules

## Product source of truth (mandatory)

Before changing product copy, README content, assistant knowledge, SEO, demo or
hackathon materials, read `docs/CARECALL-PROJECT-TRUTH.md`.

That document is the canonical product-positioning source. Its authoritative
copy lives in the private repository at:

`/Users/rick/Documents/Dev/AI Agents/agent_workflow/call-e-hackathon/docs/CARECALL-PROJECT-TRUTH.md`

The same file is mirrored into the related public demo, CareCall landing, Alex
Raixon portfolio repositories, and the CareCall tenant directory in the shared
assistant runtime. Never introduce a competing product definition in another
document or knowledge pack. If positioning changes:

1. update the authoritative file first;
2. copy it byte-for-byte to every repository listed in that file;
3. update all affected user-facing copy and assistant knowledge in the same
   change;
4. run `python3 scripts/check_project_truth_sync.py` from the private repo;
5. keep medical and emergency safety disclaimers, but never describe CareCall
   AI as a medical, healthcare, clinical, patient-care, or emergency-response
   product.

Use `beneficiary`, `person supported`, or `recipient` for the people contacted
through CareCall. Do not call them `patients`. Medication pickup or delivery is
practical logistics support; it is not prescribing, dosage advice, clinical
monitoring, or treatment.

## Assistant identity and deployment topology (mandatory)

Before changing any assistant integration, knowledge pack, tenant routing,
voice/text prompt, frontend proxy, namespace, Helm release, or assistant URL,
read `docs/ASSISTANT-SCOPE.md`.

That public document intentionally excludes internal namespace, release,
image, token, and infrastructure details. When working inside the authorized
private workspace on deployment configuration, also read the canonical
operational registry in the shared `ch-raixon` runtime. Never copy the private
operational registry into this public repository.

The runtime code is shared, but assistant knowledge is not:

- `alexraixon.com` uses the broad `alexraixon` portfolio assistant, covering
  Alex's background, capabilities, writing, collaboration context, and all
  approved portfolio projects;
- CareCall application, landing, and demo surfaces use the project-specific
  `carecall` assistant and must not load Alex's full profile or another
  project's knowledge;
- FitCoach surfaces use the project-specific `fitcoach` assistant.

The Alex assistant may contain an approved CareCall summary because CareCall
is one of Alex's projects. That summary must follow the canonical CareCall
truth, but it does not merge the Alex and CareCall assistant identities.

When assistant scope changes, update its authoritative source first, mirror the
sanitized public scope byte-for-byte to public repositories, and run:

`python3 scripts/check_assistant_truth_sync.py`

from the `ch-raixon` repository.
