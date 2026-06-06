# Bootstrap wiring-smoke — deliberately NOT a real subjob. The real J01–J09
# features each get their own jNN-<slug>.feature when they land (see
# .claude/rules/testing.md: "acceptance = one .feature per subjob"). This example
# fills the acceptance lane at bootstrap without claiming a fake subjob.
Feature: Cockpit wiring smoke

  Scenario: the cockpit server reports healthy
    Given the cockpit server is wired to core
    When I ask the server for its health
    Then it reports that it is healthy
