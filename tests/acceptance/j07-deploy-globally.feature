Feature: Deploy a skill globally (J07)

  As someone who wants a skill available across all my work, I want to deploy it
  globally for Claude Code and Codex from the cockpit, so that it is my baseline
  everywhere without running apm by hand — and without first registering a repo.

  Scenario: I deploy a skill globally and see it in my baseline, with no repo registered
    Given the central inventory has the skill "tdd"
    And both Claude Code and Codex are installed on this machine
    And no repo is registered
    When I deploy "tdd" globally
    Then the global deploy succeeds at the latest tag
    And apm is told to target "claude,codex"
    And I see "tdd" in the global deploy-state at that version

  Scenario: A single-tool machine deploys to only that tool, with no dead directory
    Given the central inventory has the skill "tdd"
    And only Claude Code is installed on this machine
    When I deploy "tdd" globally
    Then the global deploy succeeds at the latest tag
    And apm is told to target "claude"

  Scenario: Narrowing to Codex removes the dead Claude Code tree
    Given the central inventory has the skill "tdd"
    And a prior global install left both the Claude and Codex copies on disk
    And only Codex is installed on this machine
    When I deploy "tdd" globally
    Then the global deploy succeeds at the latest tag
    And apm is told to target "codex"
    And the obsolete Claude Code copy is gone while the shared copy remains

  Scenario: Narrowing to Claude Code keeps the skills directory other tools read
    Given the central inventory has the skill "tdd"
    And a prior global install left both the Claude and Codex copies on disk
    And only Claude Code is installed on this machine
    When I deploy "tdd" globally
    Then the global deploy succeeds at the latest tag
    And apm is told to target "claude"
    And both copies are still on disk

  Scenario: A machine with no supported tool refuses the global deploy
    Given the central inventory has the skill "tdd"
    And no supported tool is installed on this machine
    When I deploy "tdd" globally
    Then the global deploy is refused because no supported tool was found
    And the global deploy-state stays empty

  Scenario: A global deploy is refused when my local skill has diverged from its tag
    Given the central inventory has the skill "tdd"
    But my local copy of "tdd" has diverged from its latest tag
    When I deploy "tdd" globally
    Then the global deploy is refused with a tag-and-push message
    And the global deploy-state stays empty
