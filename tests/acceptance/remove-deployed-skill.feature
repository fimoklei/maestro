Feature: Remove a deployed skill from a consuming repo

  As someone tidying up a repo, I want to take a deployed skill off it from the
  cockpit, so that the repo stops carrying a skill I no longer want — without
  hand-editing manifests or running apm myself.

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
