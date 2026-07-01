# Bridge Command Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make bridge command names and CLI dispatch behavior easier to change safely by introducing one TypeScript command catalog, one CLI handler table, and one cross-language fixture.

**Architecture:** `packages/shared-types` owns the bridge command catalog and derives the command type, parser error text, and runtime guard from it. `apps/cli` keeps the public `executeBridgeRequest(app, request)` interface, but replaces the large switch with a handler table plus one response envelope helper. Swift does not get code generation in this pass; a golden fixture catches drift between the TypeScript catalog and `BridgeCommand`.

**Tech Stack:** TypeScript, Vitest, Swift 6, XCTest, existing bridge protocol v1.0.

---

## Scope

Do this:

- Centralize bridge command names in TypeScript.
- Refactor the CLI bridge dispatcher into a command handler table.
- Add a JSON fixture consumed by TypeScript and Swift tests.
- Move Swift timeout classification next to `BridgeCommand` so command metadata is not buried in `BridgeClient`.

Skip this:

- No Swift code generation.
- No bridge protocol version bump.
- No bridge payload shape changes.
- No desktop view-model refactor.

## File Structure

- Modify: `packages/shared-types/src/protocol.ts`
  - Owns `BRIDGE_COMMAND_NAMES`, derives `BridgeCommandName`, builds parser error text, and guards commands.
- Modify: `packages/shared-types/src/tests/protocol.test.ts`
  - Verifies the catalog drives parsing and stays equal to the golden fixture.
- Create: `packages/shared-types/src/fixtures/bridge-command-catalog.json`
  - Golden fixture with protocol version and bridge command names.
- Modify: `apps/cli/src/bridge-command.ts`
  - Keeps `executeBridgeRequest`; adds `BridgeCommandHandler`, `bridgeCommandHandlers`, `runBridgeResult`, and `runBridgeValue`.
- Modify: `apps/cli/src/tests/bridge-command.test.ts`
  - Adds coverage that every supported command has a CLI handler and unsupported commands still return `UNSUPPORTED_COMMAND`.
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/Models/BridgeProtocol.swift`
  - Makes `BridgeCommand` `CaseIterable`; adds `usesImportTimeout`.
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift`
  - Uses `command.usesImportTimeout` instead of a local timeout switch.
- Create: `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeProtocolCatalogTests.swift`
  - Reads the shared fixture and verifies Swift commands match TypeScript commands.

## Task 1: TypeScript Command Catalog

**Files:**
- Modify: `packages/shared-types/src/protocol.ts`
- Modify: `packages/shared-types/src/tests/protocol.test.ts`

- [ ] **Step 1: Write the failing catalog test**

Add `BRIDGE_COMMAND_NAMES` to the import in `packages/shared-types/src/tests/protocol.test.ts`:

```ts
import {
  BRIDGE_COMMAND_NAMES,
  buildBridgeResponse,
  isBridgeCommandName,
  isJsonObject,
  isJsonValue,
  parseBridgeRequest,
  PROTOCOL_VERSION,
} from "../protocol.js";
```

Add this test inside `describe("bridge protocol", () => { ... })`:

```ts
  test("derives supported bridge commands from one catalog", () => {
    expect(BRIDGE_COMMAND_NAMES).toEqual([
      "bootstrap",
      "list",
      "inspect-state-migration",
      "migrate-state",
      "inspect",
      "inspect-enrichment",
      "search-import-groups",
      "scan-local-import-groups",
      "prepare-import-source",
      "preview-import-source",
      "commit-import-source",
      "import-source",
      "toggle-pin",
      "rename-source",
      "create-collection",
      "merge-groups",
      "restore-collection-sources",
      "doctor",
      "add",
      "apply",
      "update",
      "uninstall",
      "save-settings",
    ]);

    for (const command of BRIDGE_COMMAND_NAMES) {
      expect(isBridgeCommandName(command)).toBe(true);
    }

    expect(() =>
      parseBridgeRequest({
        protocolVersion: PROTOCOL_VERSION,
        command: "unknown",
      }),
    ).toThrow(`Bridge request 'command' must be one of: ${BRIDGE_COMMAND_NAMES.join(", ")}.`);
  });
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm run -w @skill-flow/shared-types test -- --run packages/shared-types/src/tests/protocol.test.ts
```

Expected: FAIL with a TypeScript/Vitest error that `BRIDGE_COMMAND_NAMES` is not exported.

- [ ] **Step 3: Implement the catalog**

In `packages/shared-types/src/protocol.ts`, replace the hand-written `BridgeCommandName` union and `isBridgeCommandName` chain with this catalog-driven version:

```ts
export const PROTOCOL_VERSION = "1.0" as const;

export const BRIDGE_COMMAND_NAMES = [
  "bootstrap",
  "list",
  "inspect-state-migration",
  "migrate-state",
  "inspect",
  "inspect-enrichment",
  "search-import-groups",
  "scan-local-import-groups",
  "prepare-import-source",
  "preview-import-source",
  "commit-import-source",
  "import-source",
  "toggle-pin",
  "rename-source",
  "create-collection",
  "merge-groups",
  "restore-collection-sources",
  "doctor",
  "add",
  "apply",
  "update",
  "uninstall",
  "save-settings",
] as const;

const BRIDGE_COMMAND_NAME_SET = new Set<string>(BRIDGE_COMMAND_NAMES);

export type BridgeCommandName = typeof BRIDGE_COMMAND_NAMES[number];
```

Replace the invalid-command error block in `parseBridgeRequest` with:

```ts
  if (!isBridgeCommandName(command)) {
    throw new Error(
      `Bridge request 'command' must be one of: ${BRIDGE_COMMAND_NAMES.join(", ")}.`,
    );
  }
```

Replace `isBridgeCommandName` with:

```ts
export function isBridgeCommandName(value: unknown): value is BridgeCommandName {
  return typeof value === "string" && BRIDGE_COMMAND_NAME_SET.has(value);
}
```

- [ ] **Step 4: Run the protocol tests**

Run:

```bash
npm run -w @skill-flow/shared-types test -- --run packages/shared-types/src/tests/protocol.test.ts
```

Expected: PASS.

- [ ] **Step 5: Build shared-types**

Run:

```bash
npm run -w @skill-flow/shared-types build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared-types/src/protocol.ts packages/shared-types/src/tests/protocol.test.ts
git commit -m "refactor: centralize bridge command catalog"
```

## Task 2: CLI Handler Table

**Files:**
- Modify: `apps/cli/src/bridge-command.ts`
- Modify: `apps/cli/src/tests/bridge-command.test.ts`

- [ ] **Step 1: Write failing handler coverage**

Update the imports in `apps/cli/src/tests/bridge-command.test.ts`:

```ts
import {
  BRIDGE_COMMAND_NAMES,
  PROTOCOL_VERSION,
} from "@skill-flow/shared-types/protocol";
import {
  executeBridgeRequest,
  getBridgeCommandHandlerNames,
} from "../bridge-command.js";
```

Add these tests near the top of `describe.sequential("bridge command dispatcher", () => { ... })`:

```ts
  test("has one CLI handler for every supported bridge command", () => {
    expect(getBridgeCommandHandlerNames()).toEqual(BRIDGE_COMMAND_NAMES);
  });

  test("returns unsupported command response before handler lookup", async () => {
    const app = new SkillFlowApp();
    const response = await executeBridgeRequest(app, {
      protocolVersion: PROTOCOL_VERSION,
      command: "not-real" as never,
    });

    expect(response).toMatchObject({
      ok: false,
      command: "not-real",
      errors: [
        {
          code: "UNSUPPORTED_COMMAND",
          message: "Bridge command 'not-real' is not supported.",
        },
      ],
    });
  });
```

- [ ] **Step 2: Run the failing CLI tests**

Run:

```bash
npm run -w skill-flow test -- --run apps/cli/src/tests/bridge-command.test.ts
```

Expected: FAIL with `getBridgeCommandHandlerNames` not exported.

- [ ] **Step 3: Add handler table types and helpers**

In `apps/cli/src/bridge-command.ts`, update the protocol import to include `BRIDGE_COMMAND_NAMES` and `BridgeCommandName`:

```ts
import {
  BRIDGE_COMMAND_NAMES,
  BridgeCommandName,
  BridgeRequest,
  BridgeResponse,
  JsonObject,
  JsonValue,
  buildBridgeResponse,
  isJsonObject,
} from "@skill-flow/shared-types/protocol";
```

Add these types below `CollectionBridgeApp`:

```ts
type BridgeCommandHandler = (app: SkillFlowApp, request: BridgeRequest) => Promise<BridgeResponse>;

type BridgeCommandHandlerMap = Record<BridgeCommandName, BridgeCommandHandler>;

type BridgeResultCommand<T> = () => Promise<BridgeResult<T>>;

type BridgeValueCommand<T> = () => Promise<T>;
```

Add these helpers above `executeBridgeRequest`:

```ts
export function getBridgeCommandHandlerNames(): BridgeCommandName[] {
  return BRIDGE_COMMAND_NAMES.filter((command) => bridgeCommandHandlers[command]);
}

async function runBridgeResult<T>(
  request: BridgeRequest,
  command: BridgeResultCommand<T>,
): Promise<BridgeResponse> {
  const result = await command();
  if (!result.ok) {
    return toFailureResponse(request, result.errors, result.warnings);
  }
  return buildResponseWithRequest({
    request,
    ok: true,
    data: sanitizeForJson(result.data),
    warnings: result.warnings.map((warning) => ({
      code: warning.code,
      message: warning.message,
    })),
  });
}

async function runBridgeValue<T>(
  request: BridgeRequest,
  command: BridgeValueCommand<T>,
): Promise<BridgeResponse> {
  return buildResponseWithRequest({
    request,
    ok: true,
    data: sanitizeForJson(await command()),
  });
}
```

- [ ] **Step 4: Replace the switch with a handler lookup**

Replace the inner `switch (request.command) { ... }` inside `executeBridgeRequest` with:

```ts
      const handler = bridgeCommandHandlers[request.command];
      if (!handler) {
        return buildResponseWithRequest({
          request,
          ok: false,
          errors: [
            {
              code: "UNSUPPORTED_COMMAND",
              message: `Bridge command '${request.command}' is not supported.`,
            },
          ],
        });
      }
      return await handler(app, request);
```

Keep the `try`, `SKILL_FLOW_CALLER`, `finally`, and catch blocks unchanged.

- [ ] **Step 5: Add the handler table**

Add this `bridgeCommandHandlers` object above `executeBridgeRequest`. Move the existing validation logic from each old switch case into the matching handler body exactly as shown here:

```ts
const bridgeCommandHandlers = {
  bootstrap: (app, request) => runBridgeResult(request, () => app.bootstrapWorkspaceState()),
  list: (app, request) => runBridgeResult(request, () => app.listWorkflows()),
  "inspect-state-migration": (app, request) => runBridgeValue(request, () => app.inspectStateMigration()),
  "migrate-state": (app, request) => {
    const payload = expectObjectPayload(request.payload, "migrate-state");
    const to = expectMigrationTarget(payload.to);
    const dryRun = expectOptionalBoolean(payload.dryRun, "dryRun", "migrate-state");
    const backup = expectOptionalBoolean(payload.backup, "backup", "migrate-state");
    const tolerateOrphanSources = expectOptionalBoolean(
      payload.tolerateOrphanSources,
      "tolerateOrphanSources",
      "migrate-state",
    );
    return runBridgeValue(request, () =>
      app.migrateState({
        to,
        ...(dryRun !== undefined ? { dryRun } : {}),
        ...(backup !== undefined ? { backup } : {}),
        ...(tolerateOrphanSources !== undefined ? { tolerateOrphanSources } : {}),
      }),
    );
  },
  inspect: (app, request) => {
    const payload = expectObjectPayload(request.payload, "inspect");
    const sourceId = expectString(payload.sourceId, "sourceId", "inspect");
    const scope = expectProjectScope(payload.scope);
    return runBridgeResult(request, () => app.inspectSource(sourceId, scope));
  },
  "inspect-enrichment": (app, request) => {
    const payload = expectObjectPayload(request.payload, "inspect-enrichment");
    const sourceId = expectString(payload.sourceId, "sourceId", "inspect-enrichment");
    return runBridgeResult(request, () => app.inspectSourceEnrichment(sourceId));
  },
  "search-import-groups": (app, request) => {
    const payload = expectOptionalObject(request.payload, "search-import-groups");
    const query = payload ? expectOptionalString(payload.query, "query", "search-import-groups") : undefined;
    return runBridgeResult(request, () => app.searchImportGroups(query ?? ""));
  },
  "scan-local-import-groups": (app, request) => {
    const payload = expectOptionalObject(request.payload, "scan-local-import-groups");
    const localPath = payload ? expectOptionalString(payload.path, "path", "scan-local-import-groups") : undefined;
    return runBridgeResult(request, () => app.scanLocalImportGroups(localPath));
  },
  "prepare-import-source": (app, request) => {
    const payload = expectObjectPayload(request.payload, "prepare-import-source");
    const locator = expectString(payload.locator, "locator", "prepare-import-source");
    return runBridgeResult(request, () => app.prepareImportSource(locator));
  },
  "preview-import-source": (app, request) => {
    const payload = expectObjectPayload(request.payload, "preview-import-source");
    const locator = expectString(payload.locator, "locator", "preview-import-source");
    return runBridgeResult(request, () => app.previewImportSource(locator));
  },
  "commit-import-source": (app, request) => {
    const payload = expectObjectPayload(request.payload, "commit-import-source");
    const preparationId = expectString(payload.preparationId, "preparationId", "commit-import-source");
    const draft = expectOptionalImportDraft(payload.draft);
    return runBridgeResult(request, () => app.commitPreparedImportSource(preparationId, draft));
  },
  "import-source": (app, request) => {
    const payload = expectObjectPayload(request.payload, "import-source");
    const locator = expectString(payload.locator, "locator", "import-source");
    const draft = expectOptionalImportDraft(payload.draft);
    return runBridgeResult(request, () => app.importSource(locator, draft));
  },
  "toggle-pin": (app, request) => {
    const payload = expectObjectPayload(request.payload, "toggle-pin");
    const sourceId = expectString(payload.sourceId, "sourceId", "toggle-pin");
    return runBridgeResult(request, () => app.togglePinnedSource(sourceId));
  },
  "rename-source": (app, request) => {
    const payload = expectObjectPayload(request.payload, "rename-source");
    const sourceId = expectString(payload.sourceId, "sourceId", "rename-source");
    const displayName = expectPossiblyEmptyString(payload.displayName, "displayName", "rename-source");
    return runBridgeResult(request, () => app.renameSource(sourceId, displayName));
  },
  "create-collection": (app, request) => {
    const payload = expectObjectPayload(request.payload, "create-collection");
    const displayName = expectString(payload.displayName, "displayName", "create-collection");
    const skills = parseCollectionSkillRefs(payload.skills, "create-collection");
    const enabledTargets = parseOptionalStringArray(payload.enabledTargets, "create-collection.enabledTargets") ?? [];
    return runBridgeResult(request, () =>
      (app as SkillFlowApp & CollectionBridgeApp).createCollection({
        displayName,
        skills,
        enabledTargets,
      }),
    );
  },
  "merge-groups": (app, request) => {
    const payload = expectObjectPayload(request.payload, "merge-groups");
    const displayName = expectString(payload.displayName, "displayName", "merge-groups");
    const sourceIds = parseRequiredStringArray(payload.sourceIds, "merge-groups.sourceIds");
    const enabledTargets = parseOptionalStringArray(payload.enabledTargets, "merge-groups.enabledTargets") ?? [];
    return runBridgeResult(request, () =>
      (app as SkillFlowApp & CollectionBridgeApp).mergeGroups({
        displayName,
        sourceIds,
        enabledTargets,
      }),
    );
  },
  "restore-collection-sources": (app, request) => {
    const payload = expectObjectPayload(request.payload, "restore-collection-sources");
    const collectionId = expectString(payload.collectionId, "collectionId", "restore-collection-sources");
    return runBridgeResult(request, () =>
      (app as SkillFlowApp & CollectionBridgeApp).restoreCollectionSources(collectionId),
    );
  },
  doctor: (app, request) => runBridgeResult(request, () => app.doctor()),
  add: (app, request) => {
    const payload = expectObjectPayload(request.payload, "add");
    const locator = expectString(payload.locator, "locator", "add");
    const options = expectOptionalObject(payload.options, "add.options");
    const applyNow = payload.applyNow === true;
    return runBridgeResult(request, () =>
      applyNow
        ? app.addSource(locator, options as Parameters<SkillFlowApp["addSource"]>[1])
        : app.prepareAddSource(locator, options as Parameters<SkillFlowApp["prepareAddSource"]>[1]),
    );
  },
  apply: (app, request) => {
    const payload = expectObjectPayload(request.payload, "apply");
    const sourceId = expectString(payload.sourceId, "sourceId", "apply");
    const draft = expectDraftBinding(payload.draft);
    const scope = expectProjectScope(payload.scope);
    return runBridgeResult(request, () => app.applyDraft(sourceId, draft, scope));
  },
  update: (app, request) => {
    const payload = expectOptionalObject(request.payload, "update");
    const sourceIds = parseOptionalStringArray(payload?.sourceIds, "update.sourceIds");
    return runBridgeResult(request, () => app.updateSources(sourceIds));
  },
  uninstall: (app, request) => {
    const payload = expectObjectPayload(request.payload, "uninstall");
    const sourceIds = parseRequiredStringArray(payload.sourceIds, "uninstall.sourceIds");
    return runBridgeResult(request, () => app.uninstall(sourceIds));
  },
  "save-settings": (app, request) => {
    const payload = expectObjectPayload(request.payload, "save-settings");
    const customTargets = expectCustomTargets(payload.customTargets);
    const agentDisplayOrder = parseOptionalStringArray(payload.agentDisplayOrder, "save-settings.agentDisplayOrder") ?? [];
    return runBridgeResult(request, () => app.saveSettings({ customTargets, agentDisplayOrder }));
  },
} satisfies BridgeCommandHandlerMap;
```

- [ ] **Step 6: Remove the old switch cases**

Delete the old `switch (request.command) { ... }` body after confirming each command appears in `bridgeCommandHandlers`.

Run this check:

```bash
rg 'case "' apps/cli/src/bridge-command.ts
```

Expected: no output.

- [ ] **Step 7: Run CLI bridge tests**

Run:

```bash
npm run -w skill-flow test -- --run apps/cli/src/tests/bridge-command.test.ts
```

Expected: PASS.

- [ ] **Step 8: Build CLI**

Run:

```bash
npm run -w skill-flow build
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/cli/src/bridge-command.ts apps/cli/src/tests/bridge-command.test.ts
git commit -m "refactor: route bridge commands through handler table"
```

## Task 3: Cross-Language Command Fixture

**Files:**
- Create: `packages/shared-types/src/fixtures/bridge-command-catalog.json`
- Modify: `packages/shared-types/src/tests/protocol.test.ts`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/Models/BridgeProtocol.swift`
- Create: `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeProtocolCatalogTests.swift`

- [ ] **Step 1: Create the golden fixture**

Create `packages/shared-types/src/fixtures/bridge-command-catalog.json`:

```json
{
  "protocolVersion": "1.0",
  "commands": [
    "bootstrap",
    "list",
    "inspect-state-migration",
    "migrate-state",
    "inspect",
    "inspect-enrichment",
    "search-import-groups",
    "scan-local-import-groups",
    "prepare-import-source",
    "preview-import-source",
    "commit-import-source",
    "import-source",
    "toggle-pin",
    "rename-source",
    "create-collection",
    "merge-groups",
    "restore-collection-sources",
    "doctor",
    "add",
    "apply",
    "update",
    "uninstall",
    "save-settings"
  ]
}
```

- [ ] **Step 2: Add TypeScript fixture test**

Add these imports to `packages/shared-types/src/tests/protocol.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
```

Add this type near the imports:

```ts
type BridgeCommandCatalogFixture = {
  protocolVersion: string;
  commands: string[];
};
```

Add this test inside `describe("bridge protocol", () => { ... })`:

```ts
  test("matches the bridge command golden fixture", () => {
    const fixturePath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../fixtures/bridge-command-catalog.json",
    );
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as BridgeCommandCatalogFixture;

    expect(fixture).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      commands: BRIDGE_COMMAND_NAMES,
    });
  });
```

- [ ] **Step 3: Run TypeScript fixture test**

Run:

```bash
npm run -w @skill-flow/shared-types test -- --run packages/shared-types/src/tests/protocol.test.ts
```

Expected: PASS.

- [ ] **Step 4: Make Swift commands iterable**

In `apps/desktop-mac/Sources/DesktopApp/Runtime/Models/BridgeProtocol.swift`, change:

```swift
enum BridgeCommand: String, Codable, Sendable {
```

to:

```swift
enum BridgeCommand: String, Codable, Sendable, CaseIterable {
```

- [ ] **Step 5: Add Swift fixture test**

Create `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeProtocolCatalogTests.swift`:

```swift
import Foundation
import XCTest

@testable import SkillFlowDesktop

final class BridgeProtocolCatalogTests: XCTestCase {
    func testSwiftBridgeCommandsMatchSharedTypesFixture() throws {
        let fixture = try BridgeCommandCatalogFixture.load()

        XCTAssertEqual(fixture.protocolVersion, "1.0")
        XCTAssertEqual(
            BridgeCommand.allCases.map(\.rawValue),
            fixture.commands
        )
    }
}

private struct BridgeCommandCatalogFixture: Decodable {
    let protocolVersion: String
    let commands: [String]

    static func load() throws -> BridgeCommandCatalogFixture {
        var repoRoot = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 {
            repoRoot.deleteLastPathComponent()
        }
        let fixtureURL = repoRoot
            .appendingPathComponent("packages/shared-types/src/fixtures/bridge-command-catalog.json")
        let data = try Data(contentsOf: fixtureURL)
        return try JSONDecoder().decode(BridgeCommandCatalogFixture.self, from: data)
    }
}
```

- [ ] **Step 6: Run Swift fixture test**

Run:

```bash
cd apps/desktop-mac
swift test --filter BridgeProtocolCatalogTests
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/shared-types/src/fixtures/bridge-command-catalog.json packages/shared-types/src/tests/protocol.test.ts apps/desktop-mac/Sources/DesktopApp/Runtime/Models/BridgeProtocol.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeProtocolCatalogTests.swift
git commit -m "test: verify bridge command catalog across runtimes"
```

## Task 4: Swift Timeout Metadata on BridgeCommand

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/Models/BridgeProtocol.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeProtocolCatalogTests.swift`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift`

- [ ] **Step 1: Write timeout metadata test**

Add this test to `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeProtocolCatalogTests.swift`:

```swift
    func testImportTimeoutCommandsAreDeclaredOnBridgeCommand() {
        let importTimeoutCommands = BridgeCommand.allCases
            .filter(\.usesImportTimeout)
            .map(\.rawValue)

        XCTAssertEqual(importTimeoutCommands, [
            "search-import-groups",
            "scan-local-import-groups",
            "prepare-import-source",
            "preview-import-source",
            "commit-import-source",
            "import-source",
        ])
    }
```

- [ ] **Step 2: Run failing timeout metadata test**

Run:

```bash
cd apps/desktop-mac
swift test --filter BridgeProtocolCatalogTests/testImportTimeoutCommandsAreDeclaredOnBridgeCommand
```

Expected: FAIL with `Value of type 'BridgeCommand' has no member 'usesImportTimeout'`.

- [ ] **Step 3: Add timeout metadata to BridgeCommand**

In `apps/desktop-mac/Sources/DesktopApp/Runtime/Models/BridgeProtocol.swift`, add this extension immediately after the `BridgeCommand` enum:

```swift
extension BridgeCommand {
    var usesImportTimeout: Bool {
        switch self {
        case .searchImportGroups,
             .scanLocalImportGroups,
             .prepareImportSource,
             .previewImportSource,
             .commitImportSource,
             .importSource:
            return true
        case .bootstrap,
             .list,
             .inspectStateMigration,
             .migrateState,
             .inspect,
             .inspectEnrichment,
             .createCollection,
             .mergeGroups,
             .restoreCollectionSources,
             .renameSource,
             .togglePin,
             .doctor,
             .add,
             .apply,
             .update,
             .uninstall,
             .saveSettings:
            return false
        }
    }
}
```

- [ ] **Step 4: Use metadata in BridgeClient**

In `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift`, replace the body of `timeoutMilliseconds(for:)` with:

```swift
    private func timeoutMilliseconds(for command: BridgeCommand) -> UInt64 {
        command.usesImportTimeout
            ? importCommandTimeoutMilliseconds
            : commandTimeoutMilliseconds
    }
```

- [ ] **Step 5: Run Swift bridge tests**

Run:

```bash
cd apps/desktop-mac
swift test --filter BridgeProtocolCatalogTests
swift test --filter BridgeClientExecutionTests/testPreviewImportSourceUsesImportCommandTimeout
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/Runtime/Models/BridgeProtocol.swift apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeProtocolCatalogTests.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift
git commit -m "refactor: keep bridge timeout metadata with commands"
```

## Task 5: Final Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run targeted TypeScript tests**

Run:

```bash
npm run -w @skill-flow/shared-types test -- --run packages/shared-types/src/tests/protocol.test.ts
npm run -w skill-flow test -- --run apps/cli/src/tests/bridge-command.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run targeted Swift tests**

Run:

```bash
cd apps/desktop-mac
swift test --filter BridgeProtocolCatalogTests
swift test --filter BridgeClientExecutionTests/testPreviewImportSourceUsesImportCommandTimeout
```

Expected: PASS.

- [ ] **Step 3: Build affected packages**

Run:

```bash
npm run -w @skill-flow/shared-types build
npm run -w skill-flow build
cd apps/desktop-mac
swift build
```

Expected: PASS.

- [ ] **Step 4: Run full root verification if time permits**

Run:

```bash
npm run build
npm test
cd apps/desktop-mac
swift test
```

Expected: PASS.

- [ ] **Step 5: Report intentional skips**

Report:

```text
Skipped Swift code generation; golden fixture covers drift for now.
Skipped protocol version bump; command names and payload shapes did not change.
Skipped desktop view-model refactor; bridge command locality was the requested scope.
```

## Self-Review

- Spec coverage: The plan covers the chosen optimization direction: bridge command catalog, CLI handler table, shared response envelope, and cross-language drift protection.
- Placeholder scan: No task contains forbidden placeholder language or unspecified validation.
- Type consistency: `BRIDGE_COMMAND_NAMES`, `BridgeCommandName`, `BridgeCommandHandler`, `getBridgeCommandHandlerNames`, and `usesImportTimeout` are defined before use.
