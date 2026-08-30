# RELEASE v1.6.5

## Summary

- `v1.6.5` fixes repeated Gatekeeper workarounds for Skill Flow's macOS packages without requiring an Apple Developer account.
- Each architecture keeps its existing Bundle ID while gaining a stable cross-version ad-hoc identity and a fully sealed app bundle.

## Highlights

### 1. Stable unsigned application identity

- Signs the completed app bundle instead of relying on the Swift executable's linker signature.
- Pins the designated requirement to the architecture's existing Bundle ID, allowing macOS to recognize later builds as the same application.
- Preserves the existing arm64, x86_64, universal, and development Bundle IDs so current preferences are not reset.

### 2. Clean DMG and ZIP metadata

- Removes quarantine, download-origin, and access-control metadata inherited from source resources before signing.
- Stops ZIP packaging from restoring extended attributes, quarantine data, resource forks, or ACLs.

### 3. Release validation

- Requires strict deep signature validation, the expected stable designated requirement, and a clean extended-attribute scan.
- Rejects packages that regress to an unsealed app, architecture-specific identity drift, or embedded download metadata.

## User-visible changes

- The first unsigned installation may still require Finder → Open because the app is not Developer ID signed or notarized.
- After approving this stable-identity build once, later same-architecture updates should no longer require repeated `sudo xattr` commands.
- Existing app preferences and architecture-specific installation identity remain unchanged.

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
- Production universal app and ZIP extraction validation
- `scripts/release/release-github.sh all`
- `scripts/release/publish-github-release.sh --skip-build`
