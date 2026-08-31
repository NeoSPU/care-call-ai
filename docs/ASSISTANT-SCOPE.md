# Public assistant knowledge scope

This document is the public, infrastructure-free source for assistant identity
and knowledge boundaries across Alex Raixon project sites.

## Shared runtime does not mean shared knowledge

The sites use a common assistant runtime implementation, but each assistant
identity receives only its approved knowledge scope. Browser clients cannot
select or switch tenants, knowledge packs, models, or credentials.

## Assistant scopes

- The assistant on `alexraixon.com` is Alex Raixon's main portfolio assistant.
  It covers Alex's professional background, experience, capabilities, writing,
  collaboration context, and approved summaries of all showcased projects.
- CareCall application, landing, and demo surfaces use the CareCall project
  assistant. It covers only CareCall positioning, workflows, features,
  safeguards, practical-support boundaries, and approved project material.
- FitCoach surfaces use the FitCoach project assistant. It covers only approved
  FitCoach product, feature, fitness-guidance, privacy, and safety material.

The Alex portfolio assistant may summarize CareCall and FitCoach because they
are Alex's projects. This does not merge assistant identities or authorize a
project assistant to load Alex's full profile or another project's knowledge.

Different frontend surfaces of the same product must share the same approved
project facts. In particular, the CareCall application and CareCall landing
must not maintain competing CareCall definitions.

## Content authority

- Alex profile and portfolio facts are owned by the Alex Raixon portfolio
  project.
- CareCall facts are owned by the canonical CareCall project truth.
- FitCoach facts are owned by reviewed FitCoach project documentation.
- Internal deployment topology is maintained separately in the private shared
  runtime repository and is intentionally not mirrored into public projects.

When approved product facts change, update the owning source first and then
update the relevant project assistant pack plus the corresponding summary in
the Alex portfolio assistant.
