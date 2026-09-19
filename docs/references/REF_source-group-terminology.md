# Source and skill-group terminology

This document is the terminology reference for the first-use CLI flow. Runtime
behavior remains defined by the source and tests.

| Term | Meaning | Example | Stability |
| --- | --- | --- | --- |
| Source locator | The address supplied to install or inspect a source. | `mattpocock/skills` | May vary by input form |
| Source | The registered manifest record created from a locator. | The registered Git source for `mattpocock/skills` | Persisted record |
| Source ID | The stable identifier used by state, commands, and deployment bindings. | `mattpocock-skills` | Stable after registration |
| Display name | The human-readable name shown in lists and configuration. | `Matt Pocock · Skills` | User-editable |
| Skill group | The selectable and deployable set of skills presented as one unit. | The skills imported from the source | Product concept |

## Rules

- Use a locator when describing where a source comes from.
- Use a source ID in commands that manage an already registered source.
- Use a display name in user-facing summaries and headings.
- Do not imply that changing a display name changes the source ID.
- When a repository name is generic, include owner or locator context in the
  default display name.
