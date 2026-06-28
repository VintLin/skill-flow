# Desktop UI Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `apps/desktop` to near-parity with the current `apps/desktop-mac` page structure and key interactions for `Home`, `Import`, `Detail`, and `Settings` before any cutover work resumes.

**Architecture:** Keep the existing Tauri shell, bridge boundary, and desktop state model. Do not redesign the product. Instead, port the missing page structure and behavior from `apps/desktop-mac` into focused React/Tauri components, and raise tests from "text exists" checks to structure-and-workflow checks that reflect the original desktop shell.

**Tech Stack:** TypeScript, React, Vite, Tauri 2, Vitest, existing `apps/desktop` state/view-model layer, `apps/desktop-mac` as the parity reference

---

## Current Gap Summary

- `Home`
  - Current React page is a simplified list view.
  - Missing the original `MainView` top bar, logo/title, search field, project scope controls, route-aware header behavior, and structured content layout.
- `Import`
  - Current React page only covers a simple form and card list.
  - Missing centered empty/loading/error states, recommendation rails, grid layout, richer card presentation, and auto-preview behavior.
- `Detail`
  - Current React page renders data as a flat content block.
  - Missing the original sidebar, overview-vs-skill layout, header metadata, tag rail, agent rail, and document-area composition.
- `Settings`
  - Current React page only shows a few read-only fields.
  - Missing appearance controls, language/accent/log-level dropdowns, agent display ordering, update actions, and maintenance actions.

## File Structure

### Existing files to modify

- `apps/desktop/src/app/App.tsx`
  - keep routing stable while letting screen containers grow toward parity
- `apps/desktop/src/screens/home-screen.tsx`
  - replace the simplified list page with a `MainView`-style layout
- `apps/desktop/src/screens/import-screen.tsx`
  - add original import page presentation states and recommendation/search layouts
- `apps/desktop/src/screens/detail-screen.tsx`
  - add original sidebar, header, and document-area structure
- `apps/desktop/src/screens/settings-screen.tsx`
  - add sectioned controls and action rows
- `apps/desktop/src/components/group-card.tsx`
  - extend card structure only as needed for page parity
- `apps/desktop/src/components/group-tags.tsx`
  - support home/import/detail tag presentation needs
- `apps/desktop/src/components/markdown-document.tsx`
  - support detail document rendering layout
- `apps/desktop/src/components/desktop-motion.tsx`
  - keep motion tokens aligned where parity depends on them
- `apps/desktop/src/view-models/home-view-model.ts`
  - expose page-level data needed by the original home layout
- `apps/desktop/src/view-models/import-view-model.ts`
  - expose recommendation/search presentation state needed by the original import layout
- `apps/desktop/src/view-models/detail-view-model.ts`
  - expose sidebar/header/document state needed by the original detail layout
- `apps/desktop/src/view-models/settings-view-model.ts`
  - expose section-level settings controls and actions
- `apps/desktop/src/i18n/en.ts`
  - add any missing parity keys used by new page structure
- `apps/desktop/src/i18n/zh.ts`
  - add matching parity keys
- `apps/desktop/src/tests/home-screen.test.tsx`
  - replace simplified assertions with structure-and-workflow coverage
- `apps/desktop/src/tests/import-screen.test.tsx`
  - cover recommendation/search layouts and state presentation
- `apps/desktop/src/tests/detail-screen.test.tsx`
  - cover sidebar/header/document structure
- `apps/desktop/src/tests/settings-screen.test.tsx`
  - cover sectioned settings surface and actions
- `docs/plan/cross-platform-desktop/DESKTOP_CONTRACT.md`
  - update only if parity requirements need to be made explicit

### New files to create

- `docs/plan/cross-platform-desktop/UI_PARITY_GAP.md`
  - explicit parity baseline between `apps/desktop-mac` and `apps/desktop`
- `apps/desktop/src/screens/home-main-view.tsx`
  - extracted route-aware home shell modeled after `desktop-mac` `MainView`
- `apps/desktop/src/components/desktop-top-bar.tsx`
  - reusable top-bar surface for home/import/settings/detail route states
- `apps/desktop/src/components/empty-state.tsx`
  - centered empty/loading/error chrome shared by import/detail/settings where needed
- `apps/desktop/src/components/settings-section.tsx`
  - minimal section wrapper for settings parity
- `apps/desktop/src/components/detail-sidebar.tsx`
  - focused sidebar for group and skill selection
- `apps/desktop/src/components/detail-header.tsx`
  - focused header surface for group and skill detail states

## Task 1: Freeze The UI Gap Baseline

**Files:**
- Create: `docs/plan/cross-platform-desktop/UI_PARITY_GAP.md`
- Read: `apps/desktop/src/screens/home-screen.tsx`
- Read: `apps/desktop/src/screens/import-screen.tsx`
- Read: `apps/desktop/src/screens/detail-screen.tsx`
- Read: `apps/desktop/src/screens/settings-screen.tsx`
- Read: `apps/desktop-mac/Sources/DesktopApp/Screens/Home/HomeScreen.swift`
- Read: `apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift`
- Read: `apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreen.swift`
- Read: `apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreen.swift`
- Read: `apps/desktop-mac/Sources/DesktopApp/Screens/Settings/SettingsView.swift`

- [ ] **Step 1: Write the parity gap document before touching screen code**

```md
# Desktop UI Parity Gap

## Home

- Current React page only renders a title, a few actions, and a flat source list.
- Missing top bar, search field, route-aware header, project scope controls, and structured home content.

## Import

- Current React page lacks centered empty/loading/error states.
- Missing recommendation rails, grid layout, richer card presentation, and preview-driven presentation.

## Detail

- Current React page lacks sidebar, structured header, and split overview/skill composition.

## Settings

- Current React page lacks appearance, language, update, advanced, and maintenance sections.
```

- [ ] **Step 2: Verify the gap document is readable**

Run: `sed -n '1,220p' docs/plan/cross-platform-desktop/UI_PARITY_GAP.md`
Expected: gap sections for `Home`, `Import`, `Detail`, and `Settings`

- [ ] **Step 3: Cross-check that the gap document maps back to the macOS shell files**

Run: `rg -n "topBar|searchField|recommendedContent|detailSidebar|settingsSection" apps/desktop-mac/Sources/DesktopApp/Screens -g '*.swift'`
Expected: matches exist for the layout surfaces named in the gap document

- [ ] **Step 4: Commit**

```bash
git add docs/plan/cross-platform-desktop/UI_PARITY_GAP.md
git commit -m "docs: freeze desktop ui parity gaps"
```

## Task 2: Restore Home Page Structure Parity

**Files:**
- Create: `apps/desktop/src/screens/home-main-view.tsx`
- Create: `apps/desktop/src/components/desktop-top-bar.tsx`
- Modify: `apps/desktop/src/screens/home-screen.tsx`
- Modify: `apps/desktop/src/view-models/home-view-model.ts`
- Modify: `apps/desktop/src/i18n/en.ts`
- Modify: `apps/desktop/src/i18n/zh.ts`
- Test: `apps/desktop/src/tests/home-screen.test.tsx`
- Test: `apps/desktop/src/tests/app.test.tsx`

- [ ] **Step 1: Replace the minimal home assertions with structure-level failing tests**

```tsx
it("renders the home top bar with app title, search, and primary actions", () => {
  const state = createDesktopAppState({
    workspace: { sourceIds: ["alpha"] },
  });

  const markup = ReactDOMServer.renderToStaticMarkup(
    <HomeScreen viewModel={new HomeViewModel(state)} />,
  );

  expect(markup).toContain("Skill Flow");
  expect(markup).toContain("Search groups or authors");
  expect(markup).toContain("Import");
  expect(markup).toContain("Settings");
});

it("shows project scope controls and route-aware home header content", () => {
  const state = createDesktopAppState({
    workspace: { sourceIds: ["alpha"] },
    settings: {
      recentProjectScopes: [
        { projectId: "repo-a", title: "Repo A", lastActivityAt: "2026-04-02T10:00:00Z", tools: ["codex"] },
      ],
    },
  });

  const markup = ReactDOMServer.renderToStaticMarkup(
    <HomeScreen viewModel={new HomeViewModel(state)} />,
  );

  expect(markup).toContain("Repo A");
  expect(markup).toContain("Global");
});
```

- [ ] **Step 2: Run the home screen tests to verify they fail against the current simplified page**

Run: `npm run -w @skill-flow/desktop test -- src/tests/home-screen.test.tsx src/tests/app.test.tsx`
Expected: FAIL because the current home page does not contain the original header/search/action structure

- [ ] **Step 3: Add a focused `home-main-view` and top-bar surface**

```tsx
export function HomeMainView({ viewModel }: { viewModel: HomeViewModel }) {
  return (
    <main>
      <DesktopTopBar
        routeKind={viewModel.currentRoute.kind}
        title="Skill Flow"
        searchValue={viewModel.searchQuery}
        onSearchChange={(value) => {
          viewModel.searchQuery = value;
        }}
        onImport={() => {
          viewModel.showImportPage();
        }}
        onSettings={() => {
          viewModel.showSettings();
        }}
      />
      <section>{/* project scope rail */}</section>
      <section>{/* home content */}</section>
    </main>
  );
}
```

- [ ] **Step 4: Re-run the home-specific tests**

Run: `npm run -w @skill-flow/desktop test -- src/tests/home-screen.test.tsx src/tests/app.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/screens/home-main-view.tsx apps/desktop/src/components/desktop-top-bar.tsx apps/desktop/src/screens/home-screen.tsx apps/desktop/src/view-models/home-view-model.ts apps/desktop/src/i18n/en.ts apps/desktop/src/i18n/zh.ts apps/desktop/src/tests/home-screen.test.tsx apps/desktop/src/tests/app.test.tsx
git commit -m "feat: restore desktop home page structure"
```

## Task 3: Restore Import Page Presentation Parity

**Files:**
- Create: `apps/desktop/src/components/empty-state.tsx`
- Modify: `apps/desktop/src/screens/import-screen.tsx`
- Modify: `apps/desktop/src/view-models/import-view-model.ts`
- Modify: `apps/desktop/src/components/group-card.tsx`
- Modify: `apps/desktop/src/i18n/en.ts`
- Modify: `apps/desktop/src/i18n/zh.ts`
- Test: `apps/desktop/src/tests/import-screen.test.tsx`

- [ ] **Step 1: Replace basic import assertions with recommendation/search presentation tests**

```tsx
it("renders recommendation rails when no query is submitted", () => {
  const viewModel = fakeImportViewModel({
    content: {
      kind: "recommended",
      sections: [{ categoryId: "featured", title: "Featured", groups: [fakeImportGroup("alpha")] }],
    },
  });

  const markup = ReactDOMServer.renderToStaticMarkup(<ImportScreen viewModel={viewModel} />);

  expect(markup).toContain("Featured");
  expect(markup).toContain("alpha");
});

it("renders a centered empty state for failed import search", () => {
  const viewModel = fakeImportViewModel({
    searchPhase: { kind: "failed", message: "Network unavailable" },
    content: { kind: "searchResults", groups: [] },
  });

  const markup = ReactDOMServer.renderToStaticMarkup(<ImportScreen viewModel={viewModel} />);

  expect(markup).toContain("Network unavailable");
  expect(markup).toContain("No groups found");
});
```

- [ ] **Step 2: Run the import screen tests to verify they fail**

Run: `npm run -w @skill-flow/desktop test -- src/tests/import-screen.test.tsx`
Expected: FAIL because the current page does not render recommendation rails or centered state chrome

- [ ] **Step 3: Port the original import presentation states and layouts**

```tsx
if (usesCenteredStandaloneState(viewModel.searchPhase, displayedCards.length)) {
  return (
    <EmptyState
      title={resolveImportEmptyTitle(viewModel)}
      subtitle={resolveImportEmptySubtitle(viewModel)}
    />
  );
}

return content.kind === "recommended" ? (
  <section>{/* horizontal recommendation rails */}</section>
) : (
  <section>{/* centered search result grid */}</section>
);
```

- [ ] **Step 4: Re-run the import screen tests**

Run: `npm run -w @skill-flow/desktop test -- src/tests/import-screen.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/empty-state.tsx apps/desktop/src/screens/import-screen.tsx apps/desktop/src/view-models/import-view-model.ts apps/desktop/src/components/group-card.tsx apps/desktop/src/i18n/en.ts apps/desktop/src/i18n/zh.ts apps/desktop/src/tests/import-screen.test.tsx
git commit -m "feat: restore desktop import page presentation"
```

## Task 4: Restore Detail Page Structure Parity

**Files:**
- Create: `apps/desktop/src/components/detail-sidebar.tsx`
- Create: `apps/desktop/src/components/detail-header.tsx`
- Modify: `apps/desktop/src/screens/detail-screen.tsx`
- Modify: `apps/desktop/src/view-models/detail-view-model.ts`
- Modify: `apps/desktop/src/components/markdown-document.tsx`
- Modify: `apps/desktop/src/i18n/en.ts`
- Modify: `apps/desktop/src/i18n/zh.ts`
- Test: `apps/desktop/src/tests/detail-screen.test.tsx`

- [ ] **Step 1: Replace flat detail assertions with sidebar/header/document tests**

```tsx
it("renders the detail sidebar with group row and skill rows", () => {
  const viewModel = fakeDetailViewModel({
    sourceId: "alpha",
    detail: fakeDetailPayload(),
  });

  const markup = ReactDOMServer.renderToStaticMarkup(<DetailScreen viewModel={viewModel} />);

  expect(markup).toContain("Overview");
  expect(markup).toContain("Skills");
  expect(markup).toContain("README.md");
});

it("renders the group header metadata instead of a flat title block", () => {
  const viewModel = fakeDetailViewModel({
    sourceId: "alpha",
    detail: fakeDetailPayload(),
  });

  const markup = ReactDOMServer.renderToStaticMarkup(<DetailScreen viewModel={viewModel} />);

  expect(markup).toContain("Version");
  expect(markup).toContain("Targets");
});
```

- [ ] **Step 2: Run the detail screen tests to verify they fail**

Run: `npm run -w @skill-flow/desktop test -- src/tests/detail-screen.test.tsx`
Expected: FAIL because the current page does not have the original sidebar/header/document composition

- [ ] **Step 3: Port the original detail shell composition**

```tsx
return (
  <main>
    <div className="detail-layout">
      <DetailSidebar viewModel={viewModel} />
      <section className="detail-main">
        <DetailHeader viewModel={viewModel} />
        <div className="detail-body">
          {viewModel.showingGroupOverview ? renderGroupOverview(viewModel) : renderSkillOverview(viewModel)}
        </div>
      </section>
    </div>
  </main>
);
```

- [ ] **Step 4: Re-run the detail screen tests**

Run: `npm run -w @skill-flow/desktop test -- src/tests/detail-screen.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/detail-sidebar.tsx apps/desktop/src/components/detail-header.tsx apps/desktop/src/screens/detail-screen.tsx apps/desktop/src/view-models/detail-view-model.ts apps/desktop/src/components/markdown-document.tsx apps/desktop/src/i18n/en.ts apps/desktop/src/i18n/zh.ts apps/desktop/src/tests/detail-screen.test.tsx
git commit -m "feat: restore desktop detail page structure"
```

## Task 5: Restore Settings Page Structure Parity

**Files:**
- Create: `apps/desktop/src/components/settings-section.tsx`
- Modify: `apps/desktop/src/screens/settings-screen.tsx`
- Modify: `apps/desktop/src/view-models/settings-view-model.ts`
- Modify: `apps/desktop/src/runtime/settings-store.ts`
- Modify: `apps/desktop/src/i18n/en.ts`
- Modify: `apps/desktop/src/i18n/zh.ts`
- Test: `apps/desktop/src/tests/settings-screen.test.tsx`

- [ ] **Step 1: Replace minimal settings assertions with section-and-action tests**

```tsx
it("renders appearance, update, general, advanced, and maintenance sections", () => {
  const markup = ReactDOMServer.renderToStaticMarkup(
    <SettingsScreen viewModel={fakeSettingsViewModel()} />,
  );

  expect(markup).toContain("Appearance");
  expect(markup).toContain("Application Update");
  expect(markup).toContain("Advanced");
  expect(markup).toContain("Maintenance");
});

it("renders update and maintenance actions instead of read-only fields only", () => {
  const markup = ReactDOMServer.renderToStaticMarkup(
    <SettingsScreen viewModel={fakeSettingsViewModel()} />,
  );

  expect(markup).toContain("Check for Updates");
  expect(markup).toContain("Open Releases");
  expect(markup).toContain("Clear Cache");
  expect(markup).toContain("Reset Configuration");
});
```

- [ ] **Step 2: Run the settings screen tests to verify they fail**

Run: `npm run -w @skill-flow/desktop test -- src/tests/settings-screen.test.tsx`
Expected: FAIL because the current settings page does not render the original section structure or actions

- [ ] **Step 3: Port the original settings sections with minimal dedicated components**

```tsx
return (
  <main>
    <SettingsSection title={t("settings.section.appearance")}>{/* theme, accent, language */}</SettingsSection>
    <SettingsSection title={t("settings.section.agent_display")}>{/* agent display rows */}</SettingsSection>
    <SettingsSection title={t("settings.section.application_update")}>{/* update actions */}</SettingsSection>
    <SettingsSection title={t("settings.section.general")}>{/* launch toggle */}</SettingsSection>
    <SettingsSection title={t("settings.section.advanced")}>{/* log level, helper override */}</SettingsSection>
    <SettingsSection title={t("settings.section.maintenance")}>{/* clear cache, reset config */}</SettingsSection>
  </main>
);
```

- [ ] **Step 4: Re-run the settings screen tests**

Run: `npm run -w @skill-flow/desktop test -- src/tests/settings-screen.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/settings-section.tsx apps/desktop/src/screens/settings-screen.tsx apps/desktop/src/view-models/settings-view-model.ts apps/desktop/src/runtime/settings-store.ts apps/desktop/src/i18n/en.ts apps/desktop/src/i18n/zh.ts apps/desktop/src/tests/settings-screen.test.tsx
git commit -m "feat: restore desktop settings page structure"
```

## Task 6: Raise Parity Verification Before Cutover

**Files:**
- Modify: `apps/desktop/src/tests/home-screen.test.tsx`
- Modify: `apps/desktop/src/tests/import-screen.test.tsx`
- Modify: `apps/desktop/src/tests/detail-screen.test.tsx`
- Modify: `apps/desktop/src/tests/settings-screen.test.tsx`
- Modify: `apps/desktop/src/tests/app.test.tsx`
- Modify: `docs/plan/cross-platform-desktop/DESKTOP_CONTRACT.md`
- Modify: `docs/plan/cross-platform-desktop/FULL_CROSS_PLATFORM_IMPLEMENTATION_PLAN.md`

- [ ] **Step 1: Add a parity gate to the plan/docs before resuming cutover**

```md
## UI parity gate

- [ ] Home top bar, search, project scope, and home content structure match the macOS shell
- [ ] Import recommendation/search states match the macOS shell
- [ ] Detail sidebar/header/document structure match the macOS shell
- [ ] Settings sections and actions match the macOS shell
- [ ] Screen tests assert structure and key behavior, not only string presence
```

- [ ] **Step 2: Run the focused screen suite**

Run: `npm run -w @skill-flow/desktop test -- src/tests/home-screen.test.tsx src/tests/import-screen.test.tsx src/tests/detail-screen.test.tsx src/tests/settings-screen.test.tsx src/tests/app.test.tsx`
Expected: PASS

- [ ] **Step 3: Run the full desktop suite and renderer build**

Run: `npm run -w @skill-flow/desktop test && npx tsc -p apps/desktop/tsconfig.json --noEmit && npm run -w @skill-flow/desktop build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/tests docs/plan/cross-platform-desktop/DESKTOP_CONTRACT.md docs/plan/cross-platform-desktop/FULL_CROSS_PLATFORM_IMPLEMENTATION_PLAN.md
git commit -m "test: raise desktop ui parity gate"
```

## Self-Review Checklist

- The plan treats current `apps/desktop` pages as incomplete and names the missing structures explicitly.
- Each page gets its own parity task before cutover resumes.
- Tests move from minimal text assertions to structure-and-workflow assertions.
- No task adds new product scope beyond `apps/desktop-mac` parity.
- Cutover stays blocked until the page parity gate passes.
