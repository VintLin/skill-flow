# Release vNEXT

## Unreleased

### Desktop active-detail freshness

- Refreshes the currently open Group detail immediately after a committed single or bulk Update, including complete Skill documents, statistics, and the file tree.
- Keeps route and project-scope ownership stable while updates finish, rejects stale inspect completions, and retries a failed detail refresh when the user re-enters the Group.
- Preserves the last usable detail on refresh failure and reconciles Skill selection when an update removes the selected Skill.

### Contributors

- Thanks to [@ren2019](https://github.com/ren2019) for originating and contributing [PR #15](https://github.com/VintLin/skill-flow/pull/15), which identified and addressed stale active-detail content after Update.
