# DESIGN.md

## 1. Scope

This file is the single source of truth for UI design tokens and interaction language for skill-flow desktop (main window + menu bar).

## 2. Visual Direction

Style: Factory-inspired operational UI.

Reference specimen:
`/Users/Vint/Repos/03_Project/vint-skills/.claude/skills/extract-design/assets/theme/factory-style-specimen.html`

Principles:
- Dense, calm, utilitarian layout.
- Strong border hierarchy, minimal shadows.
- One warm accent for action and focus.

## 3. Typography

- Sans: `Geist`
- Mono: `Geist Mono`
- Default body size: `14px`
- Mono surfaces (raw details, diagnostics): `13px`

## 4. Color Tokens

- `--color-brand-primary`: `rgb(238, 96, 24)`
- Neutral surface scale for card layering:
- `light --color-1`: `oklch(0.993 0 0)` / `rgb(253, 253, 253)`
- `light --color-2`: `oklch(0.982 0 0)` / `rgb(249, 249, 249)`
- `light --color-3`: `oklch(0.961 0 0)` / `rgb(242, 242, 242)`
- `dark --color-1`: `oklch(0.162 0 0)` / `rgb(14, 14, 14)`
- `dark --color-2`: `oklch(0.195 0 0)` / `rgb(21, 21, 21)`
- `dark --color-3`: `oklch(0.254 0 0)` / `rgb(34, 34, 34)`
- Card background mapping:
- Page background uses `color-2`
- Card on page uses `color-1`
- One-level nested card uses `color-2`
- Two-level nested card uses `color-3`
- `--color-text-primary-light`: `rgb(2, 2, 2)`
- `--color-border-default-light`: `rgb(184, 179, 176)`
- `--color-success`: `rgb(34, 197, 94)`
- `--color-warning`: `rgb(234, 179, 8)`
- `--color-danger`: `rgb(239, 68, 68)`
- `--color-info`: `rgb(59, 130, 246)`

State semantics:
- Primary action: brand
- Success/healthy: green
- Warning/review: yellow
- Blocked/failure: red

## 5. Spacing and Radius

- Base spacing scale: 4/8/12/16/20/24/32/40/48
- Corner radius: 4/6/10/16
- Click target minimum: 44px

## 6. Components

### Buttons
- Primary: brand fill
- Secondary: neutral surface + border
- Ghost: transparent + border

### Badges
Allowed set only:
`VALID`, `WARNING`, `INVALID`, `ACTIVE`, `DRIFTED`, `BLOCKED`

### Tables and Lists
- Medium-high density preferred
- Clear row separation by border
- Avoid decorative cards unless card is the interaction unit

## 7. Motion

- Fast: 150ms
- Normal: 200ms
- Slow: 300ms
- No decorative motion by default; motion must improve hierarchy or feedback.

## 8. Accessibility

- Keyboard reachable for all core actions
- Focus ring uses brand accent
- Screen reader labels required for status and action controls
- No color-only status communication

## 9. Content Tone

Use utility language:
- State
- Cause
- Next action

Do not use aspirational or marketing copy in app UI.
