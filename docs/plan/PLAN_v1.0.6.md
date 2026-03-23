# PLAN v1.0.6

## 1. Version Goal

`v1.0.6` focuses on strengthening `skill-flow add`. Under the existing group-first architecture, this version expands source compatibility and improves the import pipeline. The implementation should study `npx skills add` for reusable source parsing, discovery, and interaction patterns, then adapt the useful parts into `skill-flow` without changing its source-group-based state model.

The final result of this version is to make `skill-flow add` behave more reliably and more predictably when importing mainstream skills repositories, while continuing to manage imported content as groups inside `skill-flow`.

## 2. Non-Goals

This version does not change `skill-flow` into a skill-first installer.

This version does not add a parallel command system such as `skill-flow skills add`.

This version does not include `remove`, `check`, or `init` as new version goals.

This version does not change `manifest.json`, `lock.json`, source-group management, or multi-target projection as core architecture.

This version does not include publishing or distribution capabilities such as `.well-known/skills`.

## 3. Core Deliverables

### 3.1 Source Parsing Enhancements

Enhance `skill-flow add` so it can recognize and normalize more source forms that are commonly supported by `npx skills add`, while still mapping every imported source back into the current source ingestion model.

The implementation should keep local path, GitHub, and ClawHub support stable, then add or refine compatibility for additional repository locator forms that directly improve import success rate and user experience.

The target scope for this version is limited to repository-oriented source forms that fit the current group-first model:

| Input Form | Current `skill-flow` | `v1.0.6` Target |
| --- | --- | --- |
| Local path | Supported | Keep stable |
| `file://` local path | Supported indirectly in existing flows | Keep stable and verify explicitly |
| GitHub shorthand `owner/repo` | Supported | Keep stable |
| GitHub shorthand with repo subpath `owner/repo/path/to/skills` | Not explicitly supported as shorthand subpath input | Add compatibility if it can be normalized into repo locator + requested path without changing the group model |
| GitHub URL | Supported | Keep stable |
| GitHub tree URL | Supported | Keep stable and tighten path combination behavior |
| Git SSH URL | Supported | Keep stable |
| Generic `.git` remote URL | Supported | Keep stable |
| GitLab URL and GitLab tree URL | Not currently a declared capability | Evaluate and add when it maps cleanly into the existing git source model |
| `github:` / `gitlab:` prefixed shorthand | Not currently supported | Evaluate only if parsing cost is low and behavior remains explicit |
| Well-known hosted catalog URL | Not currently supported | Out of scope unless it can be imported as a stable group source without introducing a new provider model |

This version does not target skill-first source sugar such as `owner/repo@skill` as a first-class import contract. Similar convenience can be studied for future versions, but `v1.0.6` remains group-first.

### 3.2 Standard Discovery Improvements

Improve post-import skill discovery so common skills repositories can be resolved more accurately.

The discovery flow should prioritize standard repository layouts and common skill directory conventions before falling back to generic recursive search. The goal is to improve discovery accuracy for mainstream skills repositories without weakening compatibility with existing non-standard repositories already supported by `skill-flow`.

The target rule for this version is to introduce deterministic discovery precedence while preserving recursive fallback for compatibility:

1. Resolve the effective search root from imported checkout path plus normalized requested path.
2. If the effective search root contains a valid root `SKILL.md`, treat it as the highest-priority match.
3. When root-only resolution is not sufficient, scan standard buckets in explicit order:
   - effective search root
   - `skills/`
   - `skills/.curated/`
   - `skills/.experimental/`
   - `skills/.system/`
4. Evaluate lightweight manifest-declared skill directories only when they are local to the imported repository and can be resolved safely inside the checkout root.
5. If standard buckets do not produce usable matches, fall back to recursive repository scan to preserve compatibility with non-standard community repositories.
6. Keep duplicate resolution deterministic. When the same skill is discovered more than once, the winning candidate must follow the documented discovery order.
7. Hidden directories remain eligible only when they are part of an explicit standard bucket or an approved local manifest-derived path. Hidden-directory recursion must not become unconstrained.

### 3.3 Add Selection And Preselection Optimization

Keep the group-first model unchanged, but improve how `skill-flow add` decides and presents discovered skills, default selections, and subpath-scoped imports.

This version should absorb useful interaction patterns from `npx skills add` only where they make the group import flow clearer. The result should help users understand which group was imported, which skills were discovered, and which skills are preselected, without introducing a skill-first state model.

### 3.4 Import Feedback And Verification Completion

Improve import summaries, error messages, and verification coverage around `skill-flow add`.

The command should give clearer feedback for locator parsing failures, discovery misses, partial selections, and successful imports so users can understand the final import result without additional manual inspection.

## 4. Task Breakdown

### 4.1 Source Parsing Enhancements

#### Goal

Allow `skill-flow add` to accept a broader and more consistent set of repository source inputs while preserving the current group-based import model.

#### Key Changes

- Audit the currently supported locator types across local paths, GitHub shorthand, GitHub URLs, GitHub tree URLs, and ClawHub locators.
- Compare the current parser behavior with the repository-oriented source forms supported by `npx skills add`.
- Add or refine missing repository locator handling that is directly useful for group import.
- Normalize all accepted locator forms into the existing source ingestion pipeline instead of creating a separate compatibility state path.
- Tighten source normalization and user-facing errors so invalid locators fail with clear messages.
- Document the version compatibility matrix in the plan and release notes so each accepted form has an explicit expected behavior.

#### Verification

- Add unit tests for locator normalization and failure cases.
- Add integration coverage for representative source forms.
- Run real CLI smoke tests for supported local and remote import examples.

### 4.2 Standard Discovery Improvements

#### Goal

Increase discovery accuracy for common skills repositories after a source is imported.

#### Key Changes

- Define a discovery order that prioritizes standard skills repository layouts.
- Prioritize root skills and standard skills directories before recursive fallback scanning.
- Refine handling for common curated, system, or experimental directory structures when they contribute directly to discovery accuracy.
- Evaluate lightweight manifest-based discovery only when it directly improves real repository imports within this version scope.
- Keep a fallback path for non-standard repositories so existing compatibility is not regressed.
- Define deterministic duplicate precedence so discovery order and duplicate resolution stay coupled and testable.

#### Verification

- Add fixture-based tests for different repository layouts.
- Add regression tests for existing supported repository patterns.
- Run real repository smoke tests covering at least one standard layout and one non-standard layout.
- Add explicit coverage for root-skill precedence, standard-bucket precedence, hidden standard buckets, duplicate winner selection, and recursive fallback.

### 4.3 Add Selection And Preselection Optimization

#### Goal

Make `skill-flow add` selection behavior more predictable while keeping source groups as the only managed unit.

#### Key Changes

- Review the current `--path` behavior and define its interaction with imported repository subpaths and tree URLs.
- Refine how discovered skills are preselected when a source contains multiple skills.
- Absorb compatible ideas from `npx skills add` only when they improve clarity for group import, not when they imply skill-first installation semantics.
- Improve add result summaries so users can clearly understand the imported group, discovered skills, and current selections.
- Keep the selection contract explicit: imported source remains a full group source, while requested path only constrains default selection and summary output.

#### Verification

- Add unit and integration tests for `--path` and related preselection behavior.
- Add regression coverage for existing add flows.
- Run CLI flow tests that validate final summaries and selection results.
- Add regression coverage for tree URL plus `--path` combinations and path normalization edge cases.

### 4.4 Import Feedback And Verification Completion

#### Goal

Ensure the improved `add` pipeline is understandable to users and reliably covered by automated and real-environment verification.

#### Key Changes

- Improve command feedback for source parsing failures, discovery misses, and successful imports.
- Expand automated test coverage around the updated import flow.
- Add or refresh release-facing documentation that explains the new source compatibility and add behavior.
- Prepare release verification records for the final `v1.0.6` change set.
- Add a shared regression matrix so source and discovery changes are verified against every affected workflow instead of only `add`.

#### Verification

- Run module-level tests related to source parsing, discovery, and add behavior.
- Run broader integration tests for the import pipeline.
- Execute real CLI workflow tests in a realistic environment according to the changed modules.
- Run regression verification for `find`, `update`, and config bootstrap where they consume the same source or discovery behavior.

## 5. Shared Regression Matrix

This version changes shared source and discovery behavior. Verification must cover every workflow that reuses those layers.

| Change Area | Affected Modules | Affected Workflows | Required Regression Coverage |
| --- | --- | --- | --- |
| Locator normalization | CLI source parsing, source resolution | `add` | Valid inputs, invalid inputs, normalization output, failure messaging |
| Requested path normalization | Source resolution, binding selection | `add`, `find` generated next command | Tree URL + `--path`, shorthand path input if added, out-of-scope path rejection |
| Discovery precedence | Inventory scan, source snapshot build | `add`, `update` | Root skill precedence, standard directory precedence, fallback recursion, duplicate winner |
| Duplicate handling | Inventory scan, snapshot warnings | `add`, `update` | Stable duplicate warning output and deterministic retained skill |
| Group preselection | Binding generation after add | `add` | Group remains fully imported, selected leaf set remains scoped and predictable |
| Shared discovery reuse | Built-in search inventory, workspace bootstrap adoption | `find`, config bootstrap | Existing search suggestions remain valid, bootstrap import behavior does not diverge from explicit add behavior |

## 6. Completion Criteria

`skill-flow add` can stably recognize and import each source form explicitly listed in this plan as a `v1.0.6` target.

Discovery behavior is documented as deterministic rules covering root precedence, standard buckets, fallback recursion, and duplicate winner selection.

The add flow presents clearer and more predictable selection and preselection behavior while remaining group-first.

All changes in this version are covered by unit tests, baseline integration tests, and real CLI workflow verification aligned with the modified modules and the shared regression matrix.

## 7. Risks And Boundaries

Adding more locator forms may increase parsing ambiguity, so normalization rules must remain explicit and deterministic.

Adjusting discovery priority may change which skills are found first in some repositories, so regression coverage is required for existing supported layouts.

Selection-related improvements must stop at clarifying group import behavior and must not drift into a new skill-first installation model.

Manifest-derived discovery must stay constrained to safe local paths inside the imported checkout. This version must not introduce remote manifest execution or unconstrained hidden-directory scanning.
