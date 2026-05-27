# RELEASE v1.3.8

## Summary

- `v1.3.8` fixes local import handling in the desktop app and tightens Hermes Agent presentation.
- Compared with `v1.3.7`, local skill folders are easier to import from pasted paths, and skill names in import cards now follow the metadata users maintain in `SKILL.md`.

## Highlights

### 1. Local import paths are more tolerant

- The desktop import page now accepts local paths wrapped in single or double quotes.
- Paths with spaces can be pasted directly without triggering provider or selector errors.
- Local import preview and apply now use stable relative skill paths for nested skills, avoiding ambiguous selector failures.

### 2. Skill card names follow skill metadata

- Local import cards prefer `SKILL.md` frontmatter `name` for the visible skill name.
- Fallback display names now follow the order: `SKILL.md` `name`, folder name, `agents/openai.yaml` `display_name`, then Markdown heading.
- This avoids mixing English Markdown headings with localized skill names in the same local import set.

### 3. Hermes Agent desktop icon rendering is corrected

- Hermes Agent now renders through the same bundled icon path as other desktop agent icons.
- Group cards and target controls display the Hermes Agent icon consistently.
- Desktop icon coverage includes regression tests for Hermes Agent rendering.

## User-visible changes

- Users can paste local skill folder paths such as `'/path/with spaces/skills'` into the import page.
- Local import cards show the intended `SKILL.md` skill names instead of falling back to mixed Markdown headings.
- Hermes Agent target rows and cards show the expected icon.
- The CLI command surface and bridge protocol stay unchanged.

## Release Artifacts

- `skill-flow-1.3.8.tgz`
- `Skill-Flow-arm64.dmg`
- `Skill-Flow-arm64.zip`
- `Skill-Flow-x86_64.dmg`
- `Skill-Flow-x86_64.zip`
- `Skill-Flow-universal.dmg`
- `Skill-Flow-universal.zip`
- `sha256.txt`
