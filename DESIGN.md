# Job Radar design system

This file is the design contract for Job Radar. Storybook demonstrates the components, but this
file defines the rules they must follow.

## Ownership

The design system has two context-neutral packages:

- `@job-radar/design-tokens` owns visual decisions as CSS custom properties.
- `@job-radar/design-ui` owns generic React controls that consume those tokens.

Discovery-specific components stay in `src/contexts/discovery/presentation`. Shared packages must
not import Discovery models, React Router, persistence, search providers, or ATS adapters. A second
product consumer is required before another shared UI package is introduced.

## Token contract

Primitive colours are authored in OKLCH and named `--jr-palette-*`. Only the token package may use
primitive colours. Consumer styles use semantic `--jr-color-*` roles such as canvas, surface, text,
border, action, danger, and focus.

Every public token begins with `--jr-`. The token package also owns:

- type families, sizes, weights, and line heights
- spacing and control sizes
- border widths and radii
- shadows and stacking levels
- motion durations and easing

Product and component styles must not contain raw colour values or raw numeric font sizes. Add or
reuse a semantic token instead. Architecture tests enforce these rules.

## Themes

The default theme follows the operating system through `color-scheme: light dark` and
`light-dark()`. Setting `data-theme="light"` or `data-theme="dark"` on the root element selects an
explicit theme. All three modes use the same semantic roles and must remain functionally equal.

No consumer stylesheet may set `color-scheme`. Doing so can override the token layer and break dark
or system mode.

## Components

Generic components expose small, context-neutral contracts. They accept primitives and presentation
values, not domain entities. The current public set is:

- `Button` and `buttonAttributes` for button and link actions
- `IconButton` for labelled icon-only actions
- `TextField`
- `TokenAutocomplete` for multi-value suggestion selection
- `Switch`
- `Modal`
- `Skeleton`
- `PageHeader`

Application code must use these controls instead of restyling native buttons. A new shared component
must represent repeated generic interaction, not a single Discovery feature.

## Application patterns

Workspace navigation keeps the current page readable while the next route loads. The destination
link shows the pending state with semantic navigation tokens, exposes `aria-busy`, and announces the
destination through a live status region. Focus stays on the link after the route commits.

Context-owned tables with hundreds of rows use `TableVirtuoso` directly. Keep native table, header,
row, and cell semantics. Sort the complete loader-owned data set before virtualization, use stable
row keys, and retain window scrolling unless the product calls for a bounded scrolling region. Do
not promote this pattern into `@job-radar/design-ui` until a second context needs the same table
contract.

## Accessibility

- Interactive targets are at least 44 by 44 CSS pixels.
- Every control has an accessible name and native semantics where possible.
- Keyboard focus is visible in every theme.
- Busy controls expose `aria-busy` and cannot be submitted twice.
- Errors identify the affected field and explain how to recover.
- Dialogs use the native `dialog` element, an accessible title, and keyboard cancellation.
- Colour pairs used for text and controls meet WCAG AA contrast.

Storybook evaluates catalogue stories with its accessibility addon. Playwright runs axe checks
against the real application in light and dark modes.

## Motion

Motion must explain state or preserve spatial context. Durations and easing come from tokens. Under
`prefers-reduced-motion: reduce`, duration tokens resolve to zero and decorative looping animations
stop. Do not apply a global `0.01ms !important` reset because it breaks useful interaction feedback
and component-owned motion decisions.

## Verification

Run these checks after changing tokens or shared components:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm storybook:build
pnpm test:e2e
pnpm build
```

The token tests verify OKLCH authorship, semantic mapping, theme support, reduced motion, and computed
contrast. Architecture tests protect package direction, token use, typography, and shared control
ownership.
