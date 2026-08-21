# Import Timeout And Feedback Design

## Context

On a fresh Mac with only Codex Desktop installed, importing a recommended skill group can stay on `Downloading...` for a long time. While one import is running, other Import buttons appear clickable but do nothing.

Local reproduction on the development machine did not hang:

- `search-import-groups` with empty query returned in about 3.3 seconds.
- `preview-import-source anthropics/skills` returned in about 3.4 seconds.
- `import-source anthropics/skills` with a temporary state root returned in about 6.1 seconds.

The failure is therefore likely environment-dependent. The import path depends on bridge subprocess execution and network access to `skills.sh`, `api.github.com`, and GitHub archive downloads.

## Current Flow

The Import page seeds recommended cards from bundled `recommendations.json`. Cards auto-preview through `preview-import-source`. When the user clicks Import before preview has loaded skills, the app first waits for preview, then calls `import-source`.

`BridgeClient.send` starts a Node helper subprocess and waits for process termination. It defines a timeout error type but does not currently enforce a timeout. If the subprocess hangs on network or an external command, the Swift UI remains in the importing state.

`MainViewModel.importImportGroup` uses one global `importingImportGroupId`. If any import is active, later import attempts return immediately. The UI does not make this global lock obvious for non-active cards.

## Goals

- Make recommended import fail with a clear timeout instead of staying on `Downloading...`.
- Apply timeouts to bridge subprocess execution and import-related network requests.
- Keep the existing single-import model, but make other import buttons visibly disabled and explain why while an import is active.
- Preserve rollback behavior when `import-source` fails after preparing a source.
- Add focused tests for timeout behavior and UI state derivation.

## Non-Goals

- Do not support parallel imports in this change.
- Do not add new runtime dependencies.
- Do not change the bridge protocol shape unless existing error fields are insufficient.
- Do not change recommendation ranking or bundled recommendation data.

## Proposed Approach

### Bridge Timeout

Add a bounded timeout to `BridgeClient.send`. Ordinary commands use 60 seconds,
network-heavy import/add commands use 5 minutes, and managed update uses 5
minutes per explicitly selected source with a 15-minute ceiling. Update-all
uses the 15-minute ceiling. If the helper process has not exited by its active
budget, terminate it, clear pipe handlers, and throw
`BridgeClientError.timeout(timeoutMs)`.

The timeout must cover all bridge commands. Command-specific budgets may be
longer than the ordinary default, but no desktop action may wait indefinitely.

Implementation detail:

- Race subprocess termination against a sleep task.
- On timeout, call `process.terminate()`.
- If the process does not terminate shortly after SIGTERM, still return timeout to the UI and let the OS clean up.
- Keep existing stdout and stderr parsing unchanged for non-timeout exits.

### Network Request Timeout

Add a small shared helper in the integration layer for timeout-bound fetch calls. Use `AbortController` and default to 30 seconds for provider requests.

Apply it to:

- `packages/integration/src/utils/skills-directory.ts`
- `packages/integration/src/utils/github-catalog.ts`
- GitHub and GitLab archive downloads in `packages/core-engine/src/services/source-service.ts`

Timeout errors should map to existing provider-style failures where possible:

- skills.sh source/search/feed timeout -> request failed error with a timeout-specific message.
- GitHub repo/tree timeout -> GitHub request failed error with a timeout-specific message.
- Archive download timeout -> import preparation failure with a readable timeout message.

### Import UI Feedback

Keep `importingImportGroupId` as the single active import lock.

Update Import card action state so that:

- The active card shows the existing `Downloading...` state.
- Other Import buttons are disabled while any import is active.
- Disabled buttons expose a short reason such as `Another import is already running.` through the existing button help/tooltip mechanism if available.
- If the shared group card cannot display a tooltip for disabled buttons, show a neutral toast with the same reason when the user tries to start another import.

If the shared group card API needs only a boolean disabled flag, compute it from:

- card already installed
- local version selection required
- no selected skills after preview
- another card is currently importing

The UI should distinguish this case from validation failures. A selected-skills validation problem should keep the current disabled behavior. The global import lock should show the explicit "another import is running" reason.

### Error Handling

When bridge timeout occurs, the existing localized `bridge.error.timeout` string is used. The Import page should surface it through the existing import failure toast path:

`Import failed: Operation timed out after 60000ms.`

Network timeout messages should remain specific enough to distinguish:

- provider metadata timeout
- GitHub archive download timeout
- bridge subprocess timeout

### Tests

Add focused tests at the smallest practical layer:

- Swift bridge client timeout behavior, if the existing desktop test harness can run a helper command that sleeps.
- TypeScript tests for timeout-bound fetch helper using a mocked never-resolving fetch or abort-aware fake fetch.
- Runtime import tests verifying an archive timeout returns a failed import result and does not leave a prepared source registered.
- Swift view model or ImportScreen state tests verifying non-active import buttons are disabled while `importingImportGroupId` is set.
- UI-state tests verifying the disabled reason or fallback toast is produced when another import is already active.

If the Swift test harness cannot easily spawn a hanging helper, cover bridge timeout logic with an injectable process runner or a small unit around the timeout wrapper. Keep the injection local to `BridgeClient` tests.

## Risks

- A bounded bridge timeout can interrupt a legitimately slow network action. Import and update receive larger command-specific budgets, while indefinite loading remains disallowed.
- Timeout behavior in Swift subprocess handling must avoid leaving pipe readability handlers attached.
- Adding a fetch helper touches shared integration code. Keep the helper small and avoid broad refactors.

## Validation

Minimum validation:

- Run relevant TypeScript tests for integration/query/core import behavior.
- Run desktop Swift tests that cover bridge or Import UI state.
- Manually run bridge commands with a temporary state root:
  - `search-import-groups`
  - `preview-import-source`
  - `import-source`
- Manually simulate a hung helper or blocked network path and verify the UI exits `Downloading...` with a timeout error.

## Completion Criteria

- Import can no longer remain on `Downloading...` indefinitely.
- Timeout failures are visible to the user.
- Other Import buttons are disabled while one import is active, and the UI explains that another import is already running.
- Existing successful import path still works.
- Related tests pass.
