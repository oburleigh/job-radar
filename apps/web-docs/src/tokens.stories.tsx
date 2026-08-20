import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CSSProperties } from "react";

const colourRoles = [
  ["Canvas", "--jr-color-canvas"],
  ["Surface", "--jr-color-surface"],
  ["Surface subtle", "--jr-color-surface-subtle"],
  ["Text", "--jr-color-text"],
  ["Text muted", "--jr-color-text-muted"],
  ["Accent", "--jr-color-accent"],
  ["Action", "--jr-color-action"],
  ["Success", "--jr-color-success"],
  ["Warning", "--jr-color-warning-subtle"],
  ["Danger", "--jr-color-danger"],
] as const;

const spacing = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;

const meta = {
  title: "Design system/Tokens",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Foundation: Story = {
  render: () => (
    <main style={pageStyle}>
      <header>
        <p style={eyebrowStyle}>Job Radar design system</p>
        <h1 style={headingStyle}>Foundation tokens</h1>
        <p style={bodyStyle}>
          Semantic roles resolve through the active light, dark, or system colour scheme.
        </p>
      </header>

      <section aria-labelledby="colour-tokens">
        <h2 id="colour-tokens" style={sectionHeadingStyle}>
          Colour roles
        </h2>
        <div style={swatchGridStyle}>
          {colourRoles.map(([label, token]) => (
            <article key={token} style={swatchStyle}>
              <div aria-hidden="true" style={{ ...colourStyle, background: `var(${token})` }} />
              <strong>{label}</strong>
              <code style={codeStyle}>{token}</code>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="type-tokens">
        <h2 id="type-tokens" style={sectionHeadingStyle}>
          Typography
        </h2>
        <div style={typeGridStyle}>
          <p style={{ ...displaySampleStyle, fontFamily: "var(--jr-font-family-display)" }}>
            Display type
          </p>
          <p style={{ ...bodyStyle, fontFamily: "var(--jr-font-family-ui)" }}>
            Interface type keeps controls and body copy readable at compact sizes.
          </p>
          <code style={{ ...codeStyle, fontFamily: "var(--jr-font-family-mono)" }}>
            Monospace metadata 0123456789
          </code>
        </div>
      </section>

      <section aria-labelledby="spacing-tokens">
        <h2 id="spacing-tokens" style={sectionHeadingStyle}>
          Spacing scale
        </h2>
        <div style={spacingGridStyle}>
          {spacing.map((step) => (
            <div key={step} style={spacingRowStyle}>
              <code style={codeStyle}>--jr-space-{step}</code>
              <span
                aria-hidden="true"
                style={{ ...spacingBarStyle, width: `var(--jr-space-${step})` }}
              />
            </div>
          ))}
        </div>
      </section>
    </main>
  ),
};

const pageStyle: CSSProperties = {
  display: "grid",
  gap: "var(--jr-space-7)",
  minHeight: "100vh",
  padding: "var(--jr-space-7)",
  color: "var(--jr-color-text)",
  background: "var(--jr-color-canvas)",
  fontFamily: "var(--jr-font-family-ui)",
};

const eyebrowStyle: CSSProperties = {
  margin: 0,
  color: "var(--jr-color-accent-strong)",
  fontFamily: "var(--jr-font-family-mono)",
  fontSize: "var(--jr-font-size-sm)",
  fontWeight: "var(--jr-font-weight-bold)",
  textTransform: "uppercase",
};

const headingStyle: CSSProperties = {
  margin: "var(--jr-space-2) 0",
  fontFamily: "var(--jr-font-family-display)",
  fontSize: "clamp(3rem, 8vw, 6rem)",
  lineHeight: "var(--jr-line-height-tight)",
  textTransform: "uppercase",
};

const sectionHeadingStyle: CSSProperties = {
  margin: "0 0 var(--jr-space-4)",
  fontFamily: "var(--jr-font-family-display)",
  fontSize: "var(--jr-font-size-2xl)",
  textTransform: "uppercase",
};

const bodyStyle: CSSProperties = {
  maxWidth: "44rem",
  margin: 0,
  color: "var(--jr-color-text-muted)",
  lineHeight: "var(--jr-line-height-body)",
};

const swatchGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))",
  gap: "var(--jr-space-4)",
};

const swatchStyle: CSSProperties = {
  display: "grid",
  gap: "var(--jr-space-2)",
  padding: "var(--jr-space-3)",
  background: "var(--jr-color-surface)",
  border: "var(--jr-border-width) solid var(--jr-color-border)",
  borderRadius: "var(--jr-radius-md)",
};

const colourStyle: CSSProperties = {
  minHeight: "6rem",
  border: "var(--jr-border-width) solid var(--jr-color-border)",
  borderRadius: "var(--jr-radius-sm)",
};

const codeStyle: CSSProperties = {
  color: "var(--jr-color-text-muted)",
  fontFamily: "var(--jr-font-family-mono)",
  fontSize: "var(--jr-font-size-xs)",
};

const typeGridStyle: CSSProperties = {
  display: "grid",
  gap: "var(--jr-space-4)",
  padding: "var(--jr-space-5)",
  background: "var(--jr-color-surface)",
  border: "var(--jr-border-width) solid var(--jr-color-border)",
};

const displaySampleStyle: CSSProperties = {
  margin: 0,
  fontSize: "clamp(2rem, 5vw, 4rem)",
  fontWeight: 800,
  lineHeight: "var(--jr-line-height-tight)",
  textTransform: "uppercase",
};

const spacingGridStyle: CSSProperties = {
  display: "grid",
  gap: "var(--jr-space-3)",
};

const spacingRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "10rem 1fr",
  alignItems: "center",
  gap: "var(--jr-space-4)",
};

const spacingBarStyle: CSSProperties = {
  display: "block",
  minWidth: "var(--jr-border-width-strong)",
  height: "var(--jr-space-3)",
  background: "var(--jr-color-accent)",
};
