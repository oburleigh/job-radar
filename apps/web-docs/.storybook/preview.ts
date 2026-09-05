import type { Preview } from "@storybook/react-vite";

import "@fontsource-variable/inter/opsz.css";
import "@job-radar/design-tokens/theme.css";
import "@job-radar/design-ui/styles.css";

const preview: Preview = {
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme;
      if (theme === "light" || theme === "dark") {
        document.documentElement.dataset.theme = theme;
      } else {
        delete document.documentElement.dataset.theme;
      }
      return Story();
    },
  ],
  globalTypes: {
    theme: {
      description: "Colour scheme",
      toolbar: {
        icon: "paintbrush",
        items: [
          { title: "Light", value: "light" },
          { title: "Dark", value: "dark" },
          { title: "System", value: "system" },
        ],
      },
    },
  },
  initialGlobals: {
    theme: "light",
  },
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
