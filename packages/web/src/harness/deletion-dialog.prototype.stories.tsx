// PROTOTYPE (#1338), throwaway: the two confirmations for deleting a skill on
// the default branch, with the copy from the design brief. Never merge.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "../ui/card";
import { Dialog } from "../ui/dialog";
import { Fact } from "../ui/fact";
import { Notice, type NoticeContent } from "../ui/notice";

type Props = {
  step: "delete" | "propose";
  skill: string;
  uncommitted: boolean;
  openRequest: number | null;
};

function PrototypeDeletionDialog({
  step,
  skill,
  uncommitted,
  openRequest,
}: Props) {
  const warning: NoticeContent | null =
    step === "delete"
      ? uncommitted
        ? {
            level: "warning",
            label: `Uncommitted changes in ${skill}`,
            message:
              "Delete skill discards these changes. To keep them, commit them first.",
          }
        : null
      : openRequest !== null
        ? {
            level: "warning",
            label: `Pull request #${openRequest} will delete ${skill} instead`,
            message: `It now proposes changes to ${skill}. Delete skill replaces those changes with the deletion.`,
          }
        : null;

  return (
    <Dialog
      title={`Delete ${skill}`}
      version={null}
      width={480}
      phase="idle"
      action={{
        label: "Delete skill",
        verb: "delete",
        tone: "danger",
        unavailable: null,
        onRun: () => {},
      }}
      failure={null}
      describedBy={null}
      fieldsChanged={false}
      onClose={() => {}}
    >
      {step === "delete" ? (
        <>
          <p className="m-0">
            Delete skill removes the {skill} folder from your clone. GitHub and
            your targets keep the skill.
          </p>
          <p className="m-0 text-gray-11">
            Then select Propose change to open a pull request.
          </p>
        </>
      ) : (
        <>
          {openRequest === null ? (
            <p className="m-0">
              Delete skill opens a pull request to delete {skill} from the
              Harness.
            </p>
          ) : null}
          <p className="m-0 text-gray-11">
            Your targets keep the skill. After the next release, select Update
            target on each target to remove it.
          </p>
        </>
      )}
      <Card padded>
        <dl className="flex flex-wrap gap-x-panel gap-y-cell">
          <Fact label="Skill" value={skill} wrap />
          {step === "delete" ? (
            <Fact label="Folder" value={`.apm/skills/${skill}`} wrap />
          ) : (
            <>
              <Fact label="Branch" value={`maestro/${skill}`} wrap />
              <Fact
                label="Default branch commit"
                value="9f2c1b7a3d4e5f60718293a4b5c6d7e8f9012345"
                wrap
                hint="If someone pushes a commit to the default branch before you confirm, Maestro pushes nothing."
              />
            </>
          )}
        </dl>
      </Card>
      {warning === null ? null : <Notice trigger="load" notice={warning} />}
    </Dialog>
  );
}

const meta = {
  title: "Prototype/1338 Delete a released skill",
  component: PrototypeDeletionDialog,
  args: {
    step: "delete",
    skill: "code-review",
    uncommitted: false,
    openRequest: null,
  },
  argTypes: {
    step: { control: "inline-radio", options: ["delete", "propose"] },
  },
} satisfies Meta<typeof PrototypeDeletionDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Step1DeleteSkill: Story = {};

export const Step1WithUncommittedChanges: Story = {
  args: { uncommitted: true },
};

export const Step2ProposeDeletion: Story = {
  args: { step: "propose" },
};

export const Step2WithOpenPullRequest: Story = {
  args: { step: "propose", openRequest: 45 },
};
