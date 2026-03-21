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

```bash
git clone https://github.com/VintLin/skill-manager.git
cd skill-manager
npm install
npm run build
npm link  # Optional: global install
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

## Command Reference

| Command | Description |
|---|---|
| `add <source>` | Add Git source (supports local path, `owner/repo`, https/ssh URL) |
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

**Projection Strategy**
Symlinks preferred, file copies when necessary. Target directories are projections only; true state managed by lock.json.

## Supported Agents

Claude Code · Codex · Cursor · GitHub Copilot · Gemini CLI · OpenCode · OpenClaw · Pi · Windsurf · Roo Code · Cline · Amp · Kiro

Customize target paths via environment variables (e.g., `SKILL_FLOW_TARGET_CLAUDE_CODE`).

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
