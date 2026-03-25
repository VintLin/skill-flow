# Skill Flow v1.0.5 Release Notes

Date: 2026-03-23
Version: `v1.0.5`

## Summary

`v1.0.5` adds CLI commands, enhances source lifecycle management, and improves TUI components.

This release introduces repair commands, enhanced doctor diagnostics, duplicate leaf detection, and a ConfigCoordinator bootstrap flow.

## Highlights

### 1. New CLI Commands

Added new CLI commands for better skill flow management and troubleshooting.

### 2. Source Lifecycle Enhancement

Improved source lifecycle management with better state handling and recovery mechanisms.

### 3. Repair Commands

New `repair` command and enhanced doctor diagnostics for identifying and fixing common issues.

### 4. ConfigCoordinator Bootstrap Flow

Implemented ConfigCoordinator bootstrap flow for more reliable startup and state initialization.

### 5. Duplicate Leaf Detection

Added detection and handling of duplicate leaf nodes in skill configurations.

### 6. TUI Component Improvements

Enhanced terminal UI components for better user experience.

## User-visible Behavior Changes

- New repair commands available for troubleshooting
- Better diagnostics from `doctor` service
- Improved startup reliability
- Enhanced TUI responsiveness

## Verification

Commands run:

```bash
npm run build
npm test
```

Result:

```text
Tests passing
```
