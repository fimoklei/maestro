import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import type { FolderChooser } from "../ui/use-folder-chooser";
import { ConnectForm } from "./connect-form";

function chooser(overrides: Partial<FolderChooser> = {}): FolderChooser {
  return {
    available: true,
    busy: false,
    notice: null,
    browse: vi.fn(),
    ...overrides,
  };
}

const URL = "https://github.com/fimoklei/agent-harness";

function renderForm(props: Partial<ComponentProps<typeof ConnectForm>> = {}) {
  return render(
    <ConnectForm
      path=""
      onPathChange={vi.fn()}
      pathChooser={chooser()}
      cloneParent=""
      onCloneParentChange={vi.fn()}
      cloneChooser={chooser()}
      cloneOpen={false}
      onOpenClone={vi.fn()}
      onSubmit={vi.fn()}
      {...props}
    />,
  );
}

describe("ConnectForm", () => {
  it("opens the system folder chooser on the typed path from Browse", async () => {
    const pathChooser = chooser();
    renderForm({ path: "/home/me", pathChooser });

    await userEvent.click(screen.getByRole("button", { name: "Browse" }));

    expect(pathChooser.browse).toHaveBeenCalledWith(
      "/home/me",
      expect.any(Function),
    );
  });

  it("offers no Browse where no chooser exists", () => {
    renderForm({ pathChooser: chooser({ available: false }) });

    expect(
      screen.queryByRole("button", { name: "Browse" }),
    ).not.toBeInTheDocument();
  });

  // Cloning can run for minutes with nothing else on screen, so the wait is
  // stated in sentences — never a percentage, and with nothing to cancel (#554).
  it("states progress as a sentence while the connect is running", () => {
    renderForm({ path: URL, isPending: true });

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/cloned/i);
    expect(status).not.toHaveTextContent(/%/);
    expect(
      screen.queryByRole("button", { name: /cancel/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connecting…" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("shows no progress sentence when nothing is running", () => {
    renderForm();

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("accepts a GitHub url in the same field, without a second input", () => {
    renderForm({ path: URL });

    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getByLabelText("Inventory path or GitHub URL")).toHaveValue(
      URL,
    );
  });

  it("reports edits to the path via onPathChange instead of owning the value", () => {
    const onPathChange = vi.fn();
    renderForm({ onPathChange });

    fireEvent.change(screen.getByLabelText("Inventory path or GitHub URL"), {
      target: { value: "/x" },
    });

    expect(onPathChange).toHaveBeenCalledWith("/x");
  });

  it("states a refusal as one notice under the field, with its action", async () => {
    const onAction = vi.fn();
    renderForm({
      path: "/home/me/skills-only-folder",
      notice: {
        level: "error",
        label: "No GitHub origin",
        message: "Point the clone's origin at GitHub, or choose another clone.",
        action: { label: "Choose another clone", onClick: onAction },
      },
    });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("No GitHub origin");
    // Colour is never the only signal: the glyph travels with the heading.
    expect(alert.textContent).toMatch(/✕/);
    // Under the field, above the submit it describes.
    const submit = screen.getByRole("button", { name: "Connect Inventory" });
    expect(
      alert.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: "Choose another clone" }),
    );
    expect(onAction).toHaveBeenCalledOnce();
  });

  it("marks a refused path invalid and ties the notice to the field", () => {
    renderForm({
      path: "/home/me/not-a-harness",
      notice: {
        level: "error",
        label: "Not a Harness",
        message: "The folder has no apm.yml.",
      },
    });

    const input = screen.getByLabelText("Inventory path or GitHub URL");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/not a harness/i);
  });

  it("returns focus to the refused field when a submit fails (#214)", () => {
    const { rerender } = renderForm({ path: "/home/me/not-an-inventory" });
    const input = screen.getByLabelText("Inventory path or GitHub URL");
    expect(input).not.toHaveFocus();

    rerender(
      <ConnectForm
        path="/home/me/not-an-inventory"
        onPathChange={vi.fn()}
        pathChooser={chooser()}
        cloneParent=""
        onCloneParentChange={vi.fn()}
        cloneChooser={chooser()}
        cloneOpen={false}
        onOpenClone={vi.fn()}
        onSubmit={vi.fn()}
        notice={{
          level: "error",
          label: "Not a Harness",
          message: "The folder has no apm.yml.",
        }}
      />,
    );

    expect(input).toHaveFocus();
  });

  describe("the clone destination", () => {
    it("names the home folder while no folder has been chosen", () => {
      renderForm({ path: URL });

      expect(
        screen.getByText("your home folder/agent-harness"),
      ).toBeInTheDocument();
    });

    it("shows no destination for a local path, which is not cloned", () => {
      renderForm({ path: "/Users/me/agent-harness" });

      expect(screen.queryByText(/clone into/i)).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /change folder/i }),
      ).not.toBeInTheDocument();
    });

    it("opens the clone folder field from Change folder…", async () => {
      const onOpenClone = vi.fn();
      renderForm({ path: URL, onOpenClone });

      await userEvent.click(
        screen.getByRole("button", { name: "Change folder…" }),
      );

      expect(onOpenClone).toHaveBeenCalledOnce();
    });

    it("shows the clone folder as a second field in place, with its hint", () => {
      renderForm({ path: URL, cloneOpen: true, cloneParent: "/Users/me/Work" });

      const field = screen.getByLabelText("Folder for the Harness");
      expect(field).toHaveValue("/Users/me/Work");
      expect(field).toHaveAccessibleDescription(
        /^The Harness is cloned into a new folder here, named after the repository\. Nothing already in this folder is renamed, moved or deleted\./,
      );
      expect(
        screen.getByText("/Users/me/Work/agent-harness"),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Change folder…" }),
      ).not.toBeInTheDocument();
    });

    it("opens the chooser for the clone folder from its own Browse", async () => {
      const cloneChooser = chooser();
      const onCloneParentChange = vi.fn();
      renderForm({
        path: URL,
        cloneOpen: true,
        cloneParent: "/Users/me",
        cloneChooser,
        onCloneParentChange,
      });

      const [, cloneBrowse] = screen.getAllByRole("button", { name: "Browse" });
      await userEvent.click(cloneBrowse as HTMLElement);

      expect(cloneChooser.browse).toHaveBeenCalledWith(
        "/Users/me",
        expect.any(Function),
      );
    });

    it("states a clone folder refusal under the clone field, not the path field", () => {
      renderForm({
        path: URL,
        cloneOpen: true,
        cloneParent: "/Users/me/Work",
        cloneNotice: {
          level: "error",
          label: "Destination folder taken",
          message: "Choose another folder to clone into.",
        },
      });

      expect(screen.getByLabelText("Folder for the Harness")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      expect(
        screen.getByLabelText("Inventory path or GitHub URL"),
      ).not.toHaveAttribute("aria-invalid");
      expect(screen.getByLabelText("Folder for the Harness")).toHaveFocus();
    });
  });

  // One offer on the same gate: no second screen, no mode button (#556).
  it("offers the scaffold in place, naming the folder it would write to", async () => {
    const onAccept = vi.fn();
    renderForm({
      path: "https://github.com/fimoklei/team-harness",
      notice: {
        level: "info",
        label: "Harness scaffold available",
        message: "That GitHub repository has no apm.yml.",
        detail: "/home/me/team-harness",
        action: { label: "Scaffold the Harness", onClick: onAccept },
      },
    });

    const offer = screen.getByRole("status");
    expect(offer).toHaveTextContent("Harness scaffold available");
    expect(offer).toHaveTextContent("/home/me/team-harness");
    // An offer is not a malformed field: the path stays valid and submittable.
    expect(
      screen.getByLabelText("Inventory path or GitHub URL"),
    ).not.toHaveAttribute("aria-invalid");
    expect(
      screen.getByRole("button", { name: "Connect Inventory" }),
    ).toBeEnabled();

    await userEvent.click(
      screen.getByRole("button", { name: "Scaffold the Harness" }),
    );
    expect(onAccept).toHaveBeenCalledOnce();
  });

  it("locks the offer while the scaffold is running", () => {
    renderForm({
      notice: {
        level: "info",
        label: "Harness scaffold available",
        message: "That GitHub repository has no apm.yml.",
        action: { label: "Scaffolding…", onClick: vi.fn(), disabled: true },
      },
      submitDisabled: true,
    });

    expect(screen.getByRole("button", { name: "Scaffolding…" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Scaffold the Harness" }),
    ).not.toBeInTheDocument();
  });

  // A scaffold writes, commits and pushes. A connect started beside it would
  // race it for the one inventory path, so submit goes down with it (#556).
  it("takes submit down while a scaffold is running", () => {
    renderForm({ submitDisabled: true });

    expect(
      screen.getByRole("button", { name: "Connect Inventory" }),
    ).toBeDisabled();
  });

  it("submits from the button and from Enter in the field", async () => {
    const onSubmit = vi.fn();
    renderForm({ path: "/home/me/agent-harness", onSubmit });

    await userEvent.click(
      screen.getByRole("button", { name: "Connect Inventory" }),
    );
    screen.getByLabelText("Inventory path or GitHub URL").focus();
    await userEvent.keyboard("{Enter}");

    expect(onSubmit).toHaveBeenCalledTimes(2);
  });
});
