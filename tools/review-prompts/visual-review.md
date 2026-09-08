# Visual Review Prompt

Review the rendered screenshots named in the request. Lead with findings. Do not
summarise the product, do not describe what each page contains, and do not open
with what looks good.

You are looking at pictures of a real interface. Judge what is on the screen.
Where a finding depends on a number you cannot read off the image, say so and
name the measurement that would settle it, rather than guessing at a value.

For each finding:

- severity: `BLOCK`, `WARN` or `NOTE`
- the screenshot filename, which encodes route, viewport and theme
- where on the page, in words a person can find without coordinates
- what is wrong, stated as the observation before the diagnosis
- why a user notices it
- the smallest practical fix

`BLOCK` is for anything a user would read as broken or unfinished: text that
collides or truncates, a control with no visible affordance, a number that
contradicts another number on the same screen, an element outside its container,
an unreadable contrast pairing. `WARN` is inconsistency a user feels without
naming, which is most alignment and provenance drift. `NOTE` is refinement.

**Report the same defect once, at its class, not once per instance.** Sixteen
cards with the same wrong inset is one finding naming the class and its extent,
not sixteen findings.

## What this product is

Job Radar is a local, single-user React Router application backed by SQLite. It
finds job opportunities and recruitment firms, ranks them against a profile or
search brief, and keeps the evidence behind every result. It runs on one
person's machine against their own data, and that person is the only user. There
is no marketing surface and no onboarding funnel. Density and legibility beat
delight.

## What you are given

Screenshots live in `artifacts/audit/screens/`. Filenames are:

```
<route-slug>__<viewport>__<theme>__<kind>.png
```

- `viewport` is `desktop` (1440x1000) or `mobile` (390x844)
- `theme` is `light` or `dark`
- `kind` is `viewport` (above the fold), `full` (whole document), or
  `crop-left` (the left 760px of the top 900px, for judging the page column)

Beside them, `<stem>__edges.json` lists every distinct left edge of the visible
text-bearing blocks inside `main`, with up to three example elements per edge.
Use it to state alignment findings in exact pixels rather than impressions.

## What is already enforced in code, so do not spend effort on it

`tests/architecture/design-system-packages.test.ts` fails the build on any of
these appearing in `packages/design-ui/src/styles.css` or either product
stylesheet:

- raw colour of any kind: hex, `rgb`, `rgba`, `hsl`, `hsla`, `oklch`
- direct access to `var(--jr-palette-*)`, bypassing the semantic layer
- `font-size` in `px` or `rem`
- `!important`
- `color-scheme`
- any custom property not prefixed `--jr-`
- a native `<button>` element in a presentation or composition layer

`oklch` is used deliberately at the token layer in
`packages/design-tokens/src/theme.css` and is correct there. Do not report it.

Colour and type size are therefore not your remit unless a rendered pairing is
actually wrong on screen, for example unreadable contrast or a semantic token
used for the wrong meaning.

## What is not enforced, and is your remit

None of these have any gate. Every defect found in this product so far has been
in this list.

- horizontal alignment and the existence of a single page column
- spacing values, against the nine-step scale `--jr-space-0`..`-8`
  (`0, 4, 8, 12, 16, 24, 32, 48, 64`px)
- border radius, against `--jr-radius-sm`, `-md`, `-pill`
- border presence, weight and colour between sibling elements
- `font-weight`, against `--jr-font-weight-medium`, `-semibold`, `-bold`
- `line-height`, against `--jr-line-height-tight`, `-body`
- elevation, against `--jr-shadow-overlay`
- stacking, against the six `--jr-z-*` layers
- icon sizing and optical alignment
- affordance: whether a control looks like a control
- hierarchy: whether the most important thing on the page reads first
- density and rhythm: whether vertical spacing groups related things
- copy: whether labels say what the thing does
- theme parity: whether light and dark carry the same meaning and emphasis
- responsive behaviour between 1440 and 390

## Known defect classes

Each entry was confirmed on screen. Check every one on every route you are given,
and say explicitly which ones you checked and did not find, so a silent pass is
distinguishable from an unchecked one.

### V1. The page has more than one left edge

Blocks each choose their own inset instead of sharing a column. Measured
2026-09-05 on the tree at `db6d0eb`: `/` had six distinct left edges under 140px
(36, 49, 51, 53, 69, 121); `/runs/1` had five inside a 21px band (37, 40, 51,
55, 58); `/recruiter-search` had two and is the reference. Report the count and
the values.

### V2. The page title does not align with the page

`.jr-page-title-block` adds `var(--jr-space-6)` of horizontal padding inside an
already-inset card, so every `h1` sits 32px right of every heading below it. The
edge `69` on a route whose card starts at `36` is this defect.

### V3. Edges a few pixels apart

Two edges 3px apart read as a mistake where 32px reads as a decision. `49` beside
`51` beside `53` on one page is worse than either being wrong alone.

### V4. The page column moves between routes

`/profiles` starts at 55 while most routes start at 36, so content shifts
sideways during navigation. Compare the smallest edge across every route given.

### V5. Off-scale spacing

Measured 2026-09-05: the discovery stylesheet used 175 raw pixel spacing values
of which 131, 75%, were not on the token scale. The most common value in both
product stylesheets was `18px`, which the scale does not contain, followed by a
cluster of `10, 11, 13, 14, 15px` sitting just under `16`. Off-scale spacing is
what produces V1 and V3, so report it where a gap looks arbitrary.

### V6. Icon-only controls disagree within a row

Controls sitting in one row must agree on border, radius and fill for equivalent
interaction states. The former masthead mixed 4px button radii with square links.
Corrected 2026-09-08: masthead actions and links share the Button utility variant;
browser geometry checks cover their agreement.

### V7. Icon-only controls with no tooltip

A control showing only a glyph gives a sighted reader nothing. An accessible name
satisfies a screen reader and leaves that reader guessing. What matters is that
controls in one group agree.

Corrected 2026-09-05 after review disproved the original claim. On `/profiles`
the three delete controls use the shared tooltip component; the three clone
controls beside them are raw `Link` elements carrying `className="jr-icon-button"`
and a native `title` (`profiles.tsx:132-139`). So the group is inconsistent rather
than uniformly untooltipped. A predicate testing only for
`data-base-ui-tooltip-trigger` reports the native-title controls as having no
tooltip at all, which overstates it. Judge the group's agreement, and name the
mechanism each control uses.

### V8. A total contradicted by its parts

Measured on `/`: a strip reading `24 active listings excluded` beside
`TITLE 8 · LOCATION 8 · STALE 4 · UNVERIFIED 4 · CONTEXT 4`, which sum to 28.
Add up every set of numbers that claims to decompose a total.

### V9. Two numbers in one sentence with different scopes

A filtered count standing beside an unfiltered one is read as one scope. A
registry header read `N firms · M recruiters · K removed` where the first two
honoured the active filter and the third counted the whole directory.

### V10. An unbounded list

Corrected 2026-09-05 after review disproved half the original claim.
`/settings/adapters/source-coverage` renders two lists: `CompanySitesTable`
(`sources.tsx:141`) which **is** virtualised through `TableVirtuoso`, and
`<ol className="source-grid">` (`sources.tsx:106`) which maps every source domain
with no bound at all. Because `TableVirtuoso` scrolls the window, the document
stays tall while the DOM stays bounded, so **document height is not evidence of an
unbounded DOM**. The 73,938px figure on ADM-366 does not establish the defect that
ticket describes.

Judge whether a list has a bound, and say which mechanism bounds it. Fixture data
hides the scale, so do not conclude from a short capture that a list is bounded.

## Adding to this list

When you confirm a defect this prompt did not tell you to look for, say so
explicitly under a heading `UNPROMPTED`, and state it as a class with the
observation that revealed it. Those entries are what get appended here, and a
reviewer that finds nothing unprompted has either a clean tree or a prompt that
has stopped growing.

## What not to do

- Do not invent a measurement. Read it from `edges.json` or say it is unmeasured.
- Do not report a colour, `font-size` or `!important` finding. Those are gated.
- Do not propose a redesign. This is a review of what is there.
- Do not soften a finding to be agreeable, and do not pad the list to look
  thorough. A short accurate list beats a long speculative one.
