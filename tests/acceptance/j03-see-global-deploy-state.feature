Feature: See global deploy-state with versions (J03)

  As someone who installs skills once for my whole machine, I want to see what is
  deployed globally and at which version, so that I am not opening
  ~/.apm/apm.lock.yaml by hand to find out.

  Scenario: I see what is deployed globally, at which version
    Given a skill deployed globally at tag v0.5.0
    When I open the global deploy-state
    Then I see the skill with its name and the human tag version

  Scenario: Nothing deployed globally shows an honest empty state
    Given nothing deployed globally
    When I open the global deploy-state
    Then I see an empty list, not an error

  Scenario: A broken global lockfile is surfaced as an error, never a blank list
    Given a malformed global lockfile
    When I open the global deploy-state
    Then I see a visible error instead of an empty list

  Scenario: The global read uses the server's own location, not a client path
    Given a skill deployed globally at tag v0.5.0
    When I open the global deploy-state with a bogus repo path in the query
    Then I still see the skill, because the server ignored the client path
