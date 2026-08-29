# RELEASE v1.6.2

## Summary

- `v1.6.2` is a desktop performance and architecture cleanup release.
- Startup, Home scrolling, Skill Group toggles, Update, Import/Download, Detail, Usage, and Settings now perform less repeated work while retaining protected mutation and recovery behavior.

## Highlights

### 1. Faster launch and Home interactions

- Loads cached workspace scope for the first screen and defers Usage collection until the workspace is ready.
- Reuses one Home card projection, precomputes sort keys, suspends idle geometry tracking, and caches card metadata and action icons.
- Shares Detail enrichment requests without coupling background Detail warmup to Home refreshes.

### 2. Bounded Update and Import concurrency

- Checks remote Git revisions with up to three concurrent reads before serially committing required updates.
- Prepares up to three queued imports concurrently while preserving FIFO commit order and a single recovery-journal boundary.
- Prefetches only visible import cards with a bounded global request limit.
- Skips global deployment reconciliation when a managed update is confirmed unchanged.

### 3. Leaner page rendering

- Bounds Detail revision work and prunes tree traversal once the requested node is found.
- Indexes Usage heatmap activity instead of repeatedly scanning all observations.
- Keeps Settings handle hover state local to each control and removes a duplicate Usage load trigger.
- Finishes Skill and target toggles as soon as Apply returns.

### 4. Finalized architecture boundaries

- Removes superseded import fallbacks, runtime mutation helpers, cache envelopes, persisted rebuildable state, and dead desktop parsing paths.
- Centralizes import discovery requests, source selection, caching, and desktop document/detail policies under their final owners.

## User-visible changes

- Home cards should scroll and react more smoothly, especially with larger Skill collections.
- Launch, group toggles, bulk Update, and Import/Download should spend less time waiting on repeated or serial preparation work.
- Detail and Usage pages should remain responsive while background data is loaded or refreshed.
- Existing protected update/import recovery and commit ordering remain unchanged.

## Release Artifacts

- `Skill-Flow-arm64.dmg`
- `Skill-Flow-arm64.zip`
- `Skill-Flow-x86_64.dmg`
- `Skill-Flow-x86_64.zip`
- `Skill-Flow-universal.dmg`
- `Skill-Flow-universal.zip`
- `sha256.txt`

## Verification

- `npm run build`
- `npm test`
- Focused macOS desktop model and interaction suites
- `scripts/release/release-github.sh all`
- `scripts/release/publish-github-release.sh --skip-build`
