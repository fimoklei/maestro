Feature: Register a consuming repo (J10)

  As someone steering my projects from the cockpit, I register a repo by pasting
  its absolute path so Maestro can see and steer it.

  Scenario: I register a repo by its path and see it listed
    Given a fresh cockpit with an empty registry
    When I register the path of an existing directory
    Then that repo appears in the registered list

  Scenario: An invalid path is rejected with a readable error
    Given a fresh cockpit with an empty registry
    When I try to register a relative path
    Then the registration is rejected with a readable error
    And the registry stays empty

  Scenario: Registration survives a restart
    Given a fresh cockpit with an empty registry
    And I have registered an existing directory
    When the cockpit restarts
    Then that repo is still in the registered list
