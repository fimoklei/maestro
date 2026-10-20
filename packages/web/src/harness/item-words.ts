import type { HarnessPrimitiveType } from "@maestro/core";
import { DELETE_LABEL, RESTORE_LABEL } from "../ui/control-labels";

/** The words a sentence takes by type: a skill is a folder that deploys, a prompt one file that never does. */
export type ItemWords = {
  /** "skill": as a sentence names one. */
  noun: string;
  /** "Skill": the name fact and a heading's first word. */
  Noun: string;
  /** "folder": what holds the item on disk. */
  holder: string;
  /** "Folder": the path fact and a heading's first word. */
  Holder: string;
  /** The Harness folder that holds every item of the type. */
  home: string;
  /** A valid name, for the name rule's example. */
  example: string;
  deleteLabel: string;
  restoreLabel: string;
  /** False for a prompt: no target holds one. */
  deploys: boolean;
};

export const ITEM_WORDS: Record<HarnessPrimitiveType, ItemWords> = {
  skill: {
    noun: "skill",
    Noun: "Skill",
    holder: "folder",
    Holder: "Folder",
    home: ".apm/skills folder",
    example: "code-review",
    deleteLabel: DELETE_LABEL.skill,
    restoreLabel: RESTORE_LABEL.skill,
    deploys: true,
  },
  prompt: {
    noun: "prompt",
    Noun: "Prompt",
    holder: "file",
    Holder: "File",
    home: ".maestro/prompts folder",
    example: "pr-review",
    deleteLabel: DELETE_LABEL.prompt,
    restoreLabel: RESTORE_LABEL.prompt,
    deploys: false,
  },
};
