Feature: See the central inventory (J01)

  As someone planning work, I want to see every skill available centrally, so
  that I know what I can reuse.

  Scenario: I see every central skill available
    Given a cockpit pointed at an inventory with two skills
    When I open the central inventory
    Then I see both skills with their names and descriptions

  Scenario: One broken skill does not hide the others
    Given an inventory where one skill is broken and one is valid
    When I open the central inventory
    Then I still see the valid skill

  Scenario: I am told clearly when no inventory is configured
    Given a cockpit with no inventory configured
    When I open the central inventory
    Then I see a clear "not configured" message instead of a blank list
