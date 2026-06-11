Feature: Deploy a skill globally (J07)

  As someone who wants a skill available across all my work, I want to deploy it
  globally for Claude Code and Codex from the cockpit, so that it is my baseline
  everywhere without running apm by hand — and without first registering a repo.

  Scenario: I deploy a skill globally and see it in my baseline, with no repo registered
    Given the central inventory has the skill "tdd"
    And no repo is registered
    When I deploy "tdd" globally
    Then the global deploy succeeds at the latest tag
    And I see "tdd" in the global deploy-state at that version

  Scenario: A global deploy is refused when my local skill has diverged from its tag
    Given the central inventory has the skill "tdd"
    But my local copy of "tdd" has diverged from its latest tag
    When I deploy "tdd" globally
    Then the global deploy is refused with a tag-and-push message
    And the global deploy-state stays empty
