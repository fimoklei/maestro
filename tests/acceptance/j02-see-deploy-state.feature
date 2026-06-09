Feature: See per-repo deploy-state with versions (J02)

  As someone working across several repos, I want to see which primitives are
  deployed in each repo and at which version, so that I am not guessing what
  each project runs.

  Scenario: I see what is deployed in a repo, at which version
    Given a registered repo with a skill deployed at tag v0.5.0
    When I open that repo's deploy-state
    Then I see the skill with its name and the human tag version

  Scenario: A repo with nothing deployed shows an honest empty state
    Given a registered repo with nothing deployed
    When I open that repo's deploy-state
    Then I see an empty list, not an error

  Scenario: A repo Maestro does not know is refused before any file is read
    Given a repo that has a lockfile but was never registered
    When I open that repo's deploy-state
    Then I am refused and none of its lockfile leaks back

  Scenario: A broken lockfile is surfaced as an error, never a blank list
    Given a registered repo whose lockfile is malformed
    When I open that repo's deploy-state
    Then I see a visible error instead of an empty list
