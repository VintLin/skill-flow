# Read-only project health checks

Project Doctor assesses one project's managed Skill deployments and external Skills in known Agent skill directories. The desktop runtime retains the shared bridge semantics for internal synchronization, while the CLI is the explicit user-facing project entry. The desktop does not expose a Doctor toolbar control or report sheet. CLI accepts an explicit project path, including an unregistered directory, without registering it. Both use the same diagnostic semantics. Omitting a CLI project path retains existing global Doctor behavior.

Project checks are read-only: they do not reconcile shared state, prune projects or sources, create target directories, remove links, or repair deployments. This deliberately differs from the existing global Doctor, which performs maintenance. Reusing that mutation pipeline would make inspecting a project change unrelated state. The first version provides diagnostics and problem locations; repair operations and changes to global Doctor are outside this decision.

## Deployment baseline

Expected selections and enabled Agents come from the last successful application for each Skill group in the project. Unapplied desktop edits and fallback global selections do not establish a Project Deployment Baseline. Existing persisted project application settings can supply selections and enabled Agents; a missing record must not fall back to global settings. Without a baseline, inspect disk contents and explicitly report that deployment completeness could not be established, without inventing missing deployments.

## Inspection and coverage

- Inspect all known project-local Agent skill directories, including those hidden in desktop presentation or not enabled for deployment. Inspect shared directories once while preserving the associated Agent identities.
- An absent directory for an Agent with no expected deployments is not a fault. An unreadable directory makes coverage incomplete. An unavailable project path is blocking and must not remove the project from saved state.
- For managed deployments, detect missing paths, broken or incorrectly targeted symlinks, unexpected entry types, invalid Skills, and foreign content occupying an expected deployment path. Inspect anomalous entries directly rather than deriving diagnostics only from successfully matched deployments.
- For external Skills, inspect link integrity, readability, the presence of `SKILL.md`, and validity under existing Skill parsing rules. Do not execute Skill scripts. Valid external Skills contribute informational counts and are not faults merely because Skill Flow does not manage them.

## Copy and symlink behavior

Compare a copied Skill with its current source content. A mismatch is a warning, described neutrally as a difference from the current source: existing project records do not preserve a deployment-time content snapshot sufficient to distinguish a local edit from a source update. Users may explicitly switch to symlink deployment where the Agent supports it so subsequent changes at the linked source are reflected in the project. Doctor never performs that switch. Symlinks still require checks for missing or incorrect destinations; they do not guarantee that the source itself is up to date with a remote repository.

## Report status

Reuse `HEALTHY`, `PARTIAL`, and `BLOCKED`, with blocking findings taking precedence. Missing baselines, incomplete inspection, and copy differences produce `PARTIAL`. Broken links, missing expected deployments, path conflicts, and an unavailable project path produce `BLOCKED`. Only complete checks without abnormalities produce `HEALTHY`. Reports retain disk findings even when a baseline is unavailable.

## Verification obligations

Verify desktop and CLI scope propagation and equivalent findings; unchanged global behavior; no global fallback for an unapplied project; missing, broken, misdirected, and conflicting deployments; copy mismatch warnings; valid and invalid external Skills; shared-directory deduplication; hidden Agents; absent and unreadable roots; unregistered CLI paths; and status precedence. Check that project diagnosis leaves shared state and project contents unchanged, including on failure.
