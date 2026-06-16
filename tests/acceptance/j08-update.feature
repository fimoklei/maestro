Feature: Update a deployed skill to latest, one click (J08)

  As someone keeping repos current, when central changes I want to bring a
  deployed skill up to the latest tag from the cockpit, so that I am not bumping
  pins by hand. Update is mechanically a re-deploy at the latest published tag;
  the deploy-state and drift then read the skill as current.

  Scenario: I update a behind skill and it is no longer behind
    Given a registered repo with "tdd" deployed at v0.5.0
    And apm reports "tdd" is behind the latest tag v0.5.1
    When I update "tdd" in that repo
    Then the update succeeds at v0.5.1
    And the repo's deploy-state reads "tdd" at v0.5.1
    And the repo's drift reports nothing behind
