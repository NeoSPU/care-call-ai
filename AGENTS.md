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
