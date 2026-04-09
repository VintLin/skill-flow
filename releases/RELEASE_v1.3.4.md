# RELEASE v1.3.4

## Summary

- `v1.3.4` is a patch release focused on repairing the npm installation path for the CLI.
- Compared with `v1.3.3`, it keeps the target and desktop improvements from the previous release, but changes how the published CLI package is assembled so npm users can install and upgrade successfully again.

## Highlights

### 1. Global npm installs work again

- The published `skill-flow` package now bundles the internal runtime code it needs instead of asking npm to fetch unpublished internal workspace packages.
- This removes the `E404` failure path that blocked `npm install -g skill-flow` for new users and upgrades.

### 2. More reliable release packaging

- The CLI release flow now rewrites the publish-time manifest so only public runtime dependencies remain in the tarball.
- Additional release verification now checks workspace version alignment and npm package output before publishing.

### 3. Existing workflows stay the same

- The CLI command surface, TUI behavior, and the built-in target improvements delivered in `v1.3.3` are unchanged.
- From a user perspective, the main difference is that installing or upgrading from npm is reliable again.

## User-visible changes

- `npm install -g skill-flow` no longer fails because npm cannot find internal `@skill-flow/*` packages.
- Fresh installs and upgrades from npm behave more like a normal single-package CLI install.
- Release quality is easier to trust because the published tarball is now self-contained enough for the supported install path.

## Release Artifacts

- `skill-flow-1.3.4.tgz`
