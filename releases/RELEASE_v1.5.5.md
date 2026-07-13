# RELEASE v1.5.5

## Summary

- `v1.5.5` hardens online skill download and update on unstable networks, keeps multi-group updates consistent when some groups fail, and cleans up the desktop Group Operation Queue ownership after the `v1.5.4` queue work.
- Compared with `v1.5.4`, refreshes and imports are less likely to fail early on timeouts, partial bulk updates report honest success/failure counts, and queue orchestration is isolated from `MainViewModel`.

## Highlights

### 1. Longer network budgets for update and import (#10)

- Desktop bridge `update` and `add` use the extended network timeout (5 minutes), not the 60s UI default.
- Provider metadata fetch default is 60s; skill-group archive downloads use a dedicated 5-minute budget.
- Bridge timeout flag is named `usesExtendedNetworkTimeout` (covers import, update, and add).

### 2. More robust download and multi-group update

- Multi-source `updateSources` continues when one group fails and still persists successful checkouts and lock state.
- Result includes typed `failed[]` and `status: partial` when some groups fail.
- Git commands have a wall-clock timeout; transient clone/archive failures retry with backoff.
- Non-retryable HTTP client errors (for example missing branch) stay terminal.

### 3. Desktop queue ownership and bulk toast honesty

- `GroupOperationCoordinator` owns queue drain and phase publishing; card busy state has a single write path.
- Home **Update All** no longer always claims full success: partial outcomes show updated vs failed counts.

## User-visible changes

- Online update/import is more tolerant of slow or flaky networks (longer waits before timeout).
- Update All (or multi-group update) may report **partial** success instead of a single success/failure for the whole batch.
- Queue and concurrent-click behavior from `v1.5.4` is unchanged in intent; internal structure is cleaner.

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
- `scripts/release/release-github.sh all`
- `gh release create` / asset upload for `v1.5.5`
