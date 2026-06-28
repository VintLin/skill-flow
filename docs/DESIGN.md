# Design

本文件是 Skill Flow desktop 主窗口和 menu bar 的 UI design token 与交互语言事实源。

## Scope

覆盖：

- macOS desktop main window
- menu bar quick config
- shared desktop components

不覆盖：

- CLI/TUI 文案规范
- README marketing 截图风格

## Visual Direction

Style: factory-inspired operational UI.

Principles:

- Dense, calm, utilitarian layout.
- Strong border hierarchy, minimal shadows.
- One warm accent for action and focus.

## Typography

- Sans: `Geist`
- Mono: `Geist Mono`
- Default body size: `14px`
- Mono surfaces: `13px`

## Color Tokens

- `--color-brand-primary`: `rgb(238, 96, 24)`
- light `--color-1`: `oklch(0.993 0 0)` / `rgb(253, 253, 253)`
- light `--color-2`: `oklch(0.982 0 0)` / `rgb(249, 249, 249)`
- light `--color-3`: `oklch(0.961 0 0)` / `rgb(242, 242, 242)`
- dark `--color-1`: `oklch(0.162 0 0)` / `rgb(14, 14, 14)`
- dark `--color-2`: `oklch(0.195 0 0)` / `rgb(21, 21, 21)`
- dark `--color-3`: `oklch(0.254 0 0)` / `rgb(34, 34, 34)`
- `--color-text-primary-light`: `rgb(2, 2, 2)`
- `--color-border-default-light`: `rgb(184, 179, 176)`
- `--color-success`: `rgb(34, 197, 94)`
- `--color-warning`: `rgb(234, 179, 8)`
- `--color-danger`: `rgb(239, 68, 68)`
- `--color-info`: `rgb(59, 130, 246)`

Surface mapping:

- Page background uses `color-2`.
- Card on page uses `color-1`.
- One-level nested card uses `color-2`.
- Two-level nested card uses `color-3`.

State semantics:

- Primary action: brand.
- Success / healthy: green.
- Warning / review: yellow.
- Blocked / failure: red.

## Spacing And Radius

- Base spacing scale: `4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48`
- Corner radius: `4 / 6 / 10 / 16`
- Click target minimum: `44px`

## Components

Buttons:

- Primary: brand fill.
- Secondary: neutral surface plus border.
- Ghost: transparent plus border.

Badges:

Allowed set only: `VALID`, `WARNING`, `INVALID`, `ACTIVE`, `DRIFTED`, `BLOCKED`.

Tables and lists:

- Prefer medium-high density.
- Use borders for row separation.
- Avoid decorative cards unless the card is the interaction unit.

## Motion

- Fast: `150ms`
- Normal: `200ms`
- Slow: `300ms`

No decorative motion by default. Motion must improve hierarchy or feedback.

## Accessibility

- Keyboard reachable for all core actions.
- Focus ring uses brand accent.
- Screen reader labels required for status and action controls.
- Do not communicate status by color alone.

## Content Tone

Use utility language:

- State.
- Cause.
- Next action.

Do not use aspirational or marketing copy in app UI.

## Related Verification

- [Group Card state matrix](verification/GROUP_CARD_STATE_MATRIX.md)
- [Group Card usage context](references/REF_group-card-usage-context.md)
- [Group Card element visibility matrix](references/REF_group-card-element-visibility-matrix.md)

