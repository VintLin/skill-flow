# Skill Flow Desktop (macOS)

SwiftUI menu bar + main window desktop shell for `skill-flow`.

## Scope

- macOS 14+
- Menu bar entry with quick actions
- Main window (`NavigationSplitView`) for source detail + operations
- Local bridge invocation (`skill-flow bridge --json`)
- No separate business database (`manifest.json` + `lock.json` remain SSOT)

## Development

1. Build CLI helper first:

```bash
npm run build
```

2. Build desktop shell:

```bash
cd apps/desktop-mac
swift build
```

3. Development helper override (debug only):

```bash
export SKILL_FLOW_DESKTOP_HELPER_OVERRIDE=/absolute/path/to/apps/cli/dist/cli.js
```

## Notes

- Release build must bundle a fixed Node runtime + fixed CLI helper.
- External helper override is debug-only and must not be enabled in release artifacts.
- Mutating operations are serialized by `MutationCoordinator` to prevent concurrent apply/update/uninstall races.
