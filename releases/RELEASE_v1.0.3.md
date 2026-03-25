# Skill Flow v1.0.3 Release Notes

Date: 2026-03-22
Version: `v1.0.3`

## Summary

`v1.0.3` introduces terminology refinements and documentation improvements.

This release renames "workflow group" to "skills group" across the codebase for clearer terminology, adds architecture documentation, and improves the README with simplified language.

## Highlights

### 1. Terminology Update: "Skills Group"

Renamed "workflow group" to "skills group" throughout the codebase for more intuitive naming.

### 2. Architecture Documentation

Added ASCII diagram showing skill-flow architecture in the README for better understanding of the system design.

### 3. README Improvements

- Replaced AI jargon with plain language
- Simplified installation and usage instructions
- Added better npm/npx usage documentation

### 4. Node Engine Requirement

Added explicit Node.js engine requirement (`>=20`) to ensure compatibility.

## User-visible Behavior Changes

- Menu labels and documentation now use "skills group" instead of "workflow group"
- Easier to understand README for new users
- Clearer installation instructions

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
