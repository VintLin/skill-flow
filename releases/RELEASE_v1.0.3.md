# Skill Flow v1.0.3 Release Notes

Date: 2026-03-22
Version: `v1.0.3`

## Summary

`v1.0.3` focuses on terminology refinement, documentation improvements, and developer experience enhancements.

This release renames "workflow group" to "skills group" throughout the codebase for clearer terminology, adds architecture documentation, and improves the overall developer experience.

## Highlights

### 1. Terminology Update: "Skills Group"

Renamed "workflow group" to "skills group" across the codebase for more intuitive and consistent naming:

- `src/cli.tsx`
- `src/services/doctor-service.ts`
- `src/services/skill-flow.ts`
- `src/services/source-service.ts`
- `src/tests/skill-flow.test.ts`
- `src/tui/config-app.tsx`
- `src/utils/format.ts`

### 2. Node.js Engine Requirement

Added explicit Node.js engine requirement (`>=20`) to ensure compatibility with modern JavaScript features.

### 3. README Improvements

- Added ASCII diagram showing skill-flow architecture
- Replaced AI jargon with plain language in README
- Simplified tagline
- Improved overall documentation clarity

### 4. NPM Package Restrictions

Restricted npm package contents to only include necessary files for distribution.

### 5. Image Assets Update

Updated image assets for better visual presentation.

## User-visible Behavior Changes

- Menu labels and documentation now use "skills group" instead of "workflow group"
- Easier to understand README for new users
- Clearer installation instructions
- Guaranteed Node.js >=20 compatibility

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
