// Maestro cockpit — demo data (mirrors the MVP1 brief: inventory / deploy-state / compose).
window.COCKPIT_DATA = {
  inventory: [
    {
      type: "skill",
      name: "code-review",
      version: "1.4.0",
      desc: "Structured review checklist with severity tiers",
    },
    {
      type: "skill",
      name: "react-patterns",
      version: "1.2.0",
      desc: "Component conventions, hooks rules, file layout",
    },
    {
      type: "skill",
      name: "commit-style",
      version: "2.1.0",
      desc: "Conventional commits with scoped prefixes",
    },
    {
      type: "skill",
      name: "api-design",
      version: "0.9.1",
      desc: "REST resource naming and error envelope rules",
    },
    {
      type: "hook",
      name: "pre-commit-lint",
      version: "1.0.2",
      desc: "Run linter before every commit",
    },
    {
      type: "hook",
      name: "secret-scan",
      version: "1.3.0",
      desc: "Block commits containing credentials",
    },
    {
      type: "mcp",
      name: "github-mcp",
      version: "3.2.0",
      desc: "Issues, PRs and reviews from the agent",
    },
    {
      type: "mcp",
      name: "postgres-mcp",
      version: "1.1.0",
      desc: "Read-only schema and query access",
    },
    {
      type: "bundle",
      name: "frontend",
      version: "2.0.0",
      desc: "react-patterns + code-review + pre-commit-lint",
    },
    {
      type: "bundle",
      name: "backend",
      version: "1.1.0",
      desc: "api-design + postgres-mcp + secret-scan",
    },
  ],
  targets: [
    {
      key: "claude-code",
      title: "Claude Code",
      kind: "global",
      deployed: [
        {
          name: "commit-style",
          version: "2.1.0",
          central: "2.1.0",
          drift: false,
        },
        {
          name: "code-review",
          version: "1.4.0",
          central: "1.4.0",
          drift: false,
        },
        {
          name: "github-mcp",
          version: "3.2.0",
          central: "3.2.0",
          drift: false,
        },
      ],
    },
    {
      key: "codex",
      title: "Codex",
      kind: "global",
      deployed: [
        {
          name: "commit-style",
          version: "2.0.0",
          central: "2.1.0",
          drift: true,
        },
        {
          name: "secret-scan",
          version: "1.3.0",
          central: "1.3.0",
          drift: false,
        },
      ],
    },
    {
      key: "acme-web",
      title: "~/dev/acme-web",
      kind: "local",
      deployed: [
        {
          name: "react-patterns",
          version: "1.0.0",
          central: "1.2.0",
          drift: true,
        },
        {
          name: "code-review",
          version: "1.4.0",
          central: "1.4.0",
          drift: false,
        },
        {
          name: "pre-commit-lint",
          version: "1.0.2",
          central: "1.0.2",
          drift: false,
        },
      ],
    },
    {
      key: "api-gateway",
      title: "~/dev/api-gateway",
      kind: "local",
      deployed: [
        {
          name: "api-design",
          version: "0.9.1",
          central: "0.9.1",
          drift: false,
        },
        {
          name: "secret-scan",
          version: "1.1.0",
          central: "1.3.0",
          drift: true,
        },
        {
          name: "postgres-mcp",
          version: "1.1.0",
          central: "1.1.0",
          drift: false,
        },
      ],
    },
    {
      key: "data-pipeline",
      title: "~/dev/data-pipeline",
      kind: "local",
      deployed: [
        {
          name: "commit-style",
          version: "2.1.0",
          central: "2.1.0",
          drift: false,
        },
      ],
    },
  ],
};
