# Skill Flow v1.0.0 Release Notes

Date: 2026-03-22
Version: `v1.0.0`

## Summary

`v1.0.0` marks the first stable release of `skill-flow` (formerly `skill-manager`), a terminal-first workflow control tower for AI agent skills.

This initial release provides TypeScript CLI with Ink TUI, Git source support, and basic skill management capabilities.

## Highlights

### 1. TypeScript CLI with Ink TUI

Built with React components using Ink, providing a rich terminal user interface for managing AI agent skills.

### 2. Git Source Support

Supports adding skills from Git repositories as a source, enabling version control and easy sharing of skill configurations.

### 3. Core Services Architecture

- `skill-manager.ts` / `skill-flow.ts`: Core workflow orchestration
- `source-service.ts`: Source management and discovery
- `inventory-service.ts`: Inventory tracking
- `deployment-planner.ts` / `deployment-applier.ts`: Deployment management
- `doctor-service.ts`: Health checks and diagnostics

### 4. Config UI

Full terminal UI for configuring skill flows, targets, and agent projections.

### 5. Test Coverage

Comprehensive test suite covering core functionality.

## User-visible Features

### CLI Commands

- `skill-flow add <source>`: Add a new skill source
- `skill-flow config`: Open configuration UI
- `skill-flow find <query>`: Find skills
- `skill-flow update`: Update existing sources

### Supported Sources

- Git repositories (local and remote)

### Supported Targets

- Claude Desktop
- Cursor
- Other AI agent platforms

## Verification

Commands run:

```bash
npm run build
npm test
```

## Installation

```bash
npm install -g skill-flow
```

Or use directly with npx:

```bash
npx skill-flow <command>
```
