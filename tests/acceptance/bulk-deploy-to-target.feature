Feature: Bulk-deploy staged skills to one target
  As someone steering my agent setup, I stage a set of skills and push them all
  to one target in a single action, then read one report: what deployed, what
  was left untouched, and what needs my attention — a failure never stops the
  rest.

  Scenario: I bulk-deploy several staged skills globally and see them in my baseline
    Given the central inventory has the skills "tdd" and "review"
    And both Claude Code and Codex are installed on this machine
    When I bulk-deploy "tdd" and "review" globally
    Then the bulk deploy reports both as deployed at the latest tag
    And I see both skills in the global deploy-state

  Scenario: A failure mid-batch does not abort the rest
    Given the central inventory has the skills "tdd" and "review"
    And both Claude Code and Codex are installed on this machine
    But deploying "review" fails
    When I bulk-deploy "tdd" and "review" globally
    Then the report shows "tdd" deployed and "review" failed
    And I still see "tdd" in the global deploy-state

  Scenario: A content-diverged skill is flagged for attention, never overwritten
    Given the central inventory has the skills "tdd" and "review"
    And both Claude Code and Codex are installed on this machine
    But the deployed copy of "review" has diverged from its lockfile
    When I bulk-deploy "tdd" and "review" globally
    Then the report shows "tdd" deployed and "review" needing attention
