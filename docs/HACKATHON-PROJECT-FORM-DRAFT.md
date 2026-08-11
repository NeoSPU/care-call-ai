# Care Call AI hackathon project form draft

Draft text for the public hackathon project page.

## Project name

```text
Care Call AI
```

## Elevator pitch

```text
Care seen. Needs heard. Help delivered.
```

Alternative longer pitch:

```text
Safe CALL-E check-ins that turn conversations into practical care requests.
```

## About the project

```markdown
## Inspiration

Charities and care services spend a huge amount of time on phone work: calling vulnerable people, checking how they are, asking what they need, and turning those conversations into delivery tasks, medication requests, transport needs, cleaning help, laundry support, garden assistance, small home repairs, or other practical services.

Support teams do not just make the call. They have to listen carefully, write down everything the person asks for, prepare a delivery or service request, and pass that request to the right team: food parcel packing, medication support, transport, cleaning, care visits, or another service provider. When coordinators are making many calls in a day, nothing important should be missed, forgotten, mistranscribed, or lost between the conversation and the actual help being delivered.

The problem is not simply “AI that makes phone calls.” The real challenge is making outreach safe, respectful, and useful for people whose needs vary widely. Someone living with Alzheimer’s, dementia, stroke recovery, hearing impairment, or mobility limitations may need a different conversation style, different escalation rules, and sometimes no automated call at all.

Our health-support research reinforced that these needs are not only medical. People living with stroke recovery, Parkinson's, chronic pain, arthritis, cardiovascular disease, or physical disability may also face fatigue, communication difficulty, anxiety, social isolation, transport problems, home-access barriers, and family carer stress. Support staff are also under pressure: after many calls, they must capture every request accurately and turn it into real help.

Care Call AI was inspired by that gap. Our guiding line is: **Care seen. Needs heard. Help delivered.** The goal is to help coordinators safely identify who needs support, listen through approved CALL-E check-ins, and automatically turn each person's needs into practical care requests so no request for food, medicine, transport, cleaning, laundry, garden help, small repairs, or home support is overlooked.

## What it does

Care Call AI is an operations dashboard for charities and care teams using CALL-E.

Coordinators can review a daily list of care recipients, see who is eligible for automated outreach, identify who needs human handling, open and edit recipient care cards, run a no-call preflight, approve a safe CALL-E batch, and turn call outcomes into structured service requests and printable delivery orders.

Recipient cards can carry condition-aware communication context: for example, whether the conversation should be slower, use shorter questions, allow longer pauses, permit a trusted answerer, or escalate to an operator when the agent cannot be confident that the person's needs were understood.

The system is designed so critical, blocked, and operator-only recipients are not dialed automatically. Automated calls are only prepared for eligible recipients after safety checks and coordinator approval.

## How we built it

Care Call AI is built as a web application with a coordinator console, a protected backend service, a database, a call orchestration layer, and a guarded CALL-E integration.

The coordinator never sends CALL-E credentials or backend secrets from the browser. The frontend talks to a server-side API layer, and the backend builds the CALL-E task from the recipient care card: safety category, condition profile, communication rules, language/locale, trusted answerers, care needs taxonomy, escalation rules, and the structured result schema we expect back.

For the hackathon, CALL-E is the phone-agent runtime. It receives the approved task, handles the live conversation, and returns structured results, transcript evidence, and summary data. Care Call AI then turns those results into service requests and printable delivery orders.

The deployable architecture is straightforward: frontend application -> protected backend API -> cloud virtual private server or K8s runtime -> load balancer for horizontal scaling -> database -> call queue/orchestrator -> CALL-E. A Redis-compatible queue or similar worker system can keep a care round moving when a recipient is busy or unavailable, retrying that call later without stopping the rest of the round.

The web interface is designed for browser-based use by coordinators and should work across desktop, tablet, and mobile browser contexts. For teams that need deeper field workflows later, the same product concept could be extended into a native mobile application or a cross-platform app built with Flutter or React Native.

## Challenges we ran into

The hardest part was balancing automation with safety.

It was not enough to build a list of phone numbers and call them. The product needed to understand when automation is inappropriate, when a caregiver or trusted answerer may respond, when a coordinator should intervene, and how to keep live calls scarce and intentional.

We also had to design for the gap between conversation and action. A useful call must become a concrete care task: food, medicine, transport, cleaning, laundry, home help, service referral, or human follow-up.

Another challenge was turning a hackathon prototype into something close to a real product experience: authentication, protected backend access, deployment, TLS, real CALL-E integration, testing, and a dashboard that feels useful for an actual care coordinator.

## Accomplishments that we're proud of

We built a working end-to-end care outreach workflow rather than a generic calling demo.

Care Call AI includes a coordinator dashboard, recipient safety categories, editable care cards, trusted answerers, no-call preflight, protected backend APIs, real deployment, and a guarded CALL-E execution path. The product can prepare a care round, exclude unsafe recipients, and convert call outcomes into practical service requests.

We are especially proud that the experience keeps the coordinator in control while still showing how CALL-E can reduce repetitive phone work.

## What we learned

We learned that phone AI becomes much more valuable when it is embedded inside a real workflow. The call itself is only one part of the job. The surrounding system matters just as much: consent, safety category, condition-aware prompts, operator approval, summaries, service requests, and delivery coordination.

We also learned that responsible automation in care work is an operations design problem, not just a model problem. The system must make the safe path the normal path: clear recipient eligibility, one source of truth for safety state, explicit preflight approval, traceable card edits, structured outputs, service handoff, duplicate-call prevention, and human escalation when the conversation is uncertain or the situation is sensitive.

The research also made one product principle clear: the system should not ask “what is wrong with this person?” It should ask what matters to this person, what support they need today, who may safely speak for them, and what action must not be lost after the call.

## What's next for Care Call AI

Next steps include stronger role-based authorization, operator audit logs for every recipient card change, better condition-specific conversation policies, admin tools for managing operators and monitoring activity, and more real-world testing with charities and support organizations.

We also want to expand the product beyond scheduled delivery rounds. Future versions could support safe wellbeing check-ins for people facing serious illness, non-emergency emotional support and signposting under human-reviewed safeguards, family or caregiver update workflows, and recipient-triggered callback requests. A registered recipient could use a simple Siri Shortcut to request a return call, and Care Call AI would route that request into the same consent, eligibility, preflight, queue, and coordinator oversight used for scheduled CALL-E outreach.

On the technical side, the roadmap includes scalable queue workers for retries and busy numbers, CRM/help desk integrations, volunteer dispatch integrations, multilingual outreach in CALL-E-supported regions and languages, and better browser support for tablet and mobile coordinator workflows. Later versions may also include a native or cross-platform mobile app for field teams and supervisors.

We also plan to prepare a sanitized public hackathon edition of the repository so the community can reuse the core CALL-E workflow without exposing private deployment details, operational secrets, or production-specific infrastructure notes.
```

## Built with

```text
CALL-E
Next.js
React
TypeScript
Python
Docker
Kubernetes
Load Balancing
Queue Workers
Redis-compatible Queue
Database
GitHub Actions
CSS
HTML
REST API
Bearer Auth
Webhooks
Idempotency Keys
Result Schemas
Charity Tech
Care Coordination
AI Agents
Voice AI
```

## Submission form answers

### App status

```text
Built during the hackathon submission period.
```

If the form requires an update explanation:

```text
Care Call AI was built during the hackathon as a CALL-E-first care outreach
application. During the submission period we implemented the coordinator
dashboard, condition-aware recipient handling, no-call preflight, guarded
CALL-E execution path, service request/order generation, tests, Docker demo
setup, and sanitized public repository packaging.
```

### Testing instructions for application

1. Open the demo application URL.
2. Sign in with the demo coordinator credentials:
   - Operator ID: `carecall-coordinator`
   - Password: `carecall-demo-password`
3. Open **Care seen** (`/dashboard`) to review recipient readiness, safety
   categories, condition mix, and urgent callback pressure.
4. Open **Needs heard** (`/dashboard/operator`) to review the auto-call round.
5. Open **Round preflight** (`/dashboard/preflight`) to verify the no-call
   preview. Dry-run/preflight places zero real calls.
6. Open **Help delivered** (`/dashboard/orders/print`) to review service
   requests and printable order sheets.
7. Open **Urgent Callback** (`/dashboard/urgent-callback`) to see priority
   callback handling.

For local verification from the public repository:

```bash
npm ci --prefix frontend
make test
docker compose -f docker-compose.dev.yml up -d --build
make demo-smoke
make demo-auth-smoke
```

Live CALL-E calls are disabled by default. A real call requires CALL-E
authentication, consent/approved outreach basis, reviewed preflight, exact
operator approval, and the explicit live-demo environment acknowledgement.

### Functional demo app URL

```text
<add verified public demo URL, for example https://care.raixon.co.uk after external DNS/browser verification>
```

### Project submission pull request URL

```text
<add PR URL after opening the pull request to CALLE-AI/awesome-phone-call-agents>
```

### CALL-E account email

```text
<add email address associated with the CALL-E account>
```

### Primary use case

Recommended selection if the form provides a close option:

```text
Care coordination / service request intake / customer support operations
```

Fallback selection if the available choices are broader:

```text
Customer support / operations
```

### One-sentence real-world task

```text
Care Call AI helps charities and care teams use CALL-E to safely check in with vulnerable recipients and turn each conversation into practical food, medicine, transport, home-help, or support service requests.
```

## Try it out links

```text
Demo app:
<add verified public demo URL>

Frontend deployment:
<add verified frontend deployment URL>

Public demo repository:
<add sanitized public repository URL>

CALL-E contribution PR:
<add PR URL after opening the pull request>
```

## Video demo link

```text
<YouTube or Vimeo demo video URL>
```
