# Release vNEXT

## Unreleased

- Desktop bootstrap now reads cached project scope, returns a smaller first-screen payload, and starts usage collection only after the workspace is ready. This removes synchronous agent-observation scans and large authority-state fields from the launch path.
- Deployment planning now shares target detection and runs independent source/target reads concurrently. No-op applies skip target discovery, while real changes inspect only the affected targets.
- Managed updates that confirm a group is unchanged now finish their recovery transaction without rerunning global deployment reconciliation; repaired or changed groups still take the full protected path.
