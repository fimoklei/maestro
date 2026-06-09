Feature: The tracer journey — register, see, deploy, see it back (J10, J01, J06, J02)

  As someone steering their agent setup from one cockpit, I want to register a
  repo, see what is available centrally, deploy a skill with one action, and
  see it back at its version — without touching a CLI or typing a URL.

  Scenario: I register a repo I work in (J10)
    Given a project directory on my machine
    When I register it with Maestro
    Then it appears in the list of registered repos

  Scenario: I see every primitive available centrally (J01)
    Given a central inventory with the tdd skill
    When I open the inventory
    Then I see the tdd skill with its description

  Scenario: I deploy a skill to a registered repo with one action (J06)
    Given a registered repo and a central inventory with the tdd skill
    When I deploy the tdd skill to that repo
    Then the deploy succeeds pinned to the latest published tag

  Scenario: I see the deployed skill back at its version (J02)
    Given I deployed the tdd skill to a registered repo
    When I open that repo's deploy-state
    Then I see the tdd skill at the tag it was deployed at
