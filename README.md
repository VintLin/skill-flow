# Skill Manager

`skill-manager` is a terminal-first workflow control tower for AI agent skills.

It is designed for the real problem behind skills management:

- one source often contains several related skills
- those skills belong to one workflow
- after install, they get flattened into hidden target directories
- later updates, reconfiguration, and troubleshooting become harder than the initial install

The first release of `skill-manager` is intentionally narrow:

- add a Git source
- discover grouped skills from that source
- view them as one workflow group
- project selected skills into multiple agent targets
- update that workflow later without losing structure
- diagnose drift and broken projections clearly

This project does **not** execute skills. It manages, projects, updates, and diagnoses them.

## Product Direction

The approved v1 direction is:

**Workflow Control Tower MVP**

That means:

- workflow-first UX
- Git-only source support in v1
- grouped management over discovery breadth
- explicit state via `manifest.json + lock.json`
- no physical canonical skill store
- no discovery / ranking / search platform in the first release

The goal is not to build the biggest skills platform first.

The goal is to ship the smallest complete product that makes grouped skills finally make sense.

## v1 Scope

### In scope

- Git source add / update / remove
- grouped workflow view from source contents
- leaf skill discovery
- workflow-first terminal UI for configuration
- projection into supported agent directories
- grouped update and re-apply
- minimal `doctor`
- full automated coverage for critical happy-path and failure-path flows

### Not in scope

- discovery / `find`
- ranking / recommendation
- ClawHub in v1
- well-known discovery URLs
- physical canonical skill store
- GUI / desktop shell
- plugin SDK

## Core Mental Model

Internal domain model:

```text
Source -> SkillLeaf -> DeploymentTarget -> DeploymentState
```

User-facing model:

```text
Workflow Group -> Contained Skills -> Projects To
```

This distinction is intentional.
The system stays technically honest, but the UI presents the structure users actually think in.

## UX Shape

The primary flow is:

```text
add source
  ->
see grouped workflow
  ->
inspect contained skills
  ->
select targets
  ->
preview changes
  ->
apply projection
  ->
update later without losing context
```

Target wide-layout interaction:

```text
+------------------------+--------------------------+----------------------+
| WORKFLOW GROUPS        | GROUP DETAIL             | AGENT PROJECTION     |
|                        |                          |                      |
| frontend-workflow      | Purpose                  | Claude Code          |
| agent-ops              | Contained Skills         | Codex (.agents)      |
| pdf-toolchain          | Health / Warnings        | OpenCode             |
|                        | Update State             | OpenClaw             |
+------------------------+--------------------------+----------------------+
```

## Architecture

### Source of truth

`skill-manager` has two state files:

- `manifest.json`
  User intent
- `lock.json`
  Resolved source snapshot, leaf inventory, and deployment state

Target directories are projections only. They are never the truth.

### Filesystem layout

```text
~/.skillmanager/
├── source/
│   └── git/
│       └── <source-id>/
├── manifest.json
└── lock.json
```

There is no physical `skills/` store in v1.

### Channel model

Supported v1 targets:

- Claude Code
- Codex (`.agents/skills`)
- OpenCode
- OpenClaw

Default strategies:

- Claude Code: symlink
- Codex (`.agents/skills`): symlink
- OpenCode: symlink
- OpenClaw: copy

## Plans and Design Docs

Current source-of-truth docs:

- Design system:
  [`DESIGN.md`](/Users/Vint/仓库/03%20Project/skill-manager/DESIGN.md)
- Implementation plan:
  [`docs/plan/PLAN_v1.0.0.md`](/Users/Vint/仓库/03%20Project/skill-manager/docs/plan/PLAN_v1.0.0.md)
- Original broad PRD:
  [`PRD/PRD-1.0.0.md`](/Users/Vint/仓库/03%20Project/skill-manager/PRD/PRD-1.0.0.md)

The original PRD is useful for history and model exploration, but `PLAN_v1.0.0.md` is the implementation baseline for v1.

## Engineering Principles

This project is intentionally biased toward:

- explicit over clever
- narrow but complete scope
- strong edge-case handling
- workflow-first UX
- small number of core services
- heavy automated test coverage

v1 should be:

- narrow in scope
- complete in behavior
- strong in grouped workflow understanding
- boring in architecture where possible

## Planned Module Shape

```text
src/
├── commands/
├── domain/
├── services/
├── adapters/
├── state/
├── tui/
└── tests/
```

Core service boundaries:

- `SourceService`
- `InventoryService`
- `DeploymentPlanner`
- `DeploymentApplier`

## Testing

Required v1 test coverage includes:

- add happy path
- invalid source fetch
- zero valid leafs
- mixed valid/invalid leafs
- target conflict
- broken projection detection
- unavailable channel path
- update add/remove/invalidate leaf
- tree selection state machine
- doctor drift detection

This is not optional hardening. It is part of the first release.

## Current Status

Current repo status:

- design direction approved
- implementation plan written
- design system document written
- TypeScript CLI implemented
- workflow-first Ink TUI implemented for `config`
- Git source add / update / remove working
- skill discovery, projection, and `doctor` implemented
- automated regression suite covering happy path and key failure branches

## Next Step

The next concrete step is to polish and extend beyond MVP boundaries already captured in [`PLAN_v1.0.0.md`](/Users/Vint/仓库/03%20Project/skill-manager/docs/plan/PLAN_v1.0.0.md), such as broader source discovery or additional adapters. The v1 implementation baseline now exists in code.
- leaf scanner
- initial tests
