import type { Meta, StoryObj } from "@storybook/react-vite";
import { BrowseRunReport } from "./browse-run-report";

const meta = {
  title: "Shell/BrowseRunReport",
  component: BrowseRunReport,
  args: {
    isRegistering: false,
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
        reason: "skipped · No directory exists there.",
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

// Mid-run: the report is already on screen, with the repos it has finished.
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
