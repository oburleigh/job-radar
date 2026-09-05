import {
  Button,
  IconButton,
  Modal,
  NotificationBadge,
  PageHeader,
  SectionHeader,
  SelectField,
  Skeleton,
  Switch,
  TabNavigation,
  TextField,
  TokenAutocomplete,
  Tooltip,
} from "@job-radar/design-ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

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
      <Button busy>Saving</Button>
      <IconButton label="Dismiss example">×</IconButton>
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
