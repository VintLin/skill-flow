# RELEASE v1.5.3

## Summary

- `v1.5.3` hardens the desktop bridge command surface by centralizing command names, routing CLI bridge requests through a handler table, and checking Swift command parity against a shared fixture.
- Compared with `v1.5.2`, bridge command changes now have a smaller, test-backed maintenance path.

## Highlights

### 1. Bridge commands have one TypeScript catalog

- `packages/shared-types` now owns `BRIDGE_COMMAND_NAMES`.
- The parser, command guard, and parser error text are derived from the catalog.
- A golden JSON fixture records the protocol version and supported command list.

### 2. CLI bridge dispatch is table-driven

- CLI bridge requests now route through a handler table instead of a large switch.
- Tests verify every supported bridge command has a CLI handler.
- Unsupported commands still return the existing `UNSUPPORTED_COMMAND` response shape.

### 3. Swift bridge metadata is easier to keep aligned

- `BridgeCommand` is `CaseIterable`.
- Import timeout classification lives next to the Swift command model.
- Swift tests compare desktop commands with the shared TypeScript fixture.

## User-visible changes

- No intentional CLI command syntax, bridge payload shape, or desktop UI behavior changes.
- Desktop bridge behavior is intended to stay compatible with `v1.5.2`.

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
- `scripts/release/publish-github-release.sh --skip-build`
