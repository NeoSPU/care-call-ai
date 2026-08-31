# CareCall AI — canonical project truth

Status: authoritative product-positioning source  
Canonical repository: `/Users/rick/Documents/Dev/AI Agents/agent_workflow/call-e-hackathon`  
Canonical file: `docs/CARECALL-PROJECT-TRUTH.md`  
Last updated: 2026-08-31

This is the single source of truth for CareCall AI positioning. README files,
website copy, SEO, assistant knowledge packs, demo scripts, hackathon forms,
presentations, and repository descriptions must agree with it.

## Canonical positioning

CareCall AI is a practical support outreach and fulfilment coordination
workflow for charities and support organizations. It helps coordinators run
approved CALL-E check-ins with beneficiaries who live at home with severe
illnesses or disabilities and turn explicit everyday needs into reviewed
requests for food and groceries, medication pickup or delivery, transport,
cleaning and other home help, companionship, leisure activities, and other
non-clinical social support.

The organizations using CareCall AI help people manage everyday life in a
difficult situation. They may organize household help, essential deliveries,
transport, social contact, or community activities according to a
beneficiary's needs. CareCall AI helps move a request from conversation to a
human-reviewed handoff; it does not provide the underlying service itself and
does not guarantee fulfilment.

## Canonical short copy

Product category:

```text
Beneficiary Outreach & Practical Support Coordination
```

Primary slogan:

```text
Care seen. Needs heard. Help delivered.
```

Supporting line:

```text
Approved CALL-E check-ins that turn beneficiary conversations into practical support requests.
```

One-sentence description:

```text
CareCall AI helps charities and support organizations run approved CALL-E check-ins with beneficiaries and turn explicit everyday needs into coordinator-reviewed requests for food, medication pickup, transport, home help, companionship, and other non-clinical support.
```

## Intended users and beneficiaries

- Users and customers: charities, disability support organizations, community
  support services, befriending services, volunteer teams, and other
  non-clinical organizations coordinating practical help.
- Beneficiaries: people with severe illnesses or disabilities who live in
  their own homes or flats and receive practical or social support.
- Operators: human coordinators who control outreach eligibility, approve
  calls, review extracted requests, and decide how requests are fulfilled.

Use `beneficiary`, `person supported`, or `recipient`. Do not describe the
people contacted by CareCall AI as `patients`.

## Product boundary

CareCall AI is not:

- a medical, healthcare, clinical, diagnostic, treatment, dosage, monitoring,
  or patient-care application;
- a service for hospitals, clinics, medical institutions, emergency services,
  or emergency-response organizations;
- an emergency line, emergency dispatch system, crisis service, or clinical
  triage tool;
- a replacement for clinicians, emergency services, carers, support workers,
  or human coordinators.

CareCall AI may store condition or accessibility context only to make outreach
appropriate—for example slower pacing, shorter questions, longer pauses,
trusted answerers, consent restrictions, or operator-only handling. This is
communication and safeguarding context, not clinical assessment.

Requests involving medication mean practical logistics such as collecting or
delivering an existing prescription or medicine. CareCall AI does not recommend
medication, change dosages, prescribe, monitor adherence, or give medical
advice. If a conversation indicates immediate danger or a medical emergency,
the automated practical-support workflow stops and the matter is handed to a
human under the organization's own safeguarding and emergency procedures.

## Core workflow

1. **Care seen** — a coordinator reviews consent, contact suitability,
   accessibility and communication preferences, blocked cases, and practical
   support context.
2. **Needs heard** — after explicit human approval, CALL-E asks about current
   everyday support needs and records only what the beneficiary or an
   authorized trusted answerer actually requests.
3. **Help delivered** — CareCall AI imports the conversation result and
   prepares coordinator-reviewed requests and printable handoff sheets for the
   organization or its delivery and volunteer teams.

## Project repository map and downstream runtime

| Role | Repository | Public domain | Truth-file role |
|---|---|---|---|
| Private product (frontend and backend) | `/Users/rick/Documents/Dev/AI Agents/agent_workflow/call-e-hackathon` | `https://care.alexraixon.com` | Authoritative source |
| Public hackathon demo (not publicly deployed) | `/Users/rick/Documents/Dev/AI Agents/agent_workflow/call-e-demo/care-call-ai` | None | Exact mirror |
| Project landing | `/Users/rick/Documents/Dev/AI Agents/agent_workflow/carecall-landing` | `https://about.care.alexraixon.com` | Exact mirror |
| Alex Raixon portfolio | `/Users/rick/Documents/Dev/AI Agents/agent_workflow/raixon-landing` | `https://alexraixon.com` | Exact mirror |
| Shared assistant runtime (downstream; not a fifth project repository) | `/Users/rick/Documents/Dev/AI Agents/agent_workflow/integrations-ch-fitcoach/ch-raixon/knowledge-packs/carecall` | `https://assistant.care.alexraixon.com` | Exact truth mirror plus CareCall tenant knowledge pack |

Edit this file only in the authoritative repository, then copy it byte-for-byte
to the three project mirrors and the CareCall directory in the shared assistant
runtime. Local `AGENTS.md` files must direct future agents back to this
canonical source. A repository-specific document may add implementation
details, but it must not redefine the product, audience, terminology, or
boundaries above.
