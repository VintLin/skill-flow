# External Source Ownership Implementation Plan

## Test checklist

- [x] Domain and storage: ownership normalisation and invalid external state.
- [x] Core lifecycle: adopt, aggregate, collision, refresh, and unregister.
- [x] Query runtime: external sources cannot be deployed, repaired, or updated
  through managed operations.
- [x] CLI: adopt and external status/update command behaviour.
- [x] Bridge: command catalogue, parser, handler, and Swift client contract.
- [x] Desktop: ownership status and action availability.
- [x] Focused package tests and root build; affected desktop test is blocked by
  a pre-existing compile error in `MainViewModel.swift`.

## Implementation order

1. Add the discriminated ownership state and normalisation.
2. Add `ExternalSourceLifecycle` and runtime facade methods, with core tests.
3. Make deployment and repair reject external source IDs and detect collisions.
4. Add CLI and bridge commands, then desktop models and UI states.
5. Update user documentation and execute the verification matrix.
