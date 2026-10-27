# RELEASE v1.6.15

## Summary

v1.6.15 fixes macOS desktop mouse hit testing for Agent and Skill controls inside Home group cards.

## Highlights

- Activates and raises the main window reliably after launch, including when the same process also owns the menu bar UI.
- Removes the disabled whole-card gesture from Home cards so child Agent and Skill buttons keep their own mouse hit regions.
- Keeps the existing save flow and busy state while making real mouse input follow the same path as accessibility actions.

## User-visible changes

- Agent and Skill controls on Home group cards respond to real mouse clicks after restarting or returning to Skill Flow.
- A successful click enters the normal saving state and then returns the card to an enabled state.
- Existing group, Agent, Skill, and project selections are preserved.

## Release Artifacts

- `Skill-Flow-arm64.dmg`
- `Skill-Flow-arm64.zip`
- `Skill-Flow-x86_64.dmg`
- `Skill-Flow-x86_64.zip`
- `Skill-Flow-universal.dmg`
- `Skill-Flow-universal.zip`
- `sha256.txt`

These bundles use ad-hoc signing, not Developer ID signing or Apple notarization.

## Verification

- `npm run build`
- `npm test`
- Focused macOS interaction tests
- Real coordinate mouse click on a Skill control and an Agent control after a clean app restart
- `scripts/release/validate-mac-artifacts.sh` for arm64, x86_64, and universal bundles
- `codesign --verify --deep --strict`
- `git diff --check`
