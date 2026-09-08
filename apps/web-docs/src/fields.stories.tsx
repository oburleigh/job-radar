import {
  Checkbox,
  Combobox,
  RadioGroup,
  SearchField,
  SelectField,
  TextField,
  TokenAutocomplete,
} from "@job-radar/design-ui";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";

const meta = {
  title: "Design system/Fields",
  parameters: { layout: "padded" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const options = [
  { label: "Greater London", value: "london" },
  { label: "West Midlands", value: "midlands" },
  { label: "Greater Manchester", value: "manchester" },
];

function MixedFields({ disabled = false, invalid = false }) {
  const [market, setMarket] = useState("");
  const [markets, setMarkets] = useState<readonly string[]>([]);
  const [remote, setRemote] = useState(false);
  const [scope, setScope] = useState("all");
  const hint = "Choose the criteria for this example.";
  const error = invalid ? "Review this value before continuing." : undefined;
  return (
    <div style={{ display: "grid", gap: "var(--jr-space-6)" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 12rem), 1fr))",
          gap: "var(--jr-space-4)",
          alignItems: "start",
        }}
      >
        <TextField disabled={disabled} error={error} hint={hint} id="mixed-name" label="Name" />
        <SearchField disabled={disabled} id="mixed-search" label="Search" />
        <TextField
          disabled={disabled}
          {...(error ? { error } : {})}
          hint={hint}
          id="mixed-number"
          label="Maximum age"
          type="number"
          suffix="days"
        />
        <SelectField
          disabled={disabled}
          {...(error ? { error } : {})}
          hint={hint}
          id="mixed-select"
          label="Cadence"
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </SelectField>
        <Combobox
          disabled={disabled}
          {...(error ? { error } : {})}
          hint={hint}
          id="mixed-combobox"
          label="Market"
          name="market"
          onChange={setMarket}
          options={options}
          value={market}
        />
        <TokenAutocomplete
          disabled={disabled}
          {...(error ? { error } : {})}
          hint={hint}
          id="mixed-tokens"
          label="Markets"
          name="markets"
          onChange={setMarkets}
          options={options}
          values={markets}
        />
      </div>
      <Checkbox
        checked={remote}
        description="Accept location-agnostic remote jobs, including a description long enough to wrap on a phone."
        disabled={disabled}
        id="mixed-checkbox"
        label="Include remote roles"
        onChange={(event) => setRemote(event.currentTarget.checked)}
      />
      <RadioGroup
        id="mixed-radio"
        legend="Search scope"
        name="scope"
        onChange={setScope}
        options={[
          { label: "Every record", value: "all" },
          {
            label: "Matching records",
            description: "Only include records matching every selected criterion.",
            value: "matching",
          },
        ]}
        value={scope}
      />
      <output aria-label="Selected criteria">
        {remote ? "Remote included" : "Remote excluded"}; {scope}; {market || "No market"};{" "}
        {markets.join(", ") || "No markets"}
      </output>
    </div>
  );
}

export const Mixed: Story = {
  render: () => <MixedFields />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const id of [
      "mixed-name",
      "mixed-search",
      "mixed-number",
      "mixed-select",
      "mixed-combobox",
      "mixed-tokens",
    ]) {
      const control = canvasElement.querySelector(`#${id}`);
      if (!control) throw new Error(`Missing field ${id}`);
      const surface = control.closest(".jr-token-autocomplete-input, .jr-search-field") ?? control;
      expect(surface.getBoundingClientRect().height).toBe(44);
      expect(getComputedStyle(control).fontSize).toBe("16px");
    }
    const matching = canvas.getByRole("radio", { name: "Matching records" });
    const row = matching.closest("label");
    if (!row) throw new Error("The radio needs its full-row label.");
    expect(row.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(matching.getBoundingClientRect().width).toBe(18);
    await userEvent.click(row);
    await expect(matching).toBeChecked();
    await userEvent.keyboard("{ArrowUp}");
    await expect(canvas.getByRole("radio", { name: "Every record" })).toBeChecked();
    await userEvent.click(
      canvas.getByText("Only include records matching every selected criterion."),
    );
    await expect(matching).toBeChecked();
  },
};
export const Invalid: Story = { render: () => <MixedFields invalid /> };
export const Disabled: Story = { render: () => <MixedFields disabled /> };
