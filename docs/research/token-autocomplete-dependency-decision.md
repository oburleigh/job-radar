# Token autocomplete dependency decision

## Required contract

Profile and Recruiter Search forms need multi-value catalogue controls with keyboard navigation, chips,
removal, filtering, controlled values, loading feedback, validation, and accessible combobox semantics.
The application must keep its existing form field names and newline-delimited request values. The package
must support React 19, TypeScript, server rendering, and the repository's CSS tokens.

## Candidates

`@base-ui/react` 1.7.0 is MIT licensed, supports React 17 through 19, and was released on 4 August 2026.
Its Combobox supports controlled multiple selection, chips, filtering, keyboard interaction, and async
items. The package supplies the generic interaction contract while Job Radar owns only form mapping,
catalogue queries, saved-value validation, and styling. The production audit reported no known
vulnerabilities. The integrated production build is 186,626 Brotli bytes of JavaScript.

Downshift 9.4.0 is MIT licensed and supports React 19. Its hooks cover selection and keyboard state, but
the application would still have to compose most of the multi-value chip, listbox, focus, and ARIA
contract. That leaves too much generic control behaviour in Job Radar.

React Aria Components 1.20.0 is Apache-2.0 licensed and supports React 19. Its ComboBox has strong
accessibility primitives, but the multi-value chip contract needs more application-owned composition than
Base UI. The extra composition does not close a Job Radar domain gap.

## Decision

Use `@base-ui/react` 1.7.0 through its public Combobox API. Keep the Job Radar boundary limited to request
mapping, remote catalogue lookup, persisted invalid values, and design-system styling. Do not add a second
combobox abstraction or copy the package's selection and keyboard logic.

The aggregate JavaScript budget is recalibrated to 215 kB from the measured 186,626-byte production
build. This leaves 28,374 bytes of headroom. The CSS budget remains 14 kB.

Sources: [Base UI Combobox](https://base-ui.com/react/components/combobox),
[Base UI 1.7.0 release](https://github.com/mui/base-ui/releases/tag/v1.7.0),
[Base UI licence](https://github.com/mui/base-ui/blob/master/LICENSE), and
[Base UI security policy](https://github.com/mui/base-ui/blob/master/SECURITY.md).
