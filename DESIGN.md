---
name: Job Radar
description: A contemporary opportunity catalogue for private job-search work.
colors:
  bone-canvas: "#f4f3ee"
  paper: "#ffffff"
  paper-alt: "#f9fafb"
  navy-ink: "#0b1739"
  muted-ink: "#536078"
  faint-ink: "#778196"
  catalogue-cobalt: "#1557e8"
  deep-cobalt: "#0c3da8"
  cobalt-wash: "#e8f0ff"
  action-persimmon: "#ef4b24"
  deep-persimmon: "#c93617"
  evidence-cyan: "#e9f7fb"
  review-yellow: "#fff4bd"
  positive-green: "#237a42"
  positive-wash: "#e9f7ed"
  danger-red: "#b42318"
  danger-wash: "#fff0ed"
  rule: "#d3d8e0"
  rule-strong: "#8d98aa"
  dark-canvas: "#070b16"
  dark-paper: "#0f1730"
  dark-paper-alt: "#141e3b"
  dark-ink: "#f3f6ff"
  dark-muted-ink: "#b3bed5"
  dark-cobalt: "#4e7ff2"
  dark-persimmon: "#ff6745"
  dark-rule: "#2c3857"
typography:
  display:
    fontFamily: '"Barlow Condensed", "Arial Narrow", sans-serif'
    fontSize: "clamp(34px, 4vw, 58px)"
    fontWeight: 800
    lineHeight: 0.92
    letterSpacing: "-0.035em"
  mobile-display:
    fontFamily: '"Barlow Condensed", "Arial Narrow", sans-serif'
    fontSize: "clamp(32px, 10vw, 48px)"
    fontWeight: 800
    lineHeight: 0.94
    letterSpacing: "-0.035em"
  editor-title:
    fontFamily: '"Barlow Condensed", "Arial Narrow", sans-serif'
    fontSize: "31px"
    fontWeight: 800
    lineHeight: 1
  count:
    fontFamily: '"Barlow Condensed", "Arial Narrow", sans-serif'
    fontSize: "29px"
    fontWeight: 800
    lineHeight: 1
  section:
    fontFamily: '"Barlow Condensed", "Arial Narrow", sans-serif'
    fontSize: "27px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.02em"
  brand:
    fontFamily: '"Barlow Condensed", "Arial Narrow", sans-serif'
    fontSize: "24px"
    fontWeight: 800
    lineHeight: 1
  mobile-brand:
    fontFamily: '"Barlow Condensed", "Arial Narrow", sans-serif'
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1
  subsection:
    fontFamily: '"Barlow Condensed", "Arial Narrow", sans-serif'
    fontSize: "21px"
    fontWeight: 800
    lineHeight: 1
  score:
    fontFamily: '"Barlow Condensed", "Arial Narrow", sans-serif'
    fontSize: "20px"
    fontWeight: 800
    lineHeight: 1
  navigation:
    fontFamily: '"Barlow Condensed", "Arial Narrow", sans-serif'
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1
  title:
    fontFamily: '"Segoe UI", Tahoma, Arial, sans-serif'
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: '"Segoe UI", Tahoma, Arial, sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  supporting:
    fontFamily: '"Segoe UI", Tahoma, Arial, sans-serif'
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.55
  control:
    fontFamily: '"Segoe UI", Tahoma, Arial, sans-serif'
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.2
  small:
    fontFamily: '"Segoe UI", Tahoma, Arial, sans-serif'
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.35
  metadata:
    fontFamily: '"Cascadia Mono", "SFMono-Regular", Consolas, monospace'
    fontSize: "10px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.04em"
  compact-metadata:
    fontFamily: '"Cascadia Mono", "SFMono-Regular", Consolas, monospace'
    fontSize: "9px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.04em"
  micro:
    fontFamily: '"Cascadia Mono", "SFMono-Regular", Consolas, monospace'
    fontSize: "8px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.04em"
rounded:
  none: "0"
  control: "2px"
  soft-control: "3px"
  notice: "13px"
  circle: "50%"
spacing:
  hairline-gap: "5px"
  compact: "8px"
  control-gap: "10px"
  standard: "12px"
  record: "14px"
  section: "18px"
  panel: "20px"
  page: "26px"
  wide: "42px"
components:
  button-primary:
    backgroundColor: "{colors.action-persimmon}"
    textColor: "{colors.paper}"
    typography: "{typography.metadata}"
    rounded: "{rounded.soft-control}"
    padding: "0 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.deep-persimmon}"
    textColor: "{colors.paper}"
    rounded: "{rounded.soft-control}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.navy-ink}"
    typography: "{typography.metadata}"
    rounded: "{rounded.soft-control}"
    padding: "0 16px"
    height: "44px"
  text-field:
    backgroundColor: "{colors.paper-alt}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "44px"
  navigation-active:
    backgroundColor: "{colors.catalogue-cobalt}"
    textColor: "{colors.paper}"
    typography: "{typography.metadata}"
    rounded: "{rounded.none}"
    padding: "0 16px"
    height: "68px"
  opportunity-record:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.none}"
    padding: "15px 14px"
  status-stamp:
    backgroundColor: "{colors.positive-wash}"
    textColor: "{colors.positive-green}"
    typography: "{typography.micro}"
    rounded: "{rounded.none}"
    padding: "2px 6px"
    height: "19px"
  score-badge:
    backgroundColor: "{colors.catalogue-cobalt}"
    textColor: "{colors.paper}"
    typography: "{typography.section}"
    rounded: "{rounded.circle}"
    width: "40px"
    height: "40px"
---

# Design System: Job Radar

## Overview

**Creative North Star: "The Opportunity Catalogue"**

Job Radar borrows the clarity of a contemporary library finding aid. It feels
indexed, inspectable, and built for repeated work. Numbering, ruled records,
compact evidence fields, and a steady masthead make a large search space feel
navigable without turning it into a generic analytics dashboard.

The system is dense but not cramped. Bone paper softens long review sessions,
navy gives the catalogue authority, cobalt carries wayfinding and score, and
persimmon marks the few actions that start or change work. Light and dark modes
keep the same hierarchy; dark mode changes semantic tokens rather than changing
the product's visual grammar.

**Key Characteristics:**

- Ruled records and indexed sections in place of floating dashboard cards
- Condensed display lettering paired with practical UI and monospaced metadata
- Flat surfaces, sharp corners, and color bands that explain structure
- Cobalt wayfinding, persimmon actions, and restrained status colors
- A desktop ledger that reflows into readable stacked records on small screens

## Colors

The light palette starts with bone paper and navy ink. Dark mode shifts those
roles to near-black blue and cool white while keeping cobalt, persimmon, review,
success, and danger roles distinct.

### Primary

- **Catalogue Cobalt:** Owns active navigation, record numbering, score badges,
  and the strongest informational focus.
- **Action Persimmon:** Identifies primary actions such as starting discovery or
  saving a change. Its darker partner is the hover state.

### Secondary

- **Evidence Cyan:** Marks hovered or explanatory surfaces without competing
  with an action.
- **Review Yellow:** Groups screening summaries and visible keyboard focus.
- **Positive Green:** Confirms live listings, successful states, and applied
  decisions.
- **Danger Red:** Carries destructive actions, validation failures, and failed
  states.

### Neutral

- **Bone Canvas:** The light-mode page ground.
- **Paper and Alternate Paper:** Working surfaces and inset controls.
- **Navy, Muted, and Faint Ink:** Primary text, supporting copy, and quiet record
  metadata.
- **Rule and Strong Rule:** The structural grid. Strong rules bound a region;
  standard rules divide its contents.
- **Dark Canvas, Paper, Ink, and Rule:** Semantic dark-mode counterparts, not a
  separate brand palette.

### Named Rules

**The Two Signals Rule.** Cobalt explains where the user is; persimmon asks the
user to act. Do not swap their jobs.

**The Semantic Theme Rule.** A component consumes a role token. It never embeds
a separate light and dark literal inside its own selector.

## Typography

- **Display Font:** Barlow Condensed, locally bundled, with narrow sans-serif
  fallbacks
- **Body Font:** Segoe UI with Tahoma, Arial, and sans-serif fallbacks
- **Label/Mono Font:** Cascadia Mono with SFMono-Regular, Consolas, and monospace
  fallbacks

**Character:** Barlow Condensed gives page titles, index numbers, and section
heads the compact authority of catalogue signage. The UI stack remains neutral
for long-form scanning, while the mono stack separates evidence labels and
machine-facing values from prose.

### Hierarchy

- **Display** (800, fluid 34px to 58px, 0.92): One page thesis per screen.
- **Mobile Display** (800, fluid 32px to 48px, 0.94): The page thesis below
  500px.
- **Editor Title** (800, 31px, 1): Profile and settings workbench titles.
- **Count** (800, 29px, 1): Prominent totals beside a catalogue heading.
- **Section** (800, 27px, 1): Catalogue headings, counts, and major work areas.
- **Brand** (800, 24px desktop and 22px mobile, 1): Product identity in the
  masthead.
- **Subsection** (800, 21px, 1): Filter indexes and nested work areas.
- **Score** (800, 20px, 1): Compact match scores and screening totals.
- **Navigation** (700, 16px, 1): Desktop route labels.
- **Title** (700, 15px, 1.25): Job titles and record-level anchors.
- **Body** (400, 14px, 1.45): Instructions, descriptions, and form help.
- **Supporting** (400, 13px, 1.55): Page descriptions and explanatory copy.
- **Control** (700, 12px, 1.2): Buttons, select values, and compact actions.
- **Small** (400, 11px, 1.35): Company names and secondary record values.
- **Metadata** (700, 10px, tracked): Operational labels, state, and compact
  evidence.
- **Compact Metadata** (700, 9px, tracked): Field labels and record facts.
- **Micro** (700, 8px, tracked): Stamps and terse supporting labels only.

### Named Rules

**The Three Voices Rule.** Condensed type names and numbers, UI type explains,
and mono type labels evidence. Keep each voice in its lane.

**The Metadata Test.** Uppercase mono text must identify real state, a field, or
an index. It is not a decorative preheading.

## Layout

The desktop shell uses a full-width horizontal masthead over a centred working
area capped at 1580px. Page regions align to one catalogue grid and are divided
by rules rather than independent card margins. The opportunity record preserves
a fixed index, flexible title and evidence columns, score, and action rail.

At 1240px, navigation shortens and secondary masthead copy disappears. At
980px, wide workbench grids collapse and the local-workspace label is removed.
At 760px, primary navigation becomes a fixed bottom bar, page regions stack,
and records become single-column reading sequences. Every screen remains usable
at 320px.

Spacing uses small, repeatable intervals. Five to fourteen pixels control
metadata and record internals; eighteen to twenty-six pixels separate regions;
the widest 42px step belongs to desktop page edges and major breathing room.

**The One Ledger Rule.** Adjacent records share a frame and dividers. Do not
turn each row into a detached card.

## Elevation & Depth

The system is flat by default. Paper tone, cobalt bands, and one-pixel rules do
the structural work. Persistent cards do not float. Only transient discovery
notices use a soft ambient shadow so they remain legible above the catalogue.

### Shadow Vocabulary

- **Transient Notice:** A soft 12px by 30px shadow tinted with the navy overlay
  token. Use it only for fixed status and completion messages.
- **Focus Ring:** A yellow outer ring with a one-pixel cobalt edge. It indicates
  keyboard focus, not elevation.

**The Flat Evidence Rule.** If a surface is part of the catalogue, separate it
with tone or a rule. Reserve shadow for content that temporarily sits above the
catalogue.

## Shapes

Controls are square to lightly softened: fields and icon actions use 2px
corners, primary and secondary buttons use 3px corners, and catalogue panels
remain square. Circular geometry is reserved for the radar mark, status dot,
and numeric score. The 13px notice radius belongs only to transient overlays.

**The Earned Circle Rule.** A circle carries a compact signal or identity mark.
It is never a general container shape.

## Components

### Buttons

- **Shape:** A compact rectangular control with a 44px minimum height and a 3px
  corner.
- **Primary:** Persimmon fill, white text, and a darker persimmon border. Hover
  deepens the fill without moving the control.
- **Secondary:** Paper fill, navy text, and a strong rule. Hover changes the
  text and border to cobalt.
- **Focus:** Every variant uses the shared yellow and cobalt focus ring.

### Chips

- **Style:** Status stamps are bordered rectangles, not pills. Mono uppercase
  text sits on a semantic wash with a matching border.
- **State:** Green means verified or successful; cobalt means an informational
  lead; neutral paper identifies an ATS or ordinary attribute.

### Cards / Containers

- **Corner Style:** Square.
- **Background:** Paper over the bone canvas; alternate paper is reserved for
  inset evidence and controls.
- **Shadow Strategy:** None at rest.
- **Border:** A strong outer frame with standard internal rules.
- **Internal Padding:** Usually 14px to 20px, reduced for compact metadata.

### Inputs / Fields

- **Style:** Alternate-paper fill, one-pixel rule, 2px corner, and a 44px target.
- **Focus:** Shared visible focus ring plus the native insertion cursor or
  selected value.
- **Error / Disabled:** Danger color for errors; disabled controls keep their
  form but reduce opacity and show a waiting cursor during mutations.

### Navigation

The desktop masthead is a dark horizontal index. Each destination includes a
number and condensed label; the active route becomes a cobalt band. Below
760px, the same destinations become an icon-and-label bottom bar while the
brand and theme control remain at the top.

### Opportunity Record

An opportunity is one ruled evidence row: sequence number, listing identity,
location and salary facts, role attributes, a match explanation, score, and
decision controls. Unknown facts stay visible as plain language such as
"Not specified" rather than disappearing from the row.

## Do's and Don'ts

### Do:

- **Do** use semantic tokens so light, dark, and system themes stay equivalent.
- **Do** keep evidence, score, source, and decision controls visible in the same
  record.
- **Do** use rules and shared alignment to manage dense information.
- **Do** preserve 44px controls and visible keyboard focus.
- **Do** use Lucide icons with accessible text or labels.

### Don't:

- **Don't** introduce floating dashboard cards, large radii, or decorative
  gradients.
- **Don't** use persimmon for passive information or cobalt for destructive
  actions.
- **Don't** hide an unknown salary, date, company, or location to make a record
  look cleaner.
- **Don't** add decorative uppercase preheadings that carry no state, index, or
  field meaning.
- **Don't** imitate paper texture, stamps, or physical depth with ornamental CSS.
