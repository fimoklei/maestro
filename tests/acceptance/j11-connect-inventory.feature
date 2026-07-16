Feature: Connect the central inventory offline (J11)

  As someone whose cockpit is not yet configured, I want to point it at a local
  agent-harness clone, so that the "not configured" dead-end turns into a
  working inventory.

  Scenario: I connect a local clone and the inventory lists its skills
    Given a cockpit with no inventory configured
    When I connect a local clone that has a skills folder
    Then the connect succeeds
    And the central inventory lists that clone's skills

  Scenario: A directory that is not an inventory is refused
    Given a cockpit with no inventory configured
    When I connect a directory that has no skills folder
    Then the connect is rejected with a readable error
    And the central inventory is still not configured

  Scenario: A folder with skills but no usable git origin is refused
    Given a cockpit with no inventory configured
    When I connect a folder that has skills but no usable git origin
    Then the connect is rejected with a readable error
    And the central inventory is still not configured

  Scenario: I connect via a path found by browsing
    Given a cockpit with no inventory configured
    When I browse to the clone's parent directory and connect the listed clone
    Then the connect succeeds
    And the central inventory lists that clone's skills
