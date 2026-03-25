# Skill Flow v1.0.5 Release Notes

Date: 2026-03-23
Version: `v1.0.5`

## Summary

`v1.0.5` is a major feature release introducing repair commands, enhanced diagnostics, and substantial architecture improvements.

This release adds 3,600+ lines of new code across 17 files, introducing ConfigCoordinator bootstrap flow, duplicate leaf detection, repair commands, and major TUI enhancements.

## Highlights

### 1. ConfigCoordinator Bootstrap Flow (Major Architecture Change)

Introduced `ConfigCoordinator` to handle workspace bootstrap with proper error recovery:

- `ConfigBootFailure` and `ConfigBootStatus` types for bootstrap phase tracking
- `runSerializedMutation` to prevent concurrent state modifications
- `pruneMissingCheckoutsImpl` to handle missing checkout directories
- Refactored `StateStore` to use `readState`/`writeState` with mutation locking

### 2. Repair Commands

New repair CLI commands for troubleshooting:

- `repair-source` - Repair source configuration issues
- `repair-state` - Fix state corruption
- `repair-targets` - Recover target configuration

### 3. Enhanced Doctor Diagnostics

Doctor service now reports:

- Invalidated selected leafs as errors
- Unmanaged external target skills as warnings
- Bootstrap failures merged into audit report

### 4. Duplicate Leaf Detection

Added detection and handling of duplicate leaf nodes:

- `DuplicateLeafRecord` type
- `DUPLICATE_LEAF` warning code

### 5. Source Lifecycle Improvements

Major improvements to source update tracking:

- Source update diff tracking with `moved`, `added`, `removed`, `changed`, `invalidated` kinds
- Local source refresh uses atomic swap with backup
- `SourceService` builds detailed diffs when updating sources

### 6. TUI Major Enhancement

Config app received substantial improvements:

- 1580 lines of changes
- Added search functionality
- Source cards and target panels
- Better layout and user experience

### 7. New Test Coverage

Added comprehensive test coverage:

- `source-lifecycle.test.ts` - 467 lines
- `config-integration.test.ts` - 317 lines
- `config-ui-utils.test.ts` - 364 lines
- `target-definitions.test.ts`
- `test-helpers.ts` - 144 lines

## User-visible Behavior Changes

- New repair commands available: `repair-source`, `repair-state`, `repair-targets`
- Better diagnostics from `doctor` service
- Improved startup reliability with ConfigCoordinator
- Enhanced TUI with search, better layout
- More accurate source updates with diff tracking

## Verification

Commands run:

```bash
npm run build
npm test
```

Result:

```text
Tests passing
```
