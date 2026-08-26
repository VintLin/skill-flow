# Skill Flow

<div align="center">

Turn scattered AI agent skills into organized workflows.

[中文](./README.zh.md) · [日本語](./README.ja.md)

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20-43853d?style=flat-square)](https://nodejs.org)
[![npm Version](https://img.shields.io/npm/v/skill-flow?style=flat-square)](https://www.npmjs.com/package/skill-flow)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square)](./LICENSE)

<img src="./img/img-icon.png" alt="Skill Flow icon" width="120" />

</div>

Install, manage, and share skills across every major coding agent — Claude Code, Cursor, Grok Build, Copilot, Kimi Code, WorkBuddy, CodeBuddy, ZCode, and more.

Search and import skills from skills.sh, GitHub, or local sources. Deploy to multiple agents at once. Keep everything organized and up to date.

![Skill Flow desktop overview](./img/img-home.png)

## Why This Exists

Installing skills one by one breaks down at scale:

- Repos contain multiple related skills, but you install them separately
- Different agents expect different locations
- Updates drift silently
- Unmanaged folders accumulate
- Nobody tracks what's actually deployed

`skill-flow` preserves the workflow group. One source remains one cohesive unit—inspect it, select skills, deploy to multiple targets, update cleanly, and always know your state.

## What You Get

- **Grouped source management**: local, Git, and skills.sh sources all flow through the same import model.
- **Multi-agent deployment**: deploy one selected skill set to Claude Code, Codex, Cursor, Grok Build, Gemini CLI, OpenCode, OpenClaw, Hermes Agent, MiniMax Code, Kimi Code, WorkBuddy, CodeBuddy, Trae, Trae CN, Windsurf, ZCode, and more.
- **Interactive config flow**: Ink-based TUI for add/config flows, selection state, review, and repair.
- **Desktop app on macOS 15+**: SwiftUI main window, import view, detail panel, settings, and menu bar quick config.
- **Safe desktop quit**: Command-Q cancels a running managed update/import, restores the incomplete group, and recovers interrupted work before the next launch continues.
- **Explicit state**: `manifest.json` stores intent, `lock.json` stores resolved inventory and deployments.
- **Bridge protocol**: machine-readable desktop/helper entrypoint via `skill-flow bridge --json`.
- **Repair and diagnosis**: `doctor`, `repair-source`, `repair-state`, and `repair-targets` cover the parts that usually rot first.

## Interface Preview

| Menu Bar | Import |
| --- | --- |
| ![Menu bar quick config](./img/img-menu.png) | ![Import screen](./img/img-import.png) |

| Detail | Settings |
| --- | --- |
| ![Detail screen](./img/img-detail.png) | ![Settings screen](./img/img-setting.png) |

## Quick Start

### Install

```bash
npm install -g skill-flow
skill-flow --help
```

Or run without a global install:

```bash
npx skill-flow --help
```

### Desktop prerequisites

Skill Flow Desktop release builds include a bundled native Node.js/npm/npx toolchain for the desktop helper and skills.sh imports, so double-click launch does not depend on shell-managed Node paths from tools like `asdf` or `nvm`.

- `git` is required for non-GitHub Git sources

Development builds and damaged release bundles can still fall back to system Node.js 20 or newer with npm/npx. If the desktop app detects a missing dependency, it will surface an actionable error and point back to this section.

### Typical flow

```bash
# Add a source
skill-flow add garrytan/gstack

# Review installed workflow groups
skill-flow list

# Migrate or mirror a known source set
skill-flow import-manifest skill-group-install-manifest.json --dry-run
skill-flow import-manifest skill-group-install-manifest.json --apply --skip-existing
skill-flow only garrytan-gstack --targets codex,cline --all-skills
skill-flow list --ids --warnings

# Open the interactive config UI
skill-flow config

# Search installed skills, built-in catalogs, and skills.sh
skill-flow find browser

# Update one source or all sources
skill-flow update garrytan-gstack
skill-flow update --all

# Diagnose drift or broken projections
skill-flow doctor
```

### Machine bridge

The desktop app and helper tooling talk to the CLI through a versioned JSON protocol:

```bash
printf '%s' '{"protocolVersion":"1.0","command":"list"}' | skill-flow bridge --json
```

## Supported Sources

`skill-flow add <source>` supports:

- local folders
- `owner/repo` GitHub shorthand
- full HTTPS Git URLs
- SSH Git URLs
- GitHub tree URLs
- `clawhub:<slug>[@version]`

Examples:

```bash
skill-flow add ~/code/my-skills
skill-flow add garrytan/gstack
skill-flow add https://github.com/garrytan/gstack.git
skill-flow add git@github.com:garrytan/gstack.git
skill-flow add https://github.com/garrytan/gstack/tree/main/skills
skill-flow add clawhub:example/skill-pack
skill-flow add clawhub:example/skill-pack@1.2.3
```

Use `--path <repoSubpath>` when the repo is large but your default selection should start from one subtree.

## Supported Targets

Current built-in targets:

- Claude Code
- Codex
- Cursor
- Grok Build
- GitHub Copilot
- Gemini CLI
- OpenCode
- OpenClaw
- Hermes Agent
- MiniMax Code
- Kimi Code
- WorkBuddy
- CodeBuddy
- Pi
- Trae
- Trae CN
- Windsurf
- Roo Code
- Cline
- Amp
- Kiro
- ZCode

Target paths can be overridden with `SKILL_FLOW_TARGET_*` environment variables.

## Command Map

| Command | What it does |
| --- | --- |
| `add <source>` | Import a source and choose skills/targets |
| `list` | Show workflow groups and current health |
| `list --ids --warnings` | Show source IDs and warning details for migration/debugging |
| `enable <sourceIds...> --targets <ids> --all-skills` | Enable registered groups for targets; `--all-skills` fills empty selections first |
| `disable <sourceIds...>` | Turn registered groups OFF without uninstalling |
| `only <sourceIds...> --targets <ids> --all-skills` | Keep only selected groups ON; `--all-skills` fills empty selections first |
| `import-manifest <file>` | Batch import source manifests; JSON entries with `targets` require `skills: "all"` |
| `find <query>` / `search <query>` | Search installed skills, built-in Git catalogs, and skills.sh |
| `config` | Open the interactive configuration UI |
| `update [sourceId] --all` | Refresh one source or all registered sources |
| `adopt <paths...> --name <name>` | Catalogue existing skills owned by another installer without copying or deploying them |
| `external status [sourceId]` | Refresh an external source and compare configured versions |
| `external update <sourceId> --confirm-external-update` | Run the explicitly configured external updater |
| `remove <sourceIds...>` | Unregister groups; external files are left untouched |
| `doctor` | Diagnose drift, missing paths, and projection problems |
| `migrate-state --to v2 [--dry-run]` | Inspect or migrate the local state root to schema v2 |
| `repair-source [sourceId] --all` | Rebuild source checkout metadata |
| `repair-state [sourceId] --all` | Rebuild source-side state |
| `repair-targets [sourceId] --all` | Repair projected target contents |
| `uninstall <sourceIds...>` | Remove groups and their deployments |
| `bridge --json` | Execute machine protocol requests |

Externally managed groups are observation-only. They cannot be enabled for
targets, repaired, or updated by the regular `update` command.

## How State Works

`skill-flow` keeps one state root, defaulting to `~/.skillflow/`.

- `manifest.json`: what you want
- `lock.json`: what is actually installed
- `source/local/*`: imported local or adopted unmanaged sources
- `source/git/*`: Git source cache
- `source/clawhub/*`: skills.sh source cache
- `catalog/git/*`: built-in Git catalog cache

Target directories are deployment outputs, not the source of truth.

### State schema migration

Use a dry run before applying a schema migration:

```bash
skill-flow migrate-state --to v2 --dry-run
skill-flow migrate-state --to v2
SKILL_FLOW_STATE_ROOT=/custom/path skill-flow migrate-state --to v2
```

The default state root is `~/.skillflow/`. A normal migration creates a backup named `<stateRoot>.backup-YYYYMMDD-HHMMSS`, rewrites the authority files, and prunes rebuildable cache under `catalog/`; cache is rebuilt by later CLI or desktop reads. Target directories are not authoritative and should not be used to reconstruct state. If target folders look stale after migration, run `skill-flow repair-targets --all`.

To roll back, stop Skill Flow, move the backup state root back into place, then run `skill-flow migrate-state --to v2 --dry-run` or use the desktop migration status check before applying migration again.

## FAQ

### Where does `skill-flow` store data?

By default, state lives under `~/.skillflow/`. `manifest.json` records the workflow you want, `lock.json` records the resolved inventory and deployments, and the `source/*` directories cache imported sources.

### Does deployment overwrite files in target agent folders?

`skill-flow` treats target directories as deployment outputs. The selected skills for a workflow group are projected there from state, so you should treat those files as generated results rather than edit them as the source of truth.

### When should I use `doctor` vs `repair-*`?

Start with `skill-flow doctor` when something looks wrong and you want a diagnosis first. Use `repair-source` when source checkout metadata is broken, `repair-state` when source-side state needs rebuilding, and `repair-targets` when deployed target contents have drifted from the current state.

## Monorepo Layout

```text
.
├── apps
│   ├── cli/                    # published npm package and CLI entrypoint
│   └── desktop-mac/            # SwiftUI desktop app for macOS 15+
├── packages
│   ├── core-engine/            # inventory, deployment, doctor, bootstrap services
│   ├── domain/                 # domain models and core types
│   ├── integration/            # Git, GitHub, skills.sh, path, naming integrations
│   ├── query/                  # shared runtime and bridge-facing orchestration
│   ├── shared-types/           # bridge protocol types
│   ├── storage/                # manifest, lock, preferences, cache persistence
│   └── tui/                    # Ink add/find/config UI
├── docs/                       # architecture, contributor docs, references, plans
└── releases/                   # release notes
```

## Development

```bash
npm install
npm run build
npm test
```

CLI dev loop:

```bash
npm run -w skill-flow dev -- --help
```

Desktop dev loop:

```bash
npm run build
cd apps/desktop-mac
swift build
swift test
```

Debugging the desktop shell against a local CLI build:

```bash
export SKILL_FLOW_DESKTOP_HELPER_OVERRIDE=/absolute/path/to/apps/cli/dist/cli.js
```

Unsigned desktop packaging:

```bash
scripts/release/package-desktop-mac.sh --arch arm64
scripts/release/package-desktop-mac.sh --arch x86_64
scripts/release/package-desktop-mac.sh --arch universal
```

Open-source macOS release flow:

```bash
scripts/release/release-github.sh all
```

Unsigned macOS install notes:

- Apple Silicon Macs can use `Skill-Flow-arm64.dmg` or `Skill-Flow-universal.dmg`.
- Intel Macs can use `Skill-Flow-x86_64.dmg` or `Skill-Flow-universal.dmg`.
- Copy `Skill Flow.app` to `Applications`, then open it once with Finder's `Open` action if Gatekeeper blocks it.
- If macOS still marks the app as quarantined, run:

```bash
sudo xattr -dr com.apple.quarantine "/Applications/Skill Flow.app"
```

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=VintLin/skill-flow&type=Date)](https://www.star-history.com/#VintLin/skill-flow&Date)

## License

Apache License 2.0. See [LICENSE](./LICENSE).
