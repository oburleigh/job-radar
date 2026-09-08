import {
  Button,
  Card,
  Checkbox,
  Combobox,
  ControlRow,
  IconButton,
  Modal,
  NotificationBadge,
  PageHeader,
  Panel,
  RadioGroup,
  SearchField,
  SectionHeader,
  SelectField,
  Skeleton,
  Switch,
  TabNavigation,
  TextArea,
  TextField,
  TokenAutocomplete,
  Tooltip,
} from "@job-radar/design-ui";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

const meta = {
  title: "Design system/Components",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Buttons: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "1rem" }}>
      <Button variant="primary">Primary</Button>
      <Button>Secondary</Button>
      <Button variant="danger">Danger</Button>
      <Button variant="utility">Utility</Button>
      <Button busy>Saving</Button>
      <IconButton label="Dismiss example">×</IconButton>
      <IconButton label="Delete example" variant="danger">
        ×
      </IconButton>
    </div>
  ),
};

export const FormControls: Story = {
  render: () => (
    <div style={{ display: "grid", gap: "1rem", width: "22rem" }}>
      <TextField id="example" label="Label" hint="Helpful supporting text" />
      <TextField id="error" label="Invalid field" error="Explain how to fix this value" />
      <TokenAutocomplete
        label="Markets"
        name="markets"
        onChange={() => undefined}
        options={[
          { label: "Greater London", value: "greater-london" },
          { label: "West Midlands", value: "west-midlands" },
        ]}
        values={["greater-london"]}
      />
      <Switch checked label="Enabled" />
      <Switch checked={false} label="Disabled" />
    </div>
  ),
};

export const Loading: Story = {
  render: () => (
    <div style={{ display: "grid", gap: "0.75rem", width: "22rem" }}>
      <Skeleton height="2rem" width="60%" />
      <Skeleton height="5rem" />
    </div>
  ),
};

export const Heading: Story = {
  render: () => (
    <PageHeader
      title="Page title"
      description="A short explanation of what the page owns."
      actions={<Button variant="primary">Action</Button>}
    />
  ),
};

export const Dialog: Story = {
  render: () => (
    <Modal open title="Confirm action" actions={<Button variant="primary">Confirm</Button>}>
      <p>This state stays visible in Storybook without application data.</p>
    </Modal>
  ),
};

export const Sections: Story = {
  render: () => (
    <div style={{ display: "grid", gap: "var(--jr-space-6)" }}>
      <SectionHeader
        actions={<Button>Export</Button>}
        description="Every record the last run touched, with the evidence it found."
        eyebrow="Section eyebrow"
        meta="67 records"
        title="Section title"
      />
      <SectionHeader title="Contained variant" variant="contained" />
    </div>
  ),
};

export const Boxes: Story = {
  render: () => (
    <div style={{ display: "grid", gap: "var(--jr-space-5)" }}>
      <Panel>
        <SectionHeader
          description="One radius for every page-level box, so two pages cannot disagree."
          title="Panel"
          variant="contained"
        />
      </Panel>
      <ControlRow fields={3}>
        <SelectField id="story-control-row-market" label="Market" name="market">
          <option>Every market</option>
        </SelectField>
        <SelectField id="story-control-row-state" label="State" name="state">
          <option>Every state</option>
        </SelectField>
        <SearchField id="story-control-row-search" label="Search" name="q" />
        <Button variant="secondary">Apply filters</Button>
      </ControlRow>
      <div style={{ display: "grid", gap: "var(--jr-space-3)" }}>
        <Card>A record, one step down in radius from the panel it sits in.</Card>
        <Card tone="retired">The same record once it has been removed.</Card>
        <Card tone="outlined">A record with a neutral boundary inside another surface.</Card>
      </div>
    </div>
  ),
};

export const Tabs: Story = {
  render: () => (
    <div style={{ display: "grid", gap: "var(--jr-space-5)" }}>
      <TabNavigation label="Example views">
        <a aria-current="page" href="#first">
          Selected
        </a>
        <a href="#second">Second</a>
        <a href="#third">Third</a>
      </TabNavigation>
      <TabNavigation label="Settings sections" level="secondary">
        <a aria-current="page" href="#criteria">
          Research criteria
        </a>
        <a href="#execution">Execution</a>
      </TabNavigation>
    </div>
  ),
};

export const Selection: Story = {
  render: () => (
    <div style={{ display: "grid", gap: "var(--jr-space-4)", width: "22rem" }}>
      <SelectField
        defaultValue="weekly"
        hint="How often the schedule runs unattended."
        id="cadence"
        label="Cadence"
      >
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
      </SelectField>
      <SelectField error="Choose a market before saving." id="market" label="Market" required>
        <option value="">Select a market</option>
        <option value="uae">United Arab Emirates</option>
      </SelectField>
    </div>
  ),
};

export const Annotations: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--jr-space-5)" }}>
      <Tooltip label="Activity">
        <Button>Hover or focus me</Button>
      </Tooltip>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--jr-space-2)" }}>
        Unread
        <NotificationBadge count={4} />
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--jr-space-2)" }}>
        None, which renders nothing
        <NotificationBadge count={0} />
      </span>
    </div>
  ),
};

export const LongFormEntry: Story = {
  render: () => (
    <div style={{ display: "grid", gap: "1rem", width: "26rem" }}>
      <TextArea
        hint="One value per line."
        id="story-text-area"
        label="Excluded title terms"
        rows={5}
      />
      <TextArea error="Enter at least one term." id="story-text-area-error" label="Required list" />
      <SearchField id="story-search" label="Search matches" placeholder="Title, company" />
    </div>
  ),
};

export const Choices: Story = {
  render: () => {
    const [scope, setScope] = useState("with-recruiters");
    return (
      <div style={{ display: "grid", gap: "1.25rem", width: "26rem" }}>
        <Checkbox
          description="Accept location-agnostic remote jobs."
          id="story-checkbox"
          label="Include remote roles"
        />
        <RadioGroup
          id="story-radio-group"
          legend="What happens to its recruiters?"
          name="story-cascade"
          onChange={setScope}
          options={[
            { label: "Remove them with the firm", value: "with-recruiters" },
            { description: "They stay in the registry.", label: "Keep them", value: "firm-only" },
          ]}
          value={scope}
        />
      </div>
    );
  },
};

export const Filtering: Story = {
  render: () => {
    const [currency, setCurrency] = useState("AED");
    return (
      <div style={{ width: "22rem" }}>
        <Combobox
          hint="Filter by code, name, or country."
          id="story-combobox"
          label="Salary currency"
          name="story-currency"
          onChange={setCurrency}
          options={[
            {
              detail: "UAE Dirham",
              label: "AED",
              searchTerms: ["United Arab Emirates"],
              value: "AED",
            },
            {
              detail: "Pound Sterling",
              label: "GBP",
              searchTerms: ["United Kingdom"],
              value: "GBP",
            },
            { detail: "Singapore Dollar", label: "SGD", searchTerms: ["Singapore"], value: "SGD" },
          ]}
          value={currency}
        />
      </div>
    );
  },
};
