# Skill Flow

Shared vocabulary for the skill-flow monorepo (CLI, runtime, and macOS desktop shell).

## Language

### Desktop workspace memory

**Desktop Workspace Memory**:
UI organization state that should feel continuous for one human using Skill Flow on one Mac, even when switching between differently packaged desktop apps (for example production vs dev builds with different Bundle IDs). Today this includes Agent Display Visibility and Group Tags. It is not deployment truth and need not be readable by CLI or TUI in the current scope.
_Avoid_: settings (too broad), preferences (overloaded with `preferences.json`), local cache

**Cross-Bundle Consistency**:
The product goal for this change: production, universal, and architecture-specific (including `*.dev.*`) desktop packages all read and write the same Desktop Workspace Memory. CLI/TUI parity is out of scope unless later promoted.
_Avoid_: multi-client sync, cloud sync, cross-machine sync

**Shared Desktop Suite**:
A fixed macOS `UserDefaults` suite (not `UserDefaults.standard` / not Bundle-ID-scoped) that holds Desktop Workspace Memory so every desktop package on the same Mac shares one store. Chosen over elevating this data into Shared Skill State for the current scope.
_Avoid_: App Group container (unless later required), preferences.json for these fields, per-bundle standard defaults

**Shared Skill State**:
Authoritative skill-flow state under `~/.skillflow` (manifest, lock, preferences, sources). Shared across CLI, TUI, and desktop bridge. Distinct from Desktop Workspace Memory unless a later decision elevates specific fields into it.
_Avoid_: UserDefaults, desktop-only store

### Agent presentation (desktop)

**Agent Display Visibility**:
Per-agent on/off flags that control whether a deployment target appears in desktop agent pickers and related UI filters. Currently stored in UserDefaults and not part of Shared Skill State.
_Avoid_: enabled targets (that means deployment enablement for a skill group)

**Agent Display Order**:
Ordered list of agent IDs for presentation. Already persisted in Shared Skill State (`preferences.json` → `agentDisplayOrder`) and partially synced from the desktop. After this change, the desktop still keeps order inside suite-scoped `agentDisplayPreferences`, and on desktop edits continues to push order into `agentDisplayOrder` via bridge. Desktop does not re-import order from preferences on launch.
_Avoid_: visibility, enabled targets

### Group tags (desktop)

**Group Tag**:
A desktop-only label attached to a skill group/card for organization and filtering. Currently stored in UserDefaults, not Shared Skill State.
_Avoid_: skill metadata tag, import recommendation tag

### What lives where (this change)

**Suite-scoped keys (Desktop Workspace Memory only)**:
- `desktop.agentDisplayPreferences` (visibility + local order for agents)
- `desktop.groupTags.v2.tagsByGroupKey` (and any legacy group-tag keys needed for migration)

**Bundle-scoped keys (unchanged, still `UserDefaults.standard`)**:
Theme, language, card density, auto-launch, project scope, experimental helper, and other pure chrome not listed above.

**One-shot Suite Migration**:
On first launch when the Shared Desktop Suite has no Workspace Memory yet, copy once from the best legacy per-bundle domain, then treat the suite as sole source of truth for those keys. Prefer non-`.dev.` domains with substantial data (hidden agents and/or group tags) over empty defaults. Do not merge multiple domains field-by-field. After migration, leave legacy per-bundle keys in place (orphaned, unread) for safety and debugging; do not delete them.
_Avoid_: continuous multi-domain merge, manual-only import as the default path, destructive cleanup of legacy keys

**Last-Write-Wins Suite Sharing**:
When multiple desktop packages (production and dev) are open on the same Mac, concurrent writes to the Shared Desktop Suite use UserDefaults last-write-wins semantics. No cross-process locking or merge for this scope.
_Avoid_: transactional multi-app merge, file locks for tags/visibility
