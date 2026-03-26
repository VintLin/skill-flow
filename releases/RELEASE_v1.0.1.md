# Skill Flow v1.0.1 Release Notes

Date: 2026-03-22
Version: `v1.0.1`

## Summary

`v1.0.1` expands source discovery and introduces ClawHub integration for finding community skills.

This release adds source expansion capabilities, better discovery mechanisms, and utility functions for finding and managing skills across multiple platforms.

## Highlights

### 1. Source Expansion and Discovery

New expansion logic allows `skill-flow` to discover skills more comprehensively from various sources, including nested directories and complex repository structures.

### 2. ClawHub Integration

Added `clawhub.ts` utility for integrating with ClawHub - a community platform for sharing and discovering AI agent skills.

### 3. Find Command Enhancement

New `find-command.ts` utility that provides better command discovery and matching for skill queries.

### 4. Source ID Improvements

Enhanced `source-id.ts` with better naming and deduplication logic to prevent conflicts.

### 5. Format and Output Improvements

Better formatting for skill listings and user output across the CLI.

## User-visible Behavior Changes

### Add Flow

- Better handling of duplicate skills
- Improved output naming conventions
- More accurate source discovery

### Find Flow

- Enhanced query matching
- Better result ranking and display

## Repository Updates

- Renamed repository from `skill-manager` to `skill-flow`
- Updated package metadata with better description, keywords, and author information

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
