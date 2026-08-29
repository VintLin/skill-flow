# Release vNEXT

## Unreleased

- Desktop bootstrap now reads cached project scope, returns a smaller first-screen payload, and starts usage collection only after the workspace is ready. This removes synchronous agent-observation scans and large authority-state fields from the launch path.
- Deployment planning now shares target detection and runs independent source/target reads concurrently. No-op applies skip target discovery, while real changes inspect only the affected targets.
- Managed updates that confirm a group is unchanged now finish their recovery transaction without rerunning global deployment reconciliation; repaired or changed groups still take the full protected path.
- Bulk Update now checks remote Git revisions with up to three concurrent reads before committing required updates serially. Queued desktop imports similarly prepare up to three disposable downloads ahead of their FIFO commit turn, preserving the single recovery-journal boundary.
- Desktop skill and target toggles now settle as soon as Apply returns instead of holding the saving state for an artificial 200 ms minimum.
