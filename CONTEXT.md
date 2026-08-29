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

### AI assistance

**Model Provider**:
An external or local model service selected to perform Skill-derived AI work such as tag suggestions and document translation. It is distinct from providers that locate or describe import sources.
_Avoid_: AI provider (ambiguous), import provider, source provider

### Skill usage analytics

**Skill Usage Observation**:
A local, explainable record that an Agent explicitly activated, selected, invoked by name, or invoked through a named tool a Skill. It carries the Agent, evidence source, confidence, and optional observed terminal state; it does not imply business success.
_Avoid_: install count, deployment status, inferred file read, skill success

**Lifecycle Event**:
A local record of a Skill management operation such as install, update, sync, deployment, or removal. It is distinct from a Skill Usage Observation and is never included in usage counts.
_Avoid_: usage, activation, invocation

**Automatic Local Collection**:
Skill Flow automatically reads known local session or event roots for detected Agent targets and derives minimal Skill Usage Observations without a user confirmation, directory picker, remote connection, or write-back to the Agent. Missing sources, read failures, and parser drift lower coverage rather than triggering a collection gate.
_Avoid_: opt-in connector, manual import, consent flow, remote telemetry

**Usage Retention**:
The automatic lifecycle for Skill Usage Observations: raw observations remain for 90 days within fixed record and disk caps, while daily aggregates remain for 365 days. It is isolated from management audit history and never deletes Agent session data.
_Avoid_: audit rotation, source cleanup, Agent session cleanup

**Skill Run**:
A user-facing count of Skill Usage Observations in the selected Usage Snapshot range. Each observation counts once; this metric is never de-duplicated.
_Avoid_: distinct Skill count, install count

**Usage Snapshot**:
The bridge-facing, dashboard-ready aggregation produced from one filtered set of local Skill Usage Observations. It owns KPIs, time buckets, rankings, the Skill-Agent Matrix, hourly activity, coverage diagnostics, and bounded recent records.
_Avoid_: raw Agent transcript, lifecycle audit

**Usage Time Bucket**:
A local-time hour or calendar-day interval used by the Usage chart. Each bucket carries raw per-series counts; series are rendered separately rather than stacked.
_Avoid_: UTC-only bucket, stacked total

**Skill-Agent Matrix**:
The Usage Snapshot relation that counts Skill Runs by normalized Skill identity and Agent. It is the source for click-through views that split one Skill by Agent or one Agent by Skill.
_Avoid_: Agent Coverage, generic tool-call matrix

**Top Agent**:
An Agent ranked by Skill Run count in the selected Usage Snapshot range. It is a usage analytic and must not be inferred from Agent Coverage status.
_Avoid_: coverage rank, supported-agent list

**Hourly Activity**:
The local-time weekday × hour aggregation used by the Usage page's 分时活跃 heatmap. It is calculated from the same filtered observations as the other Usage Snapshot metrics.
_Avoid_: process uptime, session duration

**Agent Coverage**:
Collection-health metadata describing whether an Agent source was found, scanned, readable, and parsed. Coverage does not contribute to Top Agent counts and an unsupported source is not a zero-use result.
_Avoid_: Top Agent, usage total

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

### Import workflow

**Import Discovery**:
The read-only process that recommends, searches, scans, and previews potential Skill sources before preparation or final Import. It may use rebuildable caches and external providers, but it never changes Shared Skill State or target projections.
_Avoid_: import preparation, final import, source update

### Group operation queue (desktop)

**Group Operation Queue**:
A desktop session FIFO that holds Group Operations so the user can keep requesting updates and imports without waiting for the current one to finish. Durable commits run one at a time in click order; eligible read/download preparation may start earlier in a bounded preparation pool.
_Avoid_: parallel commit workers, batch update coalescer, multi-flight mutation

**Group Operation**:
One discrete user-requested unit of work on a skill group—today either **Update** (an already-installed group) or **Import** (a not-yet-installed group from the import page). Distinct from card chrome actions such as pin, rename, or tag edit.
_Avoid_: mutation (bridge-layer term), job (too generic), download (import-only wording)

**Queued / Running**:
Lifecycle of a Group Operation while it is in the Group Operation Queue: **Queued** means accepted and waiting; **Running** means it is the single operation currently executing against the bridge.
_Avoid_: busy (card-level overlay only), pending (ambiguous with install state)

**Operation Identity**:
The dedupe key for a Group Operation: the target skill group plus the operation kind (Update or Import). A second request with the same Operation Identity while Queued or Running does not create another queue slot.
_Avoid_: request id, click count

**Serial Mutation Channel**:
The desktop rule that bridge-bound write operations (Group Operations and other mutations such as pin, apply, delete, rename) execute one at a time without concurrent-rejection errors: later requests wait their turn instead of failing immediately.
_Avoid_: concurrent mutation reject, parallel bridge writes

**Bounded Preparation Pool**:
A maximum of three isolated, disposable preparation tasks may overlap ahead of the Serial Mutation Channel. Import checkout downloads and bulk-update remote revision checks qualify; authority-state writes, managed-checkout replacement, recovery-journal changes, and target reconciliation do not.
_Avoid_: parallel mutation pool, unbounded prefetch, preparation that changes shared authority state

**Card Operation Feedback**:
On a skill group card, **Running** uses the existing busy overlay with `Updating` or `Downloading`; **Queued** uses the same overlay structure with a distinct queued label so waiting work is visible without a separate queue panel.
_Avoid_: global task drawer (out of first-version scope), identical copy for queued and running

**Operation Notification**:
Toast policy for the Group Operation Queue: no toast on first enqueue; a light toast when a duplicate Operation Identity is requested; per-operation success/failure toasts when each finishes; no end-of-queue summary toast in the first version.
_Avoid_: toast-on-every-enqueue, summary-only notifications

**Session-Scoped Queue**:
The Group Operation Queue exists only for the current desktop app session. It is not written to Shared Skill State or Desktop Workspace Memory; quitting discards Queued work and does not auto-resume later.
_Avoid_: durable download manager, restart resume

**Quit Shutdown**:
The desktop queue transition triggered by Command-Q or the application Quit menu while a Group Operation is Running. It rejects new operations, discards Queued work, and preserves the Running identity until cancellation and recovery finish. If the user cancels Quit after a recovery failure, protected operations stay disabled; a later successful recovery may reopen only a fresh empty session queue. Closing the main window does not trigger Quit Shutdown.
_Avoid_: pause, resumable queue, general cancel action

**Operation Recovery Journal**:
Internal durable recovery evidence for the single incomplete managed Update or final Import. It records the pre-operation authority state plus explicit source, checkout, preparation, and target ownership metadata. Recovery validates the whole record against current managed roots before touching a recorded path; it never records work to resume and is not Shared Skill State.
_Avoid_: persisted queue, download history, migration marker

**Protected Group Operation Transaction**:
The all-or-recover commit scope for one managed Update or final Import, covering its managed checkout, Shared Skill State, and Skill Flow-owned target projections. Bulk Update contains one transaction per group; completed group transactions remain committed.
_Avoid_: batch transaction, resumable operation, preparation transaction

**Recovery Required**:
Desktop state after recovery failed and the user cancelled application termination. The main UI and import discovery (search, local scan, preview) remain available, but preparation, final Import, and Update stay disabled; another Quit or Retry Recovery must attempt recovery again before termination can complete.
_Avoid_: recovered, idle, ignore-and-quit

**Bulk Update**:
A single Group Operation that updates many installed groups in one bridge call (Home “Update All”). While it is Queued or Running, every covered group shows Card Operation Feedback; matching single-group Update entries already in the queue are absorbed so they are not run twice. Remote Git revision checks use the Bounded Preparation Pool, then required updates commit serially in the original selection order.
_Avoid_: fan-out to N single updates, bypassing the queue

**Desktop-Only Operation Queue**:
The Group Operation Queue and Card Operation Feedback are macOS desktop product behavior. CLI and TUI keep their existing command-level flows unless later promoted.
_Avoid_: cross-surface queue protocol in the first version

**Stale Operation Skip**:
When a Queued Group Operation becomes invalid before it runs (group already removed for Update, or already installed for Import), the queue drops that operation with a light skip toast and continues. This is not treated as a hard failure.
_Avoid_: hard-fail on missing target, silent drop with no feedback

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
