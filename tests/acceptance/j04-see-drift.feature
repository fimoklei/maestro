Feature: See version drift per deployed skill (J04)

  As someone keeping repos current, I want to see whether each deployed skill is
  behind the latest central tag, so that I know what to update without comparing
  versions by hand. The judgment comes from apm; Maestro shows the deployed ->
  latest version pair, from which behind/up-to-date is derived (ADR-0007).

  Scenario: A skill behind the latest tag is seen with its deployed -> latest pair
    Given a registered repo where apm reports "tdd" behind from v0.5.0 to v0.5.1
    When I check that repo's drift
    Then I see "tdd" reported behind from v0.5.0 to v0.5.1

  Scenario: A current skill is seen as up-to-date
    Given a registered repo where apm reports nothing behind
    When I check that repo's drift
    Then I see nothing reported as behind

  Scenario: A check that could not run is seen as unknown, never up-to-date
    Given a registered repo where the apm check cannot run
    When I check that repo's drift
    Then I see the check reported as failed, not an empty up-to-date result

  Scenario: A skill apm could not reach the source for is seen as unverified
    Given a registered repo where apm could not reach the source to check the skill
    When I check that repo's drift
    Then I see the check reported as unverified, not an empty up-to-date result

  Scenario: A globally deployed skill behind the latest tag is seen with its pair
    Given global apm reports "tdd" behind from v0.5.0 to v0.5.1
    When I check global drift with a bogus repo path in the query
    Then I see "tdd" reported as globally behind from v0.5.0 to v0.5.1

  Scenario: A global check that could not run is seen as unknown, never up-to-date
    Given global apm cannot check drift
    When I check global drift
    Then I see the global check reported as failed, not an empty up-to-date result
