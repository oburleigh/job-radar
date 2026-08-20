import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "./button";
import { Modal } from "./modal";
import { PageHeader } from "./page-header";
import { Skeleton } from "./skeleton";
import { Switch } from "./switch";
import { TextField } from "./text-field";

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
    </div>
  ),
};

export const FormControls: Story = {
  render: () => (
    <div style={{ display: "grid", gap: "1rem", width: "22rem" }}>
      <TextField id="example" label="Label" hint="Helpful supporting text" />
      <TextField id="error" label="Invalid field" error="Explain how to fix this value" />
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
      index="01"
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
