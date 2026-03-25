# Skill Flow v1.0.5 Release Notes

Date: 2026-03-23
Version: `v1.0.5`

## Summary

`v1.0.5` is primarily a version stabilization release. The actual feature development for this cycle was completed in earlier commits.

This release adds repair commands, enhanced doctor diagnostics, duplicate leaf detection, ConfigCoordinator bootstrap flow, and CLI command improvements.

## Highlights

### 1. CLI Commands Enhancement

Added new CLI commands and improved existing ones for better skill flow management.

### 2. Source Lifecycle Improvements

Enhanced source lifecycle management with better state handling and recovery mechanisms.

### 3. Repair Commands

New repair commands and enhanced doctor diagnostics for identifying and fixing common issues in skill configurations.

### 4. Duplicate Leaf Detection

Added detection and handling of duplicate leaf nodes in skill configurations.

### 5. ConfigCoordinator Bootstrap Flow

Implemented ConfigCoordinator bootstrap flow for more reliable startup and state initialization.

### 6. TUI Component Improvements

Enhanced terminal UI components for better user experience.

## User-visible Behavior Changes

- New repair commands available for troubleshooting
- Better diagnostics from doctor service
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
