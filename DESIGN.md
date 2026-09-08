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

Box surfaces are rounded through their shared owner: Panels use `--jr-radius-xl`,
Cards and Modals use `--jr-radius-lg`, and field controls use `--jr-radius-md`.
Pill indicators retain their circular shape. Product styles do not override these radii.
An outlined Card uses the neutral strong border. Running is a neutral status;
danger colours identify failures and destructive actions.
Run and health labels use `--jr-radius-sm`.
The masthead touch target is 52px wide and 57px high to preserve the existing
mobile navigation geometry; it is intentionally separate from the form-control scale.

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
values, not domain entities. The public set is exported from
[`packages/design-ui/src/index.ts`](packages/design-ui/src/index.ts).
Storybook documents the components and their supported variants.

Application code must use these controls instead of restyling native buttons. A new shared component
must represent repeated generic interaction, not a single Discovery feature.

Before adding page markup or CSS for an established visual pattern, use the component that owns it
in `@job-radar/design-ui`. Product styles may arrange a component within a page, but must not copy
its internal styles or override them through a page-level selector. A visual exception requires a
named public variant in the owning component and acceptance evidence for that variant. Code review
must reject changes that bypass this contract.

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

Motion must explain state or preserve spatial context. Durations and easing come from tokens.

Movement is timed separately from colour and opacity. `--jr-motion-duration-*` covers colour and
opacity; `--jr-motion-transform-*` and `--jr-motion-transform-distance` cover anything that moves.
Under `prefers-reduced-motion: reduce` the transform tokens resolve to zero and the duration tokens
keep their values, so a state change still fades where it no longer travels, and decorative looping
animations stop. Reduced motion asks for less movement, not for no animation, and removing the
fades takes away the cue that makes a state change legible.

Do not apply a global `0.01ms !important` reset because it breaks useful interaction feedback and
component-owned motion decisions. Note that `sonner` sets `animation: none !important` on its own
toasts under reduced motion, so toast fades are outside this contract until that is overridden.

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
