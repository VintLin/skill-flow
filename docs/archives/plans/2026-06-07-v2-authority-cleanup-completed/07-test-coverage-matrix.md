# Test Coverage Matrix

Date: 2026-06-07

## Added Coverage

| Area | Test | Status |
| --- | --- | --- |
| Migration | authority replace rollback | Added |
| Migration | collection replace rollback | Added |
| Migration | collection completion sentinel missing | Added |
| Migration | orphaned legacy virtual source | Added |
| Migration | legacy `valid: false` preserved | Added |
| Migration | missing legacy projection `status` defaults active | Added |
| Import preparation | committing record not deleted by prepare | Added |
| Runtime collection | duplicate projected skill name emits `COLLECTION_SKILL_NAME_CONFLICT` | Added |
| Runtime collection | empty name emits `COLLECTION_NAME_EMPTY` | Added |
| Runtime collection | empty skills emits `COLLECTION_SKILLS_EMPTY` | Added |
| Desktop | `github` source kind counts as remote | Added |

## Existing Coverage Kept

- Current authority build and package tests.
- State store normalization tests for discarded redundant fields.
- Desktop bridge selected-skill payload tests.
- Collection create / merge / restore happy paths.

## Remaining Deferred Coverage

- `createSourceRevision` exhaustive check.
- `managedProjections` alias removal static assertion.
- Legacy lock `sources` record-shape behavior.
- End-to-end old V1 data -> migrate -> CLI bridge round-trip.
