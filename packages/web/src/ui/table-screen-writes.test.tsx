import { useMutation } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { toast } from "sonner";
import { afterEach, describe, expect, it } from "vitest";
import { renderWithQuery, sentence } from "../test-utils";
import { createDataTableColumns } from "./data-table";
import { DetailPane } from "./detail-pane";
import { Dialog } from "./dialog";
import { TableScreen } from "./table-screen";
import { ToastHost } from "./toast";
import { useTableScreen } from "./use-table-screen";
import { useScreenReport, useWriteAction } from "./use-write-action";

type Fruit = { name: string };

const COLUMNS = createDataTableColumns<Fruit>((helper) => [
  helper.accessor("name", { header: "Name" }),
]);

const NOT_PLANTED = {
  level: "error",
  label: "Plum not planted",
  message: "The orchard refused it. Select Plant fruit to try again.",
} as const;

// One write whose answer the test hands out.
function deferred() {
  let settle: { resolve: () => void; reject: () => void } | undefined;
  const promise = new Promise<void>((resolve, reject) => {
    settle = { resolve, reject: () => reject(new Error("refused")) };
  });
  return { promise, ...(settle as NonNullable<typeof settle>) };
}

function Orchard({
  answer,
  show,
  said,
}: {
  answer: Promise<void>;
  show: "toast" | "row";
  /** False: the dialog's own outcome states the result. */
  said: boolean;
}) {
  const [rows, setRows] = useState<Fruit[]>([{ name: "pear" }]);
  const [planting, setPlanting] = useState(false);
  const state = useTableScreen({
    name: "Orchard",
    reading: false,
    settled: true,
    failure: null,
    onReread: () => {},
    openOnArrival: null,
  });
  return (
    <>
      <TableScreen
        state={state}
        action={
          <button type="button" onClick={() => setPlanting(true)}>
            Plant fruit
          </button>
        }
        rereading={false}
        firstReadRows={8}
        rows={rows}
        columns={COLUMNS}
        rowId={(row) => row.name}
        pane={(row, frame) => (
          <DetailPane title={row.name} activeKey={row.name} {...frame} />
        )}
      >
        {planting ? (
          <PlantDialog
            answer={answer}
            show={show}
            said={said}
            onClose={() => setPlanting(false)}
            onPlanted={(name) => {
              setRows((current) => [...current, { name }]);
              setPlanting(false);
              state.open(name);
            }}
          />
        ) : null}
      </TableScreen>
      <ToastHost />
    </>
  );
}

function PlantDialog({
  answer,
  show,
  said,
  onClose,
  onPlanted,
}: {
  answer: Promise<void>;
  show: "toast" | "row";
  said: boolean;
  onClose: () => void;
  onPlanted: (name: string) => void;
}) {
  const plant = useMutation({ mutationFn: (_name: string) => answer });
  const write = useWriteAction(plant, {
    report: useScreenReport(),
    action: "deploy",
    show,
    name: (_data, name) => (said ? name : null),
    failure: () => NOT_PLANTED,
  });
  return (
    <Dialog
      title="Plant fruit"
      version={null}
      width={480}
      phase={write.phase}
      action={{
        label: "Plant fruit",
        verb: "deploy",
        tone: "primary",
        unavailable: null,
        onRun: () =>
          write.run("plum", { onSuccess: (_data, name) => onPlanted(name) }),
      }}
      failure={write.failure}
      describedBy={null}
      fieldsChanged={false}
      onClose={onClose}
    >
      <p className="m-0">A plum goes in the orchard.</p>
    </Dialog>
  );
}

const region = () =>
  screen
    .getAllByRole("status", { hidden: true })
    .find((each) => each.classList.contains("sr-only"));
const dialog = () => screen.getByRole("dialog", { name: "Plant fruit" });

async function startPlanting(
  answer: Promise<void>,
  show: "toast" | "row",
  said = true,
) {
  renderWithQuery(<Orchard answer={answer} show={show} said={said} />);
  await userEvent.click(screen.getByRole("button", { name: "Plant fruit" }));
  await userEvent.click(
    within(dialog()).getByRole("button", { name: "Plant fruit" }),
  );
}

// The toast store outlives a render.
afterEach(() => toast.dismiss());

describe("a write on a table screen", () => {
  it("spins the pressed control, says its busy label and blocks closing while it runs", async () => {
    const answer = deferred();
    await startPlanting(answer.promise, "row");

    expect(
      within(dialog()).getByRole("button", { name: "Deploying…" }),
    ).toBeInTheDocument();
    expect(region()).toHaveTextContent("Deploying…");
    expect(
      within(dialog()).getByRole("button", { name: "Cancel" }),
    ).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(dialog()).toBeInTheDocument();
  });

  it("closes a dialog that adds a row, selects the row and says the done sentence once", async () => {
    const answer = deferred();
    await startPlanting(answer.promise, "row");

    answer.resolve();

    await waitFor(() => expect(region()).toHaveTextContent("Deployed plum."));
    expect(screen.queryByRole("dialog", { name: "Plant fruit" })).toBeNull();
    expect(
      screen.getByRole("heading", { level: 2, name: "plum" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(sentence("Deployed plum."))).toHaveLength(1);
  });

  it("says a success the reader may miss in a toast, the region silent", async () => {
    const answer = deferred();
    await startPlanting(answer.promise, "toast");

    answer.resolve();

    expect(
      await screen.findByText(sentence("Deployed plum.")),
    ).toBeInTheDocument();
    expect(region()).toBeEmptyDOMElement();
  });

  it("stays silent where the dialog's own outcome states the result", async () => {
    const answer = deferred();
    await startPlanting(answer.promise, "toast", false);

    answer.resolve();

    await waitFor(() => expect(region()).toBeEmptyDOMElement());
    expect(screen.queryByText(/Deployed/)).toBeNull();
  });

  it("keeps a failed dialog open with its notice, Close to leave, announced only by the notice", async () => {
    const answer = deferred();
    await startPlanting(answer.promise, "row");

    answer.reject();

    expect(
      await within(dialog()).findByText("Plum not planted"),
    ).toBeInTheDocument();
    expect(
      within(dialog()).getByText("Close", { selector: "button" }),
    ).not.toBeDisabled();
    expect(region()).toBeEmptyDOMElement();
  });
});
