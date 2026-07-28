Feature: Remove a deployed skill from a target

  As someone tidying up, I want to take a deployed skill off a repo or off my
  whole machine from the cockpit, so that it stops carrying a skill I no longer
  want — without hand-editing manifests or running apm myself.

  Scenario: I remove a skill and the repo stops listing it
    Given a registered repo with "tdd" and "jobs" deployed
    When I remove "tdd" from that repo
    Then the removal is confirmed
    And that repo's deploy-state lists only "jobs"

  Scenario: Removing the last skill leaves an honestly empty repo
    Given a registered repo with only "tdd" deployed
    When I remove "tdd" from that repo
    Then the removal is confirmed
    And that repo's deploy-state is empty, not an error

  Scenario: A repo Maestro does not know is refused before anything is touched
    Given a repo with "tdd" deployed that was never registered
    When I remove "tdd" from that repo
    Then I am refused and apm is never asked to remove anything

  Scenario: A removal apm cannot confirm is reported as a failure
    Given a registered repo with only "tdd" deployed
    But apm will not confirm the removal
    When I remove "tdd" from that repo
    Then the removal is reported as failed
    And that repo's deploy-state still lists "tdd"

  Scenario: A skill I edited in place tells me what I am about to lose
    Given a registered repo with only "tdd" deployed
    But my deployed copy of "tdd" has local edits
    When I ask what removing "tdd" would cost
    Then I am told those local edits would be lost
    And nothing has been removed yet

  Scenario: Having been warned, I remove the edited skill anyway
    Given a registered repo with only "tdd" deployed
    But my deployed copy of "tdd" has local edits
    When I remove "tdd" from that repo
    Then the removal is confirmed
    And that repo's deploy-state is empty, not an error

  Scenario: A copy with nothing to check it against says so in its own words
    Given a registered repo with only "tdd" deployed
    But my deployed copy of "tdd" has no baseline to check against
    When I ask what removing "tdd" would cost
    Then I am told the copy cannot be checked

  Scenario: A skill that is not there is not reported as removed
    Given a registered repo with only "jobs" deployed
    When I remove "tdd" from that repo
    Then I am told there was nothing to remove

  Scenario: I take a globally deployed skill off every tool in one action
    Given "tdd" and "jobs" deployed globally on Claude Code and Codex
    When I remove "tdd" globally
    Then the removal is confirmed
    And no tool's global deploy-state lists "tdd" any more
    And every tool still lists "jobs"

  Scenario: The copy left by a tool I no longer have goes too
    Given "tdd" and "jobs" deployed globally on Claude Code and Codex
    But Claude Code is no longer on this machine
    When I remove "tdd" globally
    Then the removal is confirmed
    And no copy of "tdd" is left behind for Claude Code
    And the copy of "jobs" is untouched

  Scenario: A leftover copy I never confirmed is left alone
    Given "tdd" and "jobs" deployed globally on Claude Code and Codex
    But Claude Code is no longer on this machine
    When I remove "tdd" globally without confirming the leftover copy
    Then the removal is confirmed
    And the leftover copy for Claude Code is still there
    And the copy of "jobs" is untouched

  Scenario: A machine with no supported tool has no global scope to remove from
    Given "tdd" and "jobs" deployed globally on Claude Code and Codex
    But this machine has no supported tool
    When I remove "tdd" globally
    Then I am refused and apm is never asked to remove anything

  Scenario: The global confirmation says what a removal would cost
    Given "tdd" and "jobs" deployed globally on Claude Code and Codex
    But my deployed copy of "tdd" has local edits
    When I ask what removing "tdd" globally would cost
    Then I am told those local edits would be lost
    And nothing has been removed yet
