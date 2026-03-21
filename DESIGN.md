# DESIGN.md

Design system source of truth for `skill-manager`.

Last updated: 2026-03-21
Product mode: terminal-first
Primary product metaphor: Workflow Control Tower

## 1. Product Feeling

`skill-manager` should feel like a calm, high-signal operator console.

Not:
- a generic package manager
- a filesystem browser with extra buttons
- a web dashboard trapped inside a terminal
- a "developer tool" that assumes users enjoy reading paths and raw state

Yes:
- dense, deliberate, and structured
- grouped around workflows, not loose files
- built for repeat use, not one-time setup
- clear under stress: drift, invalid skills, broken projections, unavailable channels

The emotional promise is:

> "I can see what belongs together, what is active, what changed, and what needs attention."

## 2. Core Design Principles

1. Workflow first. The top-level object is the grouped workflow, not the individual skill leaf.
2. Action follows understanding. Users should understand a group before they project it.
3. Paths are metadata. Raw source locators and target directories are secondary detail.
4. Partial state is normal. Mixed validity and mixed agent availability are first-class states.
5. Text over decoration. Hierarchy comes from structure, spacing, labels, and state words before color or ornament.
6. Recovery is part of the UI. `doctor`, conflict repair, and broken-target guidance are core experiences.
7. Dense is acceptable; clutter is not. The tool may be information-rich, but every visible line must earn its place.

## 3. Product Vocabulary

Use these terms consistently in UI copy, docs, and future code comments:

- `Workflow Group`
  The primary user-facing top-level unit.
- `Source`
  Secondary metadata describing where a workflow group came from.
- `Contained Skills`
  The leaf skills inside a workflow group.
- `Projects To`
  The agent targets a workflow group is applied to.
- `Apply Preview`
  The review step before writing changes.
- `Health`
  The current operational state of a workflow group or projection target.
- `Drift`
  Manifest/lock/on-disk mismatch or stale projection state.

Avoid these as primary labels:
- `Repo`
- `Inventory`
- `Deployment Unit`
- `Managed Artifact`
- `Channel Binding`

These are valid implementation concepts, not user-facing concepts.

## 4. Information Architecture

The default interaction model is three-layer:

1. Workflow Group
2. Contained Skills
3. Agent Projection

### Default wide layout

```text
+------------------------+--------------------------+----------------------+
| WORKFLOW GROUPS        | GROUP DETAIL             | AGENT PROJECTION     |
|                        |                          |                      |
| frontend-workflow      | Purpose                  | Claude Code          |
| agent-ops              | Contained Skills         | Codex (.agents)      |
| pdf-toolchain          | Health / Warnings        | OpenCode             |
|                        | Update State             | OpenClaw             |
+------------------------+--------------------------+----------------------+
```

### Hierarchy by pane

Left pane:
- What groups exist
- Which ones are active
- Which ones need attention now

Middle pane:
- What this group is
- What skills it contains
- What is wrong with it, if anything

Right pane:
- Where it projects
- What will change
- What is blocked

## 5. Layout Rules

### Wide terminal
- Three panes
- Left pane is persistent navigation
- Middle and right panes are context panels

### Medium terminal
- Left pane remains persistent
- Middle/right become a visible toggle
- Current mode must be obvious: `DETAIL` or `PROJECTION`

### Narrow terminal
- Explicit step flow, not compressed columns
- Suggested order:
  1. Select Workflow Group
  2. Select Contained Skills
  3. Select Agent Projection
  4. Review Apply Preview

Never collapse three panes into unreadable tiny columns.

## 6. Typography

Terminal-first typography only.

### Primary choice
- Use the terminal's monospaced font or terminal-native system mono.

### Text roles
- Heading
  Strong uppercase or strongly weighted sentence case
- Primary label
  Workflow group name, selected channel name, step title
- Secondary metadata
  Source locator, counts, path detail
- State label
  `HEALTHY`, `UPDATE AVAILABLE`, `PARTIAL`, `BLOCKED`
- Hint text
  Keyboard shortcuts, low-priority guidance

### Typography rules
- Prefer weight, indentation, and spacing over ASCII noise
- Do not overuse box drawing if it reduces scan speed
- Do not style every line equally

## 7. Spacing System

Use a tight terminal rhythm:

- `1x`
  Between tightly related text lines
- `2x`
  Between row groups or adjacent state blocks
- `4x`
  Between panes, sections, or screen-level blocks

Rules:
- Rows need breathing room, but not web-app whitespace
- Warning blocks get extra separation
- Empty states should feel intentionally framed, not collapsed into surrounding UI

## 8. Color and Status Language

Color is optional support, never the primary carrier of meaning.

### Required rule
Every state must be understandable in monochrome.

### Primary status words
- `HEALTHY`
- `ACTIVE`
- `INACTIVE`
- `PARTIAL`
- `BLOCKED`
- `INVALID`
- `UPDATE AVAILABLE`
- `UP TO DATE`
- `DRIFT DETECTED`

### If color is available
- Healthy: restrained green accent
- Warning / partial: amber accent
- Error / blocked: red accent
- Informational / metadata: dim gray

Never encode selection, warning, or error using color alone.

## 9. Visual Style

The right aesthetic is "operator control plane," not "AI startup dashboard."

### Use
- strong row hierarchy
- restrained symbols
- quiet separators
- status-first language
- purposeful density

### Avoid
- card grids
- oversized headers
- generic hero framing
- decorative icon clutter
- dashboard widgets with equal visual weight
- faux-terminal gimmicks inside an actual terminal

## 10. Interaction Model

The interaction model should always follow:

```text
Select group -> inspect contained skills -> inspect targets -> preview changes -> apply
```

### Important interaction rules
- No hidden auto-apply on first selection
- Preview is mandatory before mutations
- Broken state should expose a recovery action in-place
- The user should always know:
  - what object is selected
  - what step they are in
  - what pressing Enter will do

## 11. Selection Model

Tree selection is one of the product's core design surfaces.

### Rules
- Parent rows show `empty / partial / full` state clearly
- Child rows are individually selectable
- Expanding a group should not destroy selection state
- Re-opening config should restore previous selection state

### Recommended state symbols
- `[ ]` unselected
- `[-]` partially selected
- `[x]` fully selected

Keep this boring and obvious. This is not a place for design novelty.

## 12. Screen-by-Screen Requirements

### 12.1 Empty product state

When the user has no workflow groups yet:
- explain what a workflow group is
- prompt one clear next action: add a source
- reassure the user what will happen next

Bad:
- `No items`

Good:
- `No workflow groups yet`
- `Add a Git source to discover a grouped set of related skills.`
- Primary action: `Add Source`

### 12.2 Workflow group list

Each row should show:
- workflow group name
- active target count
- leaf count
- current health
- update badge if relevant

Do not show full source locator in the row body by default.

### 12.3 Group detail pane

Must answer:
- What is this workflow group for?
- Which skills are inside it?
- Are any leaf skills invalid or skipped?
- What changed recently?

### 12.4 Projection pane

Must answer:
- Which targets are available?
- Which targets are active?
- Which targets are blocked?
- What strategy will be used?

### 12.5 Apply preview

Must show:
- create / update / remove / noop counts
- warnings
- blocked actions
- exact group currently being applied

The preview should feel like a confirmation checkpoint, not a scary diff wall.

### 12.6 Doctor / repair

`doctor` is not just a diagnostics dump. It is a guided repair surface.

Must answer:
- what is wrong
- why it matters
- what can be repaired now
- what the user needs to do manually

## 13. State Coverage

Every major flow must define visible behavior for:
- loading
- empty
- error
- success
- partial

### Product-specific reminder
Partial state is common here:
- some leafs valid, some invalid
- some targets available, some blocked
- some projections healthy, some drifted

Design for this explicitly.

## 14. Accessibility

Even in terminal-first UI, accessibility is mandatory.

### Requirements
- Full keyboard operation
- Clear focus indication
- Selection state not color-only
- Errors and warnings labeled with explicit text
- Stable reading order in each screen
- Shortcuts visible in-context, not hidden in docs only

### Copy requirement
System messages should explain the problem in human language first, implementation detail second.

Bad:
- `Lock state mismatch`

Better:
- `This workflow group's saved state no longer matches what's on disk.`

## 15. Motion

Motion is not part of terminal-first MVP.

Do not simulate motion for style.
If a transition exists, it should clarify progression, not decorate it.

## 16. Copy Style

Tone:
- precise
- calm
- operational
- not cute
- not robotic

Prefer:
- `Projects To`
- `Update Available`
- `No supported agents detected`
- `Some contained skills were skipped because their SKILL.md is invalid`

Avoid:
- vague system-speak
- overfriendly empty platitudes
- unexplained abbreviations

## 17. Default Decisions For MVP

These are the default design decisions unless explicitly revised:

1. Top-level UI label is `Workflow Group`.
2. `Source` appears only as secondary metadata.
3. First release is Git-only in the visible product experience.
4. `Codex (.agents/skills)` is a single surfaced target.
5. `Apply to all agents` only appears in review/preview flow, not as the first default affordance.
6. Raw paths are hidden by default.
7. `doctor` exists both as a command and as an inline recovery affordance from broken rows.
8. Three-pane layout is the ideal view; medium and narrow terminals degrade intentionally, not automatically.

## 18. Implementation Guidance

When code is eventually written, the design system should influence:
- terminal copy
- pane hierarchy
- state labels
- keyboard shortcut visibility
- warning and repair presentation

This file should be treated as the visual and interaction source of truth for MVP terminal UX.

## 19. Future Expansion

If the product grows beyond terminal-first MVP, revisit this file and extend:
- richer brand system
- web or desktop surfaces
- illustration or motion language
- broader source discovery UX

For now, restraint is the right design decision.
