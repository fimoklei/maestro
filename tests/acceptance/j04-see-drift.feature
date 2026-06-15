Feature: See version drift per deployed skill (J04)

  As someone keeping repos current, I want to see whether each deployed skill is
  behind the latest central tag, so that I know what to update without comparing
  versions by hand. The judgment comes from apm; Maestro shows it binary.

  Scenario: A skill behind the latest tag is seen as behind
    Given a registered repo where apm reports "tdd" is behind
    When I check that repo's drift
    Then I see "tdd" reported as behind

  Scenario: A current skill is seen as up-to-date
    Given a registered repo where apm reports nothing behind
    When I check that repo's drift
    Then I see nothing reported as behind

  Scenario: A check that could not run is seen as unknown, never up-to-date
    Given a registered repo where the apm check cannot run
    When I check that repo's drift
    Then I see the check reported as failed, not an empty up-to-date result
