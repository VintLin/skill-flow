# PLAN v1.2.0 Execution Checklist

> Source of truth: `docs/plan/PLAN_v1.2.0.a.md` / `b.md` / `c.md`
> Principle: Reuse existing TUI logic and command chain (`group` / `selectedLeafIds` / `enabledTargets`, `apply` / `doctor` / `bootstrap`).

## 0. Plan Setup

- [x] Create root execution plan file (`PLAN.md`)
- [x] Confirm implementation boundary against v1.2.0 a/b/c docs before coding each phase
- [x] Keep menu bar scope minimal: `Group switch + Agent toggles + Apply Now + Open Doctor + Open Main Window`

## 1. Phase 1: Shell and Frame (Main Window + Menu Bar Skeleton)

- [x] Build main window 3-pane shell: `Sidebar / Content / Inspector`
- [x] Implement responsive behavior (`>=1200`, `900-1199`, `<900`)
- [x] Wire top toolbar core actions (no extra scope)
- [x] Build menu bar popup shell (window-style)
- [x] Restrict menu bar controls to locked scope only (no search/recent/settings/quit)

## 2. Phase 2: Core Pages

- [ ] `Overview`: aggregated health + attention-first layout + latest apply result
- [ ] `Sources`: table + filters + inspector + add source sheet
- [ ] `Deployments`: plan summary + classification + blocked reasons + apply entry
- [ ] `Doctor`: grouped issues + cause/impact/fix actions + post-fix feedback

## 3. Phase 3: Menu Bar Instant Config (Locked Decisions)

- [x] Group selector (existing groups only; no create/delete)
- [x] Agent(target) toggles draft behavior (no auto-apply)
- [x] Unsaved draft guard on group switch: `Apply / Discard / Cancel`
- [x] `Apply Now` affects current group only
- [x] Target visibility: default detected targets + `Show All`
- [x] Failure feedback template: failed count + first cause + `Open Doctor`
- [x] `Open Main Window` handoff path

## 4. Phase 4: State, Data Flow, and Command Reuse

- [x] Enforce single source of truth between menu bar and main window
- [x] Reuse same write pipeline for menu bar/main window (no double-write)
- [ ] Ensure mapping consistency: `group / selectedLeafIds / enabledTargets`
- [x] Reuse existing `apply / doctor / bootstrap` command chain

## 5. Phase 5: Interaction States and UX Consistency

- [ ] Implement 5 states per core page: `loading / empty / error / success / partial`
- [ ] Apply unified error template on all core pages
- [ ] Keep first-screen Top-3 information budget on core pages
- [ ] Keep menu bar info density budget (items/buttons/alerts)

## 6. Phase 6: Accessibility and Keyboard

- [ ] Keyboard path for main workflows
- [ ] Focus order for main window and menu bar popup
- [ ] 44px minimum target size for actionable controls
- [ ] VoiceOver readable labels for status/actions
- [ ] Status dual encoding (text + icon/color)

## 7. Test Plan (Must Pass)

### 7.1 Unit

- [ ] Draft switch branching: `Apply / Discard / Cancel`
- [ ] Agent draft toggles do not trigger deploy automatically
- [ ] `Apply Now` scope isolation (current group only)
- [ ] Mapping consistency tests for `group/selectedLeafIds/enabledTargets`
- [ ] Detected targets default + `Show All` expansion behavior
- [ ] Failure template structure assertion

### 7.2 Integration

- [ ] Menu bar -> main window state sync
- [ ] Main window -> menu bar state sync
- [ ] Same write chain for both surfaces (no branch)
- [ ] Negative test: menu bar has no complex edit entry

### 7.3 E2E

- [ ] First launch bootstrap flow with failure branch
- [ ] Add source -> preview -> apply end-to-end
- [ ] Drifted/blocked -> doctor fix -> re-preview -> apply loop
- [ ] Menu bar quick flow: group + agent + apply + doctor jump

## 8. Release Gates (DoD)

- [ ] A/B/C/D/F/G flows demoable and accepted
- [ ] Locked 8 decisions fully covered by tests
- [ ] Menu bar and main window responsibilities remain separate
- [ ] No out-of-scope features introduced in menu bar
- [ ] Docs updated only for final external behavior changes

## 9. Execution Notes

- [ ] Implement in small atomic steps; finish one logical unit then verify
- [ ] No compatibility shim for internal evolution
- [ ] No unrelated refactor or incidental feature expansion
