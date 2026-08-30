# Care Call AI Agent Skills

Runtime agent skills live here when they affect the CALL-E prompt, fallback
extraction, or routing behavior.

## Practical Support Intake

`practical_support.py` is the single source for:

- service options the agent may mention during intake;
- same-day repeat-call update options;
- grocery aliases used by conservative fallback extraction;
- service keywords used when CALL-E returns a summary without structured needs.

When adding a new supported service or common grocery item, update this catalog
first, then add focused tests around prompt wording and extraction behavior.
