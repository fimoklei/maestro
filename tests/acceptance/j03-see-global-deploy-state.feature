Feature: See global deploy-state per detected tool (J03)

  As someone who installs skills once for my whole machine, I want to see what is
  deployed globally, grouped by the tools I actually have, so that I am not
  opening ~/.apm/apm.lock.yaml by hand and one tool's skills never silently show
  up under another.

  Scenario: A single-tool machine groups its skills under only that tool
    Given only Claude Code is installed on this machine
    And a skill deployed globally at tag v0.5.1
    When I open the global deploy-state
    Then I see the skill under Claude at its human tag version
    And Codex is not listed at all

  Scenario: A two-tool machine attributes each skill to the tool it was deployed for
    Given both Claude Code and Codex are installed on this machine
    And a two-tool skill and a Claude-only skill deployed globally
    When I open the global deploy-state
    Then the two-tool skill appears under both tools
    And the Claude-only skill appears under Claude but never under Codex

  Scenario: A detected tool with nothing deployed shows as an empty group
    Given both Claude Code and Codex are installed on this machine
    And a skill deployed globally at tag v0.5.1
    When I open the global deploy-state
    Then I see Codex listed as a recognised but empty group

  Scenario: Nothing deployed globally shows an honest empty state per tool
    Given only Claude Code is installed on this machine
    And nothing deployed globally
    When I open the global deploy-state
    Then I see Claude as an empty group, not an error

  Scenario: A broken global lockfile is surfaced as an error, never a blank list
    Given only Claude Code is installed on this machine
    And a malformed global lockfile
    When I open the global deploy-state
    Then I see a visible error instead of an empty list

  Scenario: The global read uses the server's own location, not a client path
    Given only Claude Code is installed on this machine
    And a skill deployed globally at tag v0.5.1
    When I open the global deploy-state with a bogus repo path in the query
    Then I still see the skill under Claude, because the server ignored the client path
