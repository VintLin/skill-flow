# Skill Flow

> **Workflow-first management for AI agent skills.**
> Grouped workflows · Multi-target projection · Explicit state · Drift diagnosis

![img](img/img-1.jpg)

[中文文档](./README.zh.md)

[![Node.js Version](https://img.shields.io/node/v/skill-flow?style=flat-square)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square)](./LICENSE)

As your AI agent skills grow, management becomes chaotic: one Git source contains multiple related skills, projections scatter across different agents, updates and troubleshooting become difficult.

`skill-flow` reorganizes skill management around workflows: add skill groups from Git sources, select projection targets, update uniformly, diagnose drift. Keep skill management clear, controlled, and efficient.

## Key Features

**Workflow-Based Grouping**
One Git source = one workflow group. Related skills stay together, updates and maintenance happen at the workflow level.

**Multi-Target Projection**
Configure once, project to multiple agents (Claude Code, Cursor, Windsurf, and 13+ targets).

**Interactive Terminal UI**
Intuitive TUI: view groups → select skills → choose targets → save configuration.

**Explicit State Tracking**
`manifest.json` records your intent, `lock.json` records actual deployment state. Clear and queryable.

**Health Diagnosis**
`doctor` command detects broken links, drift, and conflicts with precision.

## Installation

Requires Node.js >= 20, currently optimized for macOS.

Install from npm:

```bash
npm install -g skill-flow
skill-flow --help
```

Run without a global install:

```bash
npx skill-flow --help
```

Install from source for local development:

```bash
git clone https://github.com/VintLin/skill-flow.git
cd skill-flow
npm install
npm run build
npm link
```

## Quick Start

```bash
# Add a skill source
skill-flow add /path/to/skills-repo

# View workflow groups
skill-flow list

# Interactive configuration (select skills and targets)
skill-flow config

# Update all sources
skill-flow update --all

# Health check
skill-flow doctor

# Remove a workflow group
skill-flow uninstall my-source-id
```

`add <source>` supports local paths, `owner/repo`, full https/ssh Git URLs, GitHub tree URLs, and `clawhub:<slug>[@version]`.

## Command Reference

| Command | Description |
|---|---|
| `add <source>` | Add a source from Git or ClawHub |
| `find <query>` | Search installed skills, built-in Git catalogs, and ClawHub |
| `search <query>` | Alias of `find` |
| `list` | Show workflow groups |
| `config` | Open interactive configuration UI |
| `update [sourceId] --all` | Update sources and re-project |
| `doctor` | Diagnose projection health |
| `uninstall <sourceIds...>` | Remove workflow groups and projections |

## How It Works

**State Management**
- `~/.skillflow/manifest.json` - Your configuration intent
- `~/.skillflow/lock.json` - Actual deployment state
- `~/.skillflow/source/git/<source-id>/` - Git source cache
- `~/.skillflow/source/clawhub/<source-id>/` - ClawHub source cache
- `~/.skillflow/catalog/git/<source-id>/` - Built-in Git catalog cache

**Projection Strategy**
Symlinks preferred, file copies when necessary. Target directories are projections only; true state managed by lock.json.

## Supported Agents

Claude Code · Codex · Cursor · GitHub Copilot · Gemini CLI · OpenCode · OpenClaw · Pi · Windsurf · Roo Code · Cline · Amp · Kiro

Customize target paths via environment variables (e.g., `SKILL_FLOW_TARGET_CLAUDE_CODE`).

Broader ecosystem path references, including project-level rules and instructions paths, are tracked in [docs/refrences/agent-skill-paths.md](./docs/refrences/agent-skill-paths.md).

## Built-in Discovery Catalogs

`find/search` searches built-in Git catalogs in addition to local installed skills and ClawHub.

| Repository | Description | Stars | Skills |
| --- | --- | ---: | ---: |
| [anthropic-skills](https://github.com/anthropics/skills) | Official Agent Skills from Anthropic | 95,957 | 18 |
| [superpowers](https://github.com/obra/superpowers) | Agentic skills framework & development methodology | 89,816 | 14 |
| [everything-claude-code](https://github.com/affaan-m/everything-claude-code) | Performance optimization system for Claude Code, Codex, and beyond | 81,392 | 147 |
| [agency-agents](https://github.com/msitarzewski/agency-agents) | Specialized expert agents with personality and proven deliverables | 50,749 | — |
| [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | Design intelligence for building professional UI/UX | 43,112 | 7 |
| [antigravity-awesome-skills](https://github.com/sickn33/antigravity-awesome-skills) | 1,000+ battle-tested skills for Claude Code, Cursor, and more | 25,047 | 1,258 |
| [marketingskills](https://github.com/coreyhaines31/marketingskills) | Marketing skills — CRO, copywriting, SEO, analytics, growth | 14,099 | 33 |
| [agentskills](https://github.com/agentskills/agentskills) | Specification and documentation for Agent Skills | 13,342 | — |
| [taste-skill](https://github.com/Leonxlnx/taste-skill) | Gives your AI good taste — stops generic, boring output | 3,389 | 5 |
| [affiliate-skills](https://github.com/Affitor/affiliate-skills) | Full affiliate marketing funnel: research to deploy | 99 | 47 |
| [skills](https://github.com/luongnv89/skills) | Reusable skills to supercharge your AI agents | 1 | 29 |
| [awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) | Community Claude skills collection | — | — |
| [myclaude](https://github.com/cexll/myclaude) | Personal Claude skills collection | — | — |
| [baoyu-skills](https://github.com/JimLiu/baoyu-skills) | Community skills collection | — | — |
| [dbskill](https://github.com/dontbesilent2025/dbskill) | Database-focused skills collection | — | — |
| [gstack](https://github.com/garrytan/gstack) | Gstack skills and workflows | — | — |
| [impeccable](https://github.com/pbakaus/impeccable) | Design and taste skills collection | — | — |
| [frontend-slides](https://github.com/zarazhangrui/frontend-slides) | Frontend presentation skills collection | — | — |

## Development

```bash
npm install
npm run dev     # Development mode
npm run build   # Build
npm test        # Run tests
```

Tech stack: TypeScript + Vitest + Ink TUI

## License

Apache License 2.0. See [LICENSE](./LICENSE).
