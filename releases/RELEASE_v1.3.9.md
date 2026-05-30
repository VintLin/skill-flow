# RELEASE v1.3.9

## Summary

- `v1.3.9` improves Skill management in the macOS desktop app.
- Compared with `v1.3.8`, users can rename Skill groups, import supported links from the home page, and filter groups through a redesigned sidebar.

## Highlights

### 1. Skill groups are easier to manage

- Skill groups can now be renamed from the desktop UI instead of always using the original repository name.
- Rename state is preserved across source refreshes and detail enrichment updates.
- Failure and empty-name states use localized desktop feedback.

### 2. Home import and filtering are more direct

- Supported import links pasted on the home page can hand off directly to import preview.
- GitHub and GitLab locator handling is more tolerant, including subgroup-style GitLab paths.
- The home sidebar now filters by status, source type, tags, agent applicability, and project scope.

### 3. Sidebar and titlebar polish

- Sidebar sections start collapsed, show one-line horizontal chips when collapsed, and wrap chips when expanded.
- The sidebar can fully collapse; when it is hidden, the home grid can use the reclaimed width.
- The macOS header is integrated into the sidebar area with clickable app controls and traffic-light alignment that survives window resize and full-screen transitions.

## User-visible changes

- The Chinese status filter now uses `置顶` instead of `常用`.
- Only tag filter chips use `#`; other sidebar options use plain labels.
- The Skill Flow logo and title have more space from the macOS system buttons.
- Dev macOS packaging can reuse a matching bundled Node runtime instead of downloading it again.

## Release Artifacts

- `skill-flow-1.3.9.tgz`
- `Skill-Flow-arm64.dmg`
- `Skill-Flow-arm64.zip`
- `Skill-Flow-x86_64.dmg`
- `Skill-Flow-x86_64.zip`
- `Skill-Flow-universal.dmg`
- `Skill-Flow-universal.zip`
- `sha256.txt`
