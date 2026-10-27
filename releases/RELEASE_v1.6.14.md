# RELEASE v1.6.14

## Summary

v1.6.14 curates the built-in skill discovery catalog and makes scoped catalog search consistent between remote and checked-out sources.

## Highlights

- Adds scoped discovery for agent-qa, Vercel Skills, agent-browser, Vercel Agent Skills, and Matt Pocock's engineering skills.
- Keeps the default catalog focused on trusted, broadly useful sources.
- Applies the five-result per-source limit consistently after checkout path filtering.

## User-visible changes

- `skill-flow find` now searches a smaller, more focused set of built-in recommendation groups.
- Scoped sources expose only their intended directories, avoiding duplicate packaged copies and in-progress skill trees.
- A built-in source returns the same maximum of five matching results whether its catalog is remote or already checked out locally.

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
- Final built-in source smoke check: 12 sources and all scoped paths validated.
- `git diff --check`
- Desktop artifacts validated for arm64, x86_64, and universal bundles.
