# Skill Flow Full Cross-Platform Design

## Purpose

This document defines the next-stage product and architecture boundary after the current `cross-platform-desktop` first step.

The first step has already stabilized the path-policy layer.

The next goal is larger:

- make `skill-flow` itself usable across macOS, Windows, and Linux
- preserve the current shared TypeScript runtime as the product core
- preserve `skill-flow bridge --json` as the desktop/runtime boundary
- replace the current macOS-only desktop shell with one cross-platform desktop application
- keep CLI and desktop aligned on the same state root and the same runtime behavior

This document is the source of truth for that full migration scope.

## Product Goal

`skill-flow` should become one cross-platform product with two entry surfaces:

1. a cross-platform CLI
2. a cross-platform desktop app

Both surfaces must operate on the same `~/.skillflow` state root and the same runtime behavior.

The desktop app must fully reproduce the current logic and UI scope of `apps/desktop-mac`, while allowing small platform-level shell differences where necessary.

## Reference Baseline

This design uses the following local projects as implementation-backed references:

- `/Users/Vint/Repos/04_Reference/03_Tools/cc-switch`
- `/Users/Vint/Repos/04_Reference/03_Tools/clash-verge-rev`

They are used for these concrete reasons:

- `cc-switch`
  - confirms Tauri desktop shell direction
  - confirms shared config plus Windows-only Tauri override split
  - confirms single local state root plus projection model
  - confirms explicit per-tool config/path logic
  - confirms Windows test-home override pattern
  - confirms desktop release artifacts and Linux packaging concerns are first-class work

- `clash-verge-rev`
  - confirms a larger production-grade Tauri 2 desktop structure
  - confirms updater, bundle, plugin, and sidecar-style packaging concerns must be designed early
  - confirms Linux prerequisites such as `webkit2gtk` must be documented and tested as part of delivery
  - confirms Windows, macOS, and Linux packaging are not a late-stage afterthought

These references inform the migration plan, but do not redefine `skill-flow` as a different product.

## Accepted Direction

The accepted direction is:

- keep `packages/*` as the shared business core
- keep `apps/cli` as the runtime entry and bridge host
- add a new cross-platform desktop shell based on Tauri
- treat `apps/desktop-mac` as the migration reference, not the long-term shell

This means the first production-ready cross-platform shape becomes:

```text
packages/* shared runtime and state logic
  ->
apps/cli
  ->
skill-flow bridge --json
  ->
apps/desktop (Tauri shell + web UI)
```

The desktop app does not get its own database or a second business state model.

`manifest.json`, `lock.json`, runtime projections, and desktop-visible state continue to derive from the same canonical `~/.skillflow` root.

## Non-Goals

The following are explicitly out of scope for this migration:

- changing the `skills` target model to a different abstraction
- adding new end-user product features unrelated to migration
- replacing `bridge --json` with a new native RPC boundary in this phase
- redesigning the product beyond what is needed to reproduce `apps/desktop-mac`
- rewriting global target paths to speculative platform-native conventions not already accepted
- creating separate platform-specific business logic branches

## First-Version Success Criteria

The first full cross-platform version is complete only when all of the following are true:

- the CLI runs on macOS, Windows, and Linux
- the CLI test/build/release flow works on macOS, Windows, and Linux
- the new desktop app runs on macOS, Windows, and Linux
- the new desktop app reproduces the current `apps/desktop-mac` feature scope:
  - home
  - import
  - detail
  - settings
  - menu bar / tray quick access behavior
  - localization
  - serialized mutation handling
- the desktop app and CLI share the same runtime state and bridge contract
- the desktop app can complete the main skill-management flow on all three desktop platforms
- packaging and release artifacts exist for CLI and desktop across all three platforms

Platform shell differences are allowed when necessary, including:

- native title bar differences
- menu/tray wiring differences
- Linux runtime dependency handling
- minor window behavior differences

But business behavior, data flow, and user-visible workflow must remain aligned.

## Architecture

### 1. Shared Runtime Layer

`packages/domain`, `packages/integration`, `packages/storage`, `packages/core-engine`, `packages/query`, and `packages/shared-types` remain the main shared runtime layer.

This layer owns:

- state schema
- manifest and lock behavior
- target path policy
- projection behavior
- import/apply/update/remove behavior
- query models
- runtime validation
- platform-aware helper resolution where it belongs in shared code

This layer must not depend on a specific desktop shell.

### 2. CLI and Bridge Layer

`apps/cli` remains the executable runtime boundary.

It owns:

- direct CLI user flows
- `bridge --json`
- desktop-facing command execution contract
- cross-platform process bootstrapping for desktop helper usage
- release-time CLI distribution artifacts

The bridge contract must be treated as a versioned internal protocol.

Desktop work should consume that protocol, not bypass it with parallel runtime logic.

### 3. Desktop Shell Layer

A new `apps/desktop` Tauri application becomes the long-term desktop shell.

It owns only shell concerns:

- window lifecycle
- menu bar / tray integration
- desktop routing shell
- bridge invocation
- local desktop preferences that are truly shell-local
- release packaging and updater wiring
- platform integration differences

It must not become a second source of truth for core skill data.

### 4. Migration Reference Layer

`apps/desktop-mac` remains temporarily as the behavior and UI reference.

It should be used to extract:

- route structure
- state transitions
- view-model semantics
- loading and error behavior
- current settings surface
- interaction ordering
- current localization keys and user wording

It should not continue to grow as a long-term production shell once the cross-platform desktop replacement starts landing.

## Module Breakdown

The work should be broken into the following modules.

### Module A. Runtime Cross-Platform Hardening

Goal:

- remove remaining macOS-only assumptions from shared runtime and CLI paths

Includes:

- filesystem behavior
- archive extraction behavior
- process spawning behavior
- deterministic home/test-home behavior
- platform-aware helper selection
- bridge output normalization

Deliverable:

- shared runtime and CLI pass deterministic cross-platform tests before desktop migration expands

### Module B. Desktop Contract Freeze

Goal:

- freeze what the new desktop must reproduce from `apps/desktop-mac`

Includes:

- route inventory
- screen inventory
- state objects
- bridge calls per screen
- menu/tray behaviors
- error/loading/empty-state behavior
- mutation serialization semantics
- localization surface

Deliverable:

- a written desktop contract that can be used as a migration checklist

### Module C. New Cross-Platform Desktop Shell

Goal:

- create `apps/desktop` as the replacement shell

Includes:

- Tauri 2 app scaffold
- shared and Windows-specific config split where needed
- dev/build/package commands
- shell-to-bridge invocation path
- app lifecycle wiring
- shell-local settings and diagnostics surfaces only where necessary

Deliverable:

- the new shell can boot, connect to the CLI helper, and render a minimal application frame on all supported platforms

### Module D. UI and Interaction Port

Goal:

- port current macOS desktop workflows into the new shell

Includes:

- home screen
- import screen
- detail screen
- settings screen
- menu/tray quick actions
- interaction polish needed to preserve current workflow quality
- localization migration

Deliverable:

- the new desktop can complete the same user workflows as `apps/desktop-mac`

### Module E. Packaging and Release

Goal:

- turn the new CLI and desktop into reproducible three-platform deliverables

Includes:

- release scripts
- artifact naming
- checksums
- platform-specific build prerequisites
- CI matrix
- updater configuration
- installer/package selection per platform

Deliverable:

- three-platform release artifacts can be produced by the repository without relying on undocumented local knowledge

### Module F. Cutover and Cleanup

Goal:

- make the new shell the default desktop product and remove the old split

Includes:

- docs update
- release entrypoint change
- deprecation and eventual removal of `apps/desktop-mac`
- release validation after cutover

Deliverable:

- desktop development, packaging, and release use the new cross-platform shell as the only supported path

## Migration Order

The migration must proceed in this order:

1. Runtime cross-platform hardening
2. Desktop contract freeze
3. New desktop shell foundation
4. UI and interaction port
5. Packaging and release
6. Cutover and cleanup

This order is required.

If the shell is built before the runtime and contract are stable, the project will duplicate behavior and create rework across macOS, Windows, and Linux at the same time.

## First-Version Scope

The first full version includes:

- cross-platform CLI
- cross-platform desktop shell
- parity with the current `apps/desktop-mac` logic and UI scope
- shared state root
- shared bridge/runtime behavior
- three-platform build/test/package pipelines

The first full version does not include:

- new product-scope expansion
- replacing the bridge protocol
- introducing a second desktop-only data model
- deep platform-specific UI redesigns
- platform-exclusive features that do not exist in current desktop scope

## Testing Strategy

The migration requires four validation layers.

### 1. Shared Runtime Tests

Validate:

- path policy
- config read/write
- projection rules
- import/update/remove flows
- archive/process behavior by platform
- bridge JSON contract
- fallback behavior for Windows and Linux

These tests should live primarily in shared packages and CLI tests.

### 2. Desktop Contract Tests

Validate:

- route behavior
- view-state behavior
- loading, empty, and error states
- settings semantics
- mutation serialization
- screen-level interaction equivalence with `apps/desktop-mac`

These tests prove semantic parity, not just render success.

### 3. Desktop Integration Tests

Validate:

- desktop-to-bridge invocation
- refresh behavior after mutation
- helper override and helper discovery
- platform-specific shell error presentation

### 4. Platform Smoke Tests

Validate at least one real user path on each of macOS, Windows, and Linux:

- launch app
- load state
- import a skill
- inspect detail
- apply projection
- change settings
- restart and confirm state continuity

## Release and Packaging Strategy

The repository must own the release path for both surfaces.

### CLI

Must define:

- per-platform build commands
- artifact naming
- archive format
- checksum generation
- release upload flow

### Desktop

Must define:

- Tauri config layout
- platform package targets
- updater configuration
- Linux prerequisite documentation
- CI build matrix
- artifact validation scripts

Packaging must be part of the implementation plan, not a final cleanup task.

## Major Risks and Controls

### Risk 1. Desktop parity drifts during migration

Control:

- freeze the desktop contract before the port
- use parity-oriented tests and checklists

### Risk 2. Windows and Linux filesystem behavior diverges from macOS assumptions

Control:

- centralize all path, link, home, and fallback behavior
- keep deterministic platform tests in shared runtime and desktop integration layers

### Risk 3. Tauri platform differences leak into business logic

Control:

- keep platform-specific code inside the shell layer
- keep business logic in shared packages and CLI bridge

### Risk 4. Linux desktop support fails late because prerequisites were deferred

Control:

- document WebKitGTK and related Linux dependencies at the start
- include Linux smoke validation during early shell work

### Risk 5. Release flow remains local-knowledge driven

Control:

- build scripts, artifact conventions, and validation checks into the repository during implementation

## Required Follow-Up Documents

This design should immediately lead to:

1. a desktop contract document derived from `apps/desktop-mac`
2. a full implementation plan for the complete migration
3. per-phase execution plans where the work is too large for one pass

## Current Repository Implication

The existing `docs/plan/cross-platform-desktop` directory remains the first-step baseline.

Use the documents in this order:

1. `TARGET_PATHS.md`
2. `DESKTOP_IMPLEMENTATION.md`
3. `FULL_CROSS_PLATFORM_DESIGN.md`

Interpretation:

- `TARGET_PATHS.md` explains the already-started runtime alignment
- `DESKTOP_IMPLEMENTATION.md` explains the current narrow desktop-first conclusions
- `FULL_CROSS_PLATFORM_DESIGN.md` expands that first step into the full product migration target

## Final Decision Summary

The accepted plan is not:

- keep investing in `apps/desktop-mac` as the long-term shell
- build desktop first and fix runtime later
- redesign the product during migration

The accepted plan is:

- harden the shared runtime and CLI for macOS, Windows, and Linux
- freeze the existing desktop behavior as a contract
- build a new Tauri-based cross-platform desktop shell
- port the current macOS desktop UX into that shell
- ship CLI and desktop as one aligned cross-platform product
