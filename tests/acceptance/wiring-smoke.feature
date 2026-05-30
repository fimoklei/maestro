# Bootstrap wiring-smoke — bewust GEEN echte subjob. De echte J01–J09 features
# krijgen elk hun eigen jNN-<slug>.feature wanneer ze landen (zie
# .claude/rules/testing.md: "acceptatie = één .feature per subjob"). Dit voorbeeld
# vult de acceptatiebaan bij bootstrap zonder een nep-subjob te claimen.
Feature: Cockpit wiring smoke

  Scenario: the cockpit server reports healthy
    Given the cockpit server is wired to core
    When I ask the server for its health
    Then it reports that it is healthy
