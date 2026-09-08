import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CSSProperties, ReactNode } from "react";

/**
 * Every published token appears here by name. `tests/architecture/design-system-packages.test.ts`
 * treats this gallery as a token's consumer of record, so a token added to the theme without an
 * entry below fails the repository gate rather than shipping undocumented.
 */
const surfaceRoles = [
  ["Canvas", "--jr-color-canvas", "The page behind everything"],
  ["Surface subtle", "--jr-color-surface-subtle", "One step in from the canvas"],
  ["Surface", "--jr-color-surface", "Cards, panels, rows"],
  ["Surface hover", "--jr-color-surface-hover", "The same region under the pointer"],
] as const;

const inkRoles = [
  ["Text", "--jr-color-text", "Default"],
  ["Text muted", "--jr-color-text-muted", "Secondary copy"],
  ["Text subtle", "--jr-color-text-subtle", "Labels and metadata"],
  ["Disabled text", "--jr-color-disabled-text", "Unavailable controls"],
] as const;

const lineRoles = [
  ["Border", "--jr-color-border", "Hairline, decorative"],
  ["Border strong", "--jr-color-border-strong", "Control boundaries, 3:1"],
  ["Focus ring", "--jr-color-focus-ring", "2px ring on :focus-visible"],
  ["Focus halo", "--jr-color-focus-halo", "The wash behind the ring"],
] as const;

const accentRoles = [
  ["Accent", "--jr-color-accent", "The single accent"],
  ["Accent strong", "--jr-color-accent-strong", "Pressed and hovered accent"],
  ["Accent subtle", "--jr-color-accent-subtle", "Accent as a background tint"],
  ["Accent border", "--jr-color-accent-border", "Edge of an accent region"],
  ["Text on accent", "--jr-color-text-on-accent", "Label over accent"],
  ["Action", "--jr-color-action", "Primary action, aliases accent"],
  ["Action hover", "--jr-color-action-hover", "Primary action under the pointer"],
  ["Text on action", "--jr-color-text-on-action", "Label over an action"],
] as const;

const statusRoles = [
  ["Success", "--jr-color-success", "--jr-color-success-subtle", "--jr-color-success-border"],
  ["Danger", "--jr-color-danger", "--jr-color-danger-subtle", "--jr-color-border-strong"],
  ["Warning", "--jr-color-warning-text", "--jr-color-warning-subtle", "--jr-color-warning-border"],
  ["Info", "--jr-color-text", "--jr-color-info-subtle", "--jr-color-border-strong"],
] as const;

const overlayRoles = [
  ["Overlay surface", "--jr-color-overlay-surface", "Translucent panel over content"],
  ["Overlay border", "--jr-color-overlay-border", "Its edge"],
  ["Overlay scrim", "--jr-color-overlay-scrim", "Behind a modal"],
  ["Disabled surface", "--jr-color-disabled-surface", "An unavailable control"],
] as const;

const typeScale = [
  ["Display", "--jr-font-size-display", "--jr-line-height-display", "--jr-font-weight-light"],
  ["Heading", "--jr-font-size-heading", "--jr-line-height-heading", "--jr-font-weight-semibold"],
  ["Title", "--jr-font-size-title", "--jr-line-height-title", "--jr-font-weight-medium"],
  ["Lead", "--jr-font-size-lg", "--jr-line-height-lg", "--jr-font-weight-regular"],
  ["Body", "--jr-font-size-body", "--jr-line-height-body", "--jr-font-weight-regular"],
  ["Small", "--jr-font-size-sm", "--jr-line-height-sm", "--jr-font-weight-regular"],
  ["Caption", "--jr-font-size-caption", "--jr-line-height-caption", "--jr-font-weight-medium"],
] as const;

const families = [
  ["Interface", "--jr-font-family-ui"],
  ["Display", "--jr-font-family-display"],
  ["Monospace", "--jr-font-family-mono"],
] as const;

const weights = [
  ["Light", "--jr-font-weight-light", "Display sizes only"],
  ["Regular", "--jr-font-weight-regular", "Body default"],
  ["Medium", "--jr-font-weight-medium", "Emphasis and labels"],
  ["Semibold", "--jr-font-weight-semibold", "Titles"],
] as const;

const spaceSteps = [
  "--jr-space-0",
  "--jr-space-1",
  "--jr-space-2",
  "--jr-space-3",
  "--jr-space-4",
  "--jr-space-5",
  "--jr-space-6",
  "--jr-space-7",
  "--jr-space-8",
] as const;

const radii = [
  ["--jr-radius-none", "Controls inside a dense surface, where a corner would break the column"],
  ["--jr-radius-xs", "Chips and inline marks"],
  ["--jr-radius-sm", "Nested elements"],
  ["--jr-radius-md", "Controls"],
  ["--jr-radius-lg", "Cards"],
  ["--jr-radius-xl", "Panels and sheets"],
  ["--jr-radius-pill", "Badges and filters, never buttons"],
] as const;

const elevations = [["--jr-shadow-overlay", "Modals, popovers, toasts"]] as const;

const durations = [
  ["--jr-motion-duration-instant", "Colour and state change"],
  ["--jr-motion-duration-fast", "Button press, tooltip"],
  ["--jr-motion-duration-base", "Dropdown, select, popover"],
  ["--jr-motion-duration-slow", "Modal, drawer"],
] as const;

const transformDurations = [
  ["--jr-motion-transform-fast", "Movement at the fast duration"],
  ["--jr-motion-transform-base", "Movement at the base duration"],
] as const;

const transformDistance = [
  ["--jr-motion-transform-distance", "How far an entrance or exit travels"],
] as const;

const curves = [
  ["--jr-ease-out", "Entrances and exits"],
  ["--jr-ease-in-out", "On-screen movement"],
  ["--jr-ease-drawer", "Drawers and sheets"],
] as const;

const metrics = [
  ["--jr-size-control-indicator", "Checkbox and radio boxes"],
  ["--jr-control-height-sm", "Compact control"],
  ["--jr-control-height-md", "Default control, meets the 44px target"],
  ["--jr-control-width-touch", "Utility control width on narrow screens"],
  ["--jr-control-height-touch", "Utility control height on narrow screens"],
  ["--jr-bar-height", "A full-width bar, and the space a page reserves for it"],
  ["--jr-masthead-height", "The masthead, and the scroll clearance it needs"],
  ["--jr-content-width", "Maximum content measure"],
  ["--jr-border-width", "The one border width"],
  ["--jr-focus-width", "The focus ring, which is thicker than a border on purpose"],
  ["--jr-opacity-disabled", "Applied to an unavailable control"],
] as const;

const layers = [
  ["--jr-z-raised", "An element that must clear the content it sits on"],
  ["--jr-z-sticky", "Page furniture that stays put while content scrolls"],
  ["--jr-z-header", "Masthead"],
  ["--jr-z-dropdown", "Menus"],
  ["--jr-z-popover", "Popovers and tooltips"],
  ["--jr-z-modal-overlay", "Modal scrim"],
  ["--jr-z-modal", "Modal panel"],
  ["--jr-z-toast", "Toasts, above everything"],
  ["--jr-z-skip-link", "The skip link, which must clear even a toast"],
] as const;

const meta = {
  title: "Design system/Tokens",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Colour: Story = {
  render: () => (
    <Page
      title="Colour"
      lead="Four neutral surfaces per theme separate a region by tint, so an outline is no longer the only way to divide the page. One accent carries every action."
    >
      <Section heading="Surfaces">
        <div style={swatchGrid}>
          {surfaceRoles.map(([label, token, note]) => (
            <Swatch key={token} label={label} note={note} token={token} />
          ))}
        </div>
      </Section>

      <Section heading="Ink">
        <div style={rowsStyle}>
          {inkRoles.map(([label, token, note]) => (
            <div key={token} style={inkRowStyle}>
              <span style={{ color: `var(${token})`, fontSize: "var(--jr-font-size-lg)" }}>
                {label}
              </span>
              <code style={codeStyle}>{token}</code>
              <span style={noteStyle}>{note}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section heading="Lines and focus">
        <div style={rowsStyle}>
          {lineRoles.map(([label, token, note]) => (
            <div key={token} style={inkRowStyle}>
              <span
                aria-hidden="true"
                style={{
                  height: "var(--jr-space-4)",
                  background: `var(${token})`,
                  borderRadius: "var(--jr-radius-xs)",
                }}
              />
              <code style={codeStyle}>{token}</code>
              <span style={noteStyle}>
                {label}. {note}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section heading="Accent">
        <div style={swatchGrid}>
          {accentRoles.map(([label, token, note]) => (
            <Swatch key={token} label={label} note={note} token={token} />
          ))}
        </div>
      </Section>

      <Section heading="Status">
        <div style={rowsStyle}>
          {statusRoles.map(([label, text, background, border]) => (
            <div
              key={label}
              style={{
                display: "grid",
                gap: "var(--jr-space-1)",
                padding: "var(--jr-space-3) var(--jr-space-4)",
                color: `var(${text})`,
                background: `var(${background})`,
                border: `var(--jr-border-width) solid var(${border})`,
                borderRadius: "var(--jr-radius-md)",
              }}
            >
              <strong style={{ fontWeight: "var(--jr-font-weight-medium)" }}>{label}</strong>
              <code style={codeStyle}>
                {text} on {background} inside {border}
              </code>
            </div>
          ))}
        </div>
      </Section>

      <Section heading="Overlays and unavailable states">
        <div style={swatchGrid}>
          {overlayRoles.map(([label, token, note]) => (
            <Swatch key={token} label={label} note={note} token={token} />
          ))}
        </div>
      </Section>
    </Page>
  ),
};

export const Typography: Story = {
  render: () => (
    <Page
      title="Typography"
      lead="One family at seven sizes, each set at the line height it is paired with. Regular is the body default; nothing is set below 12px."
    >
      <Section heading="Scale">
        <div style={rowsStyle}>
          {typeScale.map(([label, size, lineHeight, weight]) => (
            <div key={size} style={{ display: "grid", gap: "var(--jr-space-1)" }}>
              <p
                style={{
                  margin: 0,
                  fontSize: `var(${size})`,
                  fontWeight: `var(${weight})`,
                  lineHeight: `var(${lineHeight})`,
                }}
              >
                {label}. Recruiters shortlisted this week.
              </p>
              <code style={codeStyle}>
                {size} · {lineHeight} · {weight}
              </code>
            </div>
          ))}
        </div>
      </Section>

      <Section heading="Families">
        <div style={rowsStyle}>
          {families.map(([label, token]) => (
            <div key={token} style={inkRowStyle}>
              <span style={{ fontFamily: `var(${token})`, fontSize: "var(--jr-font-size-lg)" }}>
                {label} 0123456789
              </span>
              <code style={codeStyle}>{token}</code>
              <span style={noteStyle} />
            </div>
          ))}
        </div>
      </Section>

      <Section heading="Weights">
        <div style={rowsStyle}>
          {weights.map(([label, token, note]) => (
            <div key={token} style={inkRowStyle}>
              <span style={{ fontSize: "var(--jr-font-size-lg)", fontWeight: `var(${token})` }}>
                {label}
              </span>
              <code style={codeStyle}>{token}</code>
              <span style={noteStyle}>{note}</span>
            </div>
          ))}
        </div>
      </Section>
    </Page>
  ),
};

export const SpaceAndShape: Story = {
  name: "Space and shape",
  render: () => (
    <Page
      title="Space and shape"
      lead="One spacing scale, six radii, two elevations. Controls take the medium radius; pill is for badges and filters and never for buttons."
    >
      <Section heading="Spacing">
        <div style={rowsStyle}>
          {spaceSteps.map((token) => (
            <div key={token} style={spacingRowStyle}>
              <code style={codeStyle}>{token}</code>
              <span aria-hidden="true" style={{ ...spacingBarStyle, width: `var(${token})` }} />
            </div>
          ))}
        </div>
      </Section>

      <Section heading="Radius">
        <div style={swatchGrid}>
          {radii.map(([token, note]) => (
            <div key={token} style={{ ...cardStyle, borderRadius: `var(${token})` }}>
              <code style={codeStyle}>{token}</code>
              <span style={noteStyle}>{note}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section heading="Elevation">
        <div style={swatchGrid}>
          {elevations.map(([token, note]) => (
            <div key={token} style={{ ...cardStyle, boxShadow: `var(${token})` }}>
              <code style={codeStyle}>{token}</code>
              <span style={noteStyle}>{note}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section heading="Metrics">
        <dl style={definitionListStyle}>
          {metrics.map(([token, note]) => (
            <div key={token} style={definitionRowStyle}>
              <dt>
                <code style={codeStyle}>{token}</code>
              </dt>
              <dd style={{ margin: 0, ...noteStyle }}>{note}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section heading="Layers">
        <dl style={definitionListStyle}>
          {layers.map(([token, note]) => (
            <div key={token} style={definitionRowStyle}>
              <dt>
                <code style={codeStyle}>{token}</code>
              </dt>
              <dd style={{ margin: 0, ...noteStyle }}>{note}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </Page>
  ),
};

export const Motion: Story = {
  render: () => (
    <Page
      title="Motion"
      lead="Four durations and three named curves. Movement is timed separately from colour and opacity, so reduced motion can drop the movement and keep the fade that tells a user their action landed."
    >
      <Section heading="Durations">
        <div style={rowsStyle}>
          {durations.map(([token, note]) => (
            <div key={token} style={inkRowStyle}>
              <span
                aria-hidden="true"
                style={{
                  height: "var(--jr-space-4)",
                  background: "var(--jr-color-accent)",
                  borderRadius: "var(--jr-radius-xs)",
                  transition: `opacity var(${token}) var(--jr-ease-out)`,
                }}
              />
              <code style={codeStyle}>{token}</code>
              <span style={noteStyle}>{note}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section heading="Movement">
        <div style={rowsStyle}>
          {transformDurations.map(([token, note]) => (
            <div key={token} style={inkRowStyle}>
              <span
                aria-hidden="true"
                style={{
                  height: "var(--jr-space-4)",
                  background: "var(--jr-color-accent-subtle)",
                  border: "var(--jr-border-width) solid var(--jr-color-accent-border)",
                  borderRadius: "var(--jr-radius-xs)",
                  transition: `transform var(${token}) var(--jr-ease-out)`,
                }}
              />
              <code style={codeStyle}>{token}</code>
              <span style={noteStyle}>{note}. Zero under prefers-reduced-motion.</span>
            </div>
          ))}
        </div>
      </Section>

      <Section heading="Distance">
        <div style={rowsStyle}>
          {transformDistance.map(([token, note]) => (
            <div key={token} style={inkRowStyle}>
              <span
                aria-hidden="true"
                style={{
                  height: "var(--jr-space-4)",
                  marginLeft: `var(${token})`,
                  background: "var(--jr-color-accent-subtle)",
                  borderRadius: "var(--jr-radius-xs)",
                }}
              />
              <code style={codeStyle}>{token}</code>
              <span style={noteStyle}>{note}. Zero under prefers-reduced-motion.</span>
            </div>
          ))}
        </div>
      </Section>

      <Section heading="Curves">
        <div style={rowsStyle}>
          {curves.map(([token, note]) => (
            <div key={token} style={inkRowStyle}>
              <span
                aria-hidden="true"
                style={{
                  height: "var(--jr-space-4)",
                  background: "var(--jr-color-surface-hover)",
                  borderRadius: "var(--jr-radius-xs)",
                  transition: `transform var(--jr-motion-transform-base) var(${token})`,
                }}
              />
              <code style={codeStyle}>{token}</code>
              <span style={noteStyle}>{note}</span>
            </div>
          ))}
        </div>
      </Section>
    </Page>
  ),
};

function Page({ children, lead, title }: { children: ReactNode; lead: string; title: string }) {
  return (
    <main style={pageStyle}>
      <header style={{ display: "grid", gap: "var(--jr-space-3)" }}>
        <p style={eyebrowStyle}>Job Radar design system</p>
        <h1 style={headingStyle}>{title}</h1>
        <p style={leadStyle}>{lead}</p>
      </header>
      {children}
    </main>
  );
}

function Section({ children, heading }: { children: ReactNode; heading: string }) {
  const id = heading.toLowerCase().replaceAll(" ", "-");
  return (
    <section aria-labelledby={id} style={{ display: "grid", gap: "var(--jr-space-4)" }}>
      <h2 id={id} style={sectionHeadingStyle}>
        {heading}
      </h2>
      {children}
    </section>
  );
}

function Swatch({ label, note, token }: { label: string; note: string; token: string }) {
  return (
    <article style={cardStyle}>
      <div aria-hidden="true" style={{ ...colourStyle, background: `var(${token})` }} />
      <strong style={{ fontWeight: "var(--jr-font-weight-medium)" }}>{label}</strong>
      <code style={codeStyle}>{token}</code>
      <span style={noteStyle}>{note}</span>
    </article>
  );
}

const pageStyle: CSSProperties = {
  display: "grid",
  gap: "var(--jr-space-7)",
  minHeight: "100vh",
  padding: "var(--jr-space-7)",
  color: "var(--jr-color-text)",
  background: "var(--jr-color-canvas)",
  fontFamily: "var(--jr-font-family-ui)",
  fontSize: "var(--jr-font-size-body)",
  fontWeight: "var(--jr-font-weight-regular)",
  lineHeight: "var(--jr-line-height-body)",
};

const eyebrowStyle: CSSProperties = {
  margin: 0,
  color: "var(--jr-color-accent-strong)",
  fontFamily: "var(--jr-font-family-mono)",
  fontSize: "var(--jr-font-size-caption)",
  fontWeight: "var(--jr-font-weight-medium)",
  lineHeight: "var(--jr-line-height-caption)",
};

const headingStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--jr-font-family-display)",
  fontSize: "var(--jr-font-size-display)",
  fontWeight: "var(--jr-font-weight-light)",
  lineHeight: "var(--jr-line-height-display)",
};

const leadStyle: CSSProperties = {
  maxWidth: "44rem",
  margin: 0,
  color: "var(--jr-color-text-muted)",
  fontSize: "var(--jr-font-size-lg)",
  lineHeight: "var(--jr-line-height-lg)",
};

const sectionHeadingStyle: CSSProperties = {
  margin: 0,
  fontSize: "var(--jr-font-size-title)",
  fontWeight: "var(--jr-font-weight-medium)",
  lineHeight: "var(--jr-line-height-title)",
};

const swatchGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))",
  gap: "var(--jr-space-4)",
};

const cardStyle: CSSProperties = {
  display: "grid",
  gap: "var(--jr-space-2)",
  padding: "var(--jr-space-4)",
  background: "var(--jr-color-surface)",
  borderRadius: "var(--jr-radius-lg)",
};

const colourStyle: CSSProperties = {
  minHeight: "5rem",
  border: "var(--jr-border-width) solid var(--jr-color-border)",
  borderRadius: "var(--jr-radius-md)",
};

const codeStyle: CSSProperties = {
  color: "var(--jr-color-text-subtle)",
  fontFamily: "var(--jr-font-family-mono)",
  fontSize: "var(--jr-font-size-caption)",
  lineHeight: "var(--jr-line-height-caption)",
};

const noteStyle: CSSProperties = {
  color: "var(--jr-color-text-muted)",
  fontSize: "var(--jr-font-size-sm)",
  lineHeight: "var(--jr-line-height-sm)",
};

const rowsStyle: CSSProperties = {
  display: "grid",
  gap: "var(--jr-space-3)",
  padding: "var(--jr-space-5)",
  background: "var(--jr-color-surface-subtle)",
  borderRadius: "var(--jr-radius-xl)",
};

const inkRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(8rem, 14rem) minmax(12rem, 18rem) 1fr",
  alignItems: "center",
  gap: "var(--jr-space-4)",
};

const spacingRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "10rem 1fr",
  alignItems: "center",
  gap: "var(--jr-space-4)",
};

const spacingBarStyle: CSSProperties = {
  display: "block",
  minWidth: "var(--jr-border-width)",
  height: "var(--jr-space-3)",
  background: "var(--jr-color-accent)",
  borderRadius: "var(--jr-radius-pill)",
};

const definitionListStyle: CSSProperties = {
  display: "grid",
  gap: "var(--jr-space-2)",
  margin: 0,
  padding: "var(--jr-space-5)",
  background: "var(--jr-color-surface-subtle)",
  borderRadius: "var(--jr-radius-xl)",
};

const definitionRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(12rem, 20rem) 1fr",
  gap: "var(--jr-space-4)",
};
