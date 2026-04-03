# RELEASE v1.3.2

## Summary

- `v1.3.2` is a patch release focused on source import stability and npm package completeness.
- Compared with `v1.3.1`, it adds GitLab archive fallback coverage, keeps legacy lock files from blocking add preview, and makes the published CLI package carry its user-facing docs and license files.

## Highlights

### 1. More reliable GitLab import flows

- Git-based source imports now support a GitLab archive fallback path in the shared runtime.
- GUI import flows follow the same behavior, so GitLab sources are less likely to fail when a direct clone path is unavailable.

### 2. Safer preview handling for existing state

- Add preview now tolerates legacy lock files instead of treating them as a hard failure.
- This keeps state preparation and projection checks working for users carrying forward older local data.

### 3. Cleaner npm package output

- The published CLI package now includes `README.md`, `README.zh.md`, and `LICENSE`.
- Release helper scripts now prepare and restore those package files during pack flows so npm output stays aligned with the repository.

## User-visible changes

- GitLab-based imports behave more predictably in desktop and shared runtime flows.
- Existing local state with older lock files is less likely to interrupt add preview.
- npm consumers get bundled usage docs and license files directly inside the published CLI package.

## Release Artifacts

- `skill-flow-1.3.2.tgz`
