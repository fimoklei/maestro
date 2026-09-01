import type { Meta, StoryObj } from "@storybook/react-vite";
import { BrowseRunReport } from "./browse-run-report";

const meta = {
  title: "Shell/BrowseRunReport",
  component: BrowseRunReport,
  args: {
    isRegistering: false,
    runPaths: [
      "/Users/me/acme-web",
      "/Users/me/payments-api",
      "/Users/me/design-system",
    ],
    outcomes: [
      {
        requestedPath: "/Users/me/acme-web",
        path: "/Users/me/acme-web",
        ok: true,
        reason: "registered",
      },
      {
        requestedPath: "/Users/me/payments-api",
        path: "/Users/me/payments-api",
        ok: false,
        reason: "Skipped · Nothing exists there to register.",
      },
      {
        requestedPath: "/Users/me/design-system",
        path: "/Users/me/design-system",
        ok: true,
        reason: "registered",
      },
    ],
  },
  // The report fills the picker's middle, so give it the dialog's width.
  decorators: [
    (Story) => (
      <div style={{ width: 620 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BrowseRunReport>;

export default meta;

type Story = StoryObj<typeof meta>;

// A finished run the user has not dismissed yet: successes and failures in the
// order the selection was built, never grouped.
export const Mixed: Story = {};

export const AllRegistered: Story = {
  args: {
    runPaths: ["/Users/me/acme-web", "/Users/me/payments-api"],
    outcomes: [
      {
        requestedPath: "/Users/me/acme-web",
        path: "/Users/me/acme-web",
        ok: true,
        reason: "registered",
      },
      {
        requestedPath: "/Users/me/payments-api",
        path: "/Users/me/payments-api",
        ok: true,
        reason: "registered",
      },
    ],
  },
};

// Mid-run: every repo of the selection is already listed, so the list never
// grows under the reader — the queued ones only wait for their mark.
export const Registering: Story = {
  args: {
    isRegistering: true,
    outcomes: [
      {
        requestedPath: "/Users/me/acme-web",
        path: "/Users/me/acme-web",
        ok: true,
        reason: "registered",
      },
    ],
  },
};
