# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout

This is a single-context repo.

- `CONTEXT.md` - glossary only: canonical domain terms, avoided terms, and short examples.
- `docs/domain.md` - domain model, bounded contexts, aggregates, invariants, and state machines.
- `docs/decisions/` - ADRs. This repo uses `docs/decisions/` instead of `docs/adr/`.
- `docs/architecture.md` - system architecture and layer structure.
- `docs/data-model.md` - data model, constraints, idempotency keys, and RLS policies.
- `docs/security.md` - threat model, security controls, logging policy.
- `docs/flows/` - key business flows.
- `docs/conventions/` - implementation conventions.

## Read order

Before planning or implementing, read the docs relevant to the task in this order:

1. `CONTEXT.md`
2. Relevant ADRs in `docs/decisions/`
3. Relevant sections of `docs/domain.md`
4. Relevant feature, flow, security, data model, architecture, or convention docs under `docs/`

## Use the glossary's vocabulary

When output names a domain concept, use the term as defined in `CONTEXT.md`. Do not drift to synonyms the glossary explicitly avoids.

If the concept is missing from `CONTEXT.md`, do not invent a canonical term silently. Use `/grill-with-docs` when the terminology needs to be resolved.

## Flag ADR conflicts

If output contradicts an existing ADR in `docs/decisions/`, surface the conflict explicitly instead of silently overriding it.
