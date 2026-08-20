import type { Preview } from "@storybook/react-vite";

import "@job-radar/design-tokens/theme.css";
import "../src/styles.css";

const preview: Preview = {
  parameters: {
    a11y: {
      test: "error",
    },
    controls: {
      expanded: true,
    },
    layout: "centered",
  },
};

export default preview;
