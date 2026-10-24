import { useMutation } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { afterEach, describe, expect, it } from "vitest";
import { renderWithQuery, sentence } from "../test-utils";
import { doneSentence } from "./busy-copy";
import { createDataTableColumns } from "./data-table";
import { DetailPane } from "./detail-pane";
import { Dialog } from "./dialog";
import { TableScreen } from "./table-screen";
import { ToastHost } from "./toast";
import { useTableScreen } from "./use-table-screen";
import {
  type Subject,
  useScreenReport,
  useScreenWrites,
  useWriteAction,
  type WriteResult,
} from "./use-write-action";

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

type Tree = { name: string; grove: string };

const TREE_COLUMNS = createDataTableColumns<Tree>((helper) => [
  helper.accessor("name", { header: "Name" }),
]);

const BY_GROVE = {
  key: (row: Tree) => row.grove,
  order: ["north", "south"],
};

const TREES: Tree[] = [
  { name: "oak", grove: "north" },
  { name: "elm", grove: "south" },
];

const GROVE_NOT_READ = {
  level: "error",
  label: "Grove not read",
  message: "Select Re-read Grove to read the grove again.",
} as const;

// A write that lands at once, then a read the test lands by hand: `after`
// holds the rows it brings, or "failed" for a read that failed.
function Grove({
  read,
  after,
  subject,
  hidden = () => false,
}: {
  read: Promise<void>;
  after: Tree[] | "failed";
  subject: Subject | null;
  hidden?: (row: Tree) => boolean;
}) {
  const [rows, setRows] = useState(TREES);
  const [reading, setReading] = useState(false);
  const [failed, setFailed] = useState(false);
  const state = useTableScreen({
    name: "Grove",
    reading,
    settled: !failed,
    failure: failed ? GROVE_NOT_READ : null,
    onReread: () => {},
    openOnArrival: null,
  });
  const reread = async () => {
    setReading(true);
    await read;
    if (after === "failed") setFailed(true);
    else setRows(after);
    setReading(false);
  };
  return (
    <>
      <TableScreen
        state={state}
        action={<Prune subject={subject} onWritten={reread} />}
        rereading={reading}
        firstReadRows={2}
        rows={rows}
        columns={TREE_COLUMNS}
        rowId={(row) => row.name}
        groups={BY_GROVE}
        shown={(row) => !hidden(row)}
        pane={(row, frame) => (
          <DetailPane
            title={row.name}
            activeKey={row.name}
            {...frame}
            subList={<Prune subject={subject} onWritten={reread} />}
          />
        )}
      />
      <ToastHost />
    </>
  );
}

function Prune({
  subject,
  onWritten,
}: {
  subject: Subject | null;
  onWritten: () => void;
}) {
  const prune = useMutation({
    mutationFn: async (_tree: string) => {},
    onSuccess: onWritten,
  });
  const write = useWriteAction(prune, {
    screen: useScreenWrites(),
    action: "remove",
    subject: () => subject,
    failure: () => null,
  });
  return (
    <button type="button" onClick={() => write.run("oak")}>
      Prune
    </button>
  );
}

async function prune(
  props: Omit<Parameters<typeof Grove>[0], "read">,
  before?: () => Promise<void>,
) {
  const read = deferred();
  renderWithQuery(<Grove read={read.promise} {...props} />);
  await before?.();
  await userEvent.click(screen.getByRole("button", { name: "Prune" }));
  return read;
}

const OAK: Subject = { name: "oak", row: "oak" };

describe("a write's result, once the read after it lands", () => {
  it("says the done sentence in the region while its row is in view, no toast", async () => {
    const read = await prune({ after: TREES, subject: OAK });
    expect(region()).toHaveTextContent("Removing…");

    read.resolve();

    await waitFor(() => expect(region()).toHaveTextContent("Removed oak."));
    expect(screen.getAllByText(sentence("Removed oak."))).toHaveLength(1);
  });

  it("says it in a toast when a Filter hides the row after the read, the region empty", async () => {
    const read = await prune({
      after: [{ name: "oak", grove: "west" }, TREES[1] as Tree],
      hidden: (row) => row.grove === "west",
      subject: OAK,
    });
    expect(screen.queryByText(sentence("Removed oak."))).toBeNull();

    read.resolve();

    expect(
      await screen.findByText(sentence("Removed oak.")),
    ).toBeInTheDocument();
    expect(region()).toBeEmptyDOMElement();
  });

  it("says it in a toast when the row's group is collapsed", async () => {
    const read = await prune({ after: TREES, subject: OAK }, () =>
      userEvent.click(screen.getByRole("button", { name: "Collapse north" })),
    );

    read.resolve();

    expect(
      await screen.findByText(sentence("Removed oak.")),
    ).toBeInTheDocument();
    expect(region()).toBeEmptyDOMElement();
  });

  it("says it in the region when the row's pane is open, though its group is collapsed", async () => {
    const read = deferred();
    renderWithQuery(<Grove read={read.promise} after={TREES} subject={OAK} />);
    await userEvent.click(screen.getByText("oak"));
    await userEvent.click(
      screen.getByRole("button", { name: "Collapse north" }),
    );
    await userEvent.click(
      within(
        screen.getByRole("complementary", { name: "oak detail" }),
      ).getByRole("button", { name: "Prune" }),
    );

    read.resolve();

    await waitFor(() => expect(region()).toHaveTextContent("Removed oak."));
    expect(screen.getAllByText(sentence("Removed oak."))).toHaveLength(1);
  });

  it("says it in a toast when the row left after the read", async () => {
    const read = await prune({ after: [TREES[1] as Tree], subject: OAK });

    read.resolve();

    expect(
      await screen.findByText(sentence("Removed oak.")),
    ).toBeInTheDocument();
    expect(region()).toBeEmptyDOMElement();
  });

  it("says it in a toast when the write touches no row", async () => {
    const read = await prune({
      after: TREES,
      subject: { name: "oak", row: null },
    });

    read.resolve();

    expect(
      await screen.findByText(sentence("Removed oak.")),
    ).toBeInTheDocument();
    expect(region()).toBeEmptyDOMElement();
  });

  it("counts several items in the toast", async () => {
    const read = await prune({
      after: [],
      subject: { name: { count: 3, things: "trees" }, row: null },
    });

    read.resolve();

    expect(
      await screen.findByText(sentence("Removed 3 trees.")),
    ).toBeInTheDocument();
  });

  it("says it in a toast beside the failed-read notice when the read after it fails", async () => {
    const read = await prune({ after: "failed", subject: OAK });

    read.resolve();

    expect(
      await screen.findByText(sentence("Removed oak.")),
    ).toBeInTheDocument();
    expect(screen.getByText("Grove not read")).toBeInTheDocument();
    expect(region()).not.toHaveTextContent("Removed oak.");
  });
});

// A screen another screen's write ended on: it holds the result it was handed
// through its first read, with the touched row opened on arrival.
function Landing({
  read,
  handed,
}: {
  read: Promise<void>;
  handed: WriteResult;
}) {
  const [rows, setRows] = useState<Tree[]>([]);
  const [reading, setReading] = useState(true);
  const state = useTableScreen({
    name: "Grove",
    reading,
    settled: !reading,
    failure: null,
    onReread: () => {},
    openOnArrival: handed.row,
  });
  const { settle } = state;
  useEffect(() => {
    settle(handed);
    void read.then(() => {
      setRows(TREES);
      setReading(false);
    });
  }, [settle, handed, read]);
  return (
    <>
      <TableScreen
        state={state}
        action={null}
        rereading={reading}
        firstReadRows={2}
        rows={rows}
        columns={TREE_COLUMNS}
        rowId={(row) => row.name}
        groups={BY_GROVE}
        pane={(row, frame) => (
          <DetailPane title={row.name} activeKey={row.name} {...frame} />
        )}
      />
      <ToastHost />
    </>
  );
}

describe("a write's result handed to the screen it ends on", () => {
  it("says it in the region once the first read opens its row", async () => {
    const read = deferred();
    renderWithQuery(
      <Landing
        read={read.promise}
        handed={{ sentence: doneSentence("remove", "oak"), row: "oak" }}
      />,
    );
    expect(region()).not.toHaveTextContent("Removed oak.");

    read.resolve();

    await waitFor(() => expect(region()).toHaveTextContent("Removed oak."));
    expect(
      screen.getByRole("complementary", { name: "oak detail" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(sentence("Removed oak."))).toHaveLength(1);
  });
});
