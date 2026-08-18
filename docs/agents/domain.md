# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This is a **docs-only design repo** (no `src/`): the deliverable is the design-document set for a Cordis-based micro-frontend framework.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the single authoritative glossary (~26 terms with _Avoid_ lists). Use its vocabulary; don't drift to synonyms the glossary forbids.
- **`cordis-alignment.md`** at the repo root — the **unified baseline** (Cordis real API semantics, service table, event contract, security baseline, cross-doc consistency rules). **When any module doc conflicts with the baseline, the baseline wins.**
- **`docs/adr/`** — read ADRs that touch the area you're about to work in. The baseline's §六 is a per-document ADR decision map.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo:

```
/
├── CONTEXT.md            ← glossary (terms + avoid-lists)
├── cordis-alignment.md   ← baseline (highest authority on conflicts)
├── docs/
│   ├── adr/              ← ADR-0001 ~ ADR-0060
│   └── agents/           ← this config
├── README.md             ← overview + 六条全局设计主线 (§〇)
└── <module>.md × 12      ├── lifecycle-management.md, state-sharing.md, communication-protocol.md,
                           ├── route-adaptation.md, js-sandbox.md, security.md,
                           ├── heterogeneous-loading.md, monitoring.md, devtools.md,
                           ├── style-isolation.md, module-interaction.md …
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids (e.g. 槽位 outlet ≠ 容器 container; 保活 ≠ deactivated).

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (service replacement means remount) — but worth reopening because…_

New decisions must be recorded as a new ADR under `docs/adr/` (next free number) and, when they affect cross-document semantics, synchronized into the baseline before landing in module docs.
