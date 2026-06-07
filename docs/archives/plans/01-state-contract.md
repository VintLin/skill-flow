# State Schema V2 Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 定义 V2 state schema，并让 storage normalizer 能把 V1/V2 state 读成统一 domain model。

**Architecture:** domain 包定义类型和 schema version，storage 包负责文件级 normalizer 和双读，query/core 只接收规范化后的 V2 model。legacy 字段不进入业务核心。

**Tech Stack:** TypeScript、Vitest、JSON state files。

---

## 文件范围

创建：

- `packages/domain/src/state-schema-v2.ts`
- `packages/domain/src/tests/state-schema-v2.test.ts`
- `packages/storage/src/state-migration-status.ts`
- `packages/storage/src/tests/state-migration-status.test.ts`

修改：

- `packages/domain/src/types.ts`
- `packages/domain/src/index.ts`
- `packages/storage/src/preferences-store.ts`
- `packages/storage/src/import-preparation-cache.ts`
- `packages/storage/src/skill-collection-materialization.ts`
- `packages/storage/src/store.ts`
- `packages/storage/src/tests/preferences-store.test.ts`
- `packages/storage/src/tests/import-preparation-cache.test.ts`
- `packages/storage/src/tests/skill-collection-materialization.test.ts`
- `packages/storage/src/tests/store.test.ts`

## V2 类型边界

新增类型：

```ts
export const STATE_SCHEMA_VERSION_V2 = 2 as const;

export type StateSchemaVersion = 1 | 2;

export type MigrationGenerationV2 = string;

export type StateAuthorityFileV2 = {
  schemaVersion: 2;
  migrationGeneration: MigrationGenerationV2;
};

export type StateMigrationStatus =
  | {
      status: "current";
      version: 2;
      stateRoot: string;
      migrationGeneration: string;
    }
  | {
      status: "migration-required";
      fromVersion: 1;
      toVersion: 2;
      stateRoot: string;
      files: StateFileMigrationPlan[];
    }
  | {
      status: "incomplete";
      stateRoot: string;
      reasonCode: "STATE_MIGRATION_INCOMPLETE";
      diagnostics: StateMigrationDiagnostic[];
    }
  | {
      status: "invalid";
      stateRoot: string;
      diagnostics: StateMigrationDiagnostic[];
    };

export type StateFileMigrationPlan = {
  path: string;
  action: "rewrite" | "prune" | "keep";
  reason: string;
};

export type StateMigrationDiagnostic = {
  code: string;
  message: string;
  path?: string;
};

export type ImportSkillSelector =
  | { kind: "repoPath"; path: string }
  | { kind: "skillName"; name: string };

export type SkillCollectionRestoreSelectionV2 = {
  selectedLeafIds: string[];
  enabledTargets: string[];
  bestEffort: true;
  diagnostics?: StateMigrationDiagnostic[];
};

export type LocalSourceChoiceV2 = {
  sourceChoiceId: "matched-source" | "new-source";
  matchedSourceId?: string;
  selector: ImportSkillSelector;
  diagnostics?: StateMigrationDiagnostic[];
};
```

## Tasks

### Task 1: Add V2 domain contract

**Files:**

- Create: `packages/domain/src/state-schema-v2.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/src/tests/state-schema-v2.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests covering:

```ts
import {
  STATE_SCHEMA_VERSION_V2,
  normalizeStateSchemaVersion,
  buildStableSkillUiId,
  buildImportSelectorKey,
} from "../state-schema-v2.js";

test("normalizes missing schema version as v1", () => {
  expect(normalizeStateSchemaVersion(undefined)).toBe(1);
});

test("accepts schema version 2", () => {
  expect(normalizeStateSchemaVersion(2)).toBe(2);
});

test("rejects unsupported schema version", () => {
  expect(() => normalizeStateSchemaVersion(999)).toThrow("STATE_SCHEMA_VERSION_UNSUPPORTED");
});

test("builds stable ui id from source key and selector", () => {
  const idA = buildStableSkillUiId({
    sourceSelectionKey: "github:anthropics/skills",
    selector: { kind: "repoPath", path: "skills/frontend-design" },
  });
  const idB = buildStableSkillUiId({
    sourceSelectionKey: "github:anthropics/skills",
    selector: { kind: "repoPath", path: "skills/frontend-design" },
  });
  expect(idA).toBe(idB);
  expect(idA).toMatch(/^skill_[a-z2-7]{20}$/);
});

test("selector key does not include archive path or provider id", () => {
  expect(buildImportSelectorKey({ kind: "repoPath", path: "skills/frontend-design" })).toBe(
    "repoPath:skills/frontend-design",
  );
});
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
npm run -w @skill-flow/domain test -- state-schema-v2.test.ts
```

Expected: fail because `state-schema-v2.ts` does not exist.

- [ ] **Step 3: Implement V2 domain helpers**

Create `packages/domain/src/state-schema-v2.ts` with:

```ts
import crypto from "node:crypto";
import type { ImportSkillSelector } from "./types.js";

export const STATE_SCHEMA_VERSION_V2 = 2 as const;

export type StateSchemaVersion = 1 | 2;

export function normalizeStateSchemaVersion(value: unknown): StateSchemaVersion {
  if (value === undefined || value === null) {
    return 1;
  }
  if (value === 1 || value === 2) {
    return value;
  }
  throw new Error("STATE_SCHEMA_VERSION_UNSUPPORTED");
}

export function buildImportSelectorKey(selector: ImportSkillSelector): string {
  if (selector.kind === "repoPath") {
    return `repoPath:${normalizeRepoPathSelector(selector.path)}`;
  }
  return `skillName:${selector.name}`;
}

export function buildStableSkillUiId(input: {
  sourceSelectionKey: string;
  selector: ImportSkillSelector;
}): string {
  const payload = JSON.stringify({
    sourceSelectionKey: input.sourceSelectionKey,
    selectorKey: buildImportSelectorKey(input.selector),
  });
  const digest = crypto.createHash("sha256").update(payload).digest();
  return `skill_${toBase32LowerNoPadding(digest).slice(0, 20)}`;
}

function normalizeRepoPathSelector(path: string): string {
  return path === "." ? "." : path.replaceAll("\\\\", "/").replace(/^\\.\\//, "");
}

function toBase32LowerNoPadding(bytes: Buffer): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }
  return output;
}
```

- [ ] **Step 4: Export helpers**

Modify `packages/domain/src/index.ts`:

```ts
export * from "./state-schema-v2.js";
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm run -w @skill-flow/domain test -- state-schema-v2.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/state-schema-v2.ts packages/domain/src/index.ts packages/domain/src/tests/state-schema-v2.test.ts
git commit -m "feat: add state schema v2 domain contract"
```

### Task 2: Add migration status detection

**Files:**

- Create: `packages/storage/src/state-migration-status.ts`
- Test: `packages/storage/src/tests/state-migration-status.test.ts`
- Modify: `packages/storage/src/index.ts`

- [ ] **Step 1: Write failing tests**

Test cases:

```ts
test("reports current for schemaVersion 2 files", async () => {
  const status = await inspectStateMigrationStatus(root);
  expect(status.status).toBe("current");
  expect(status.migrationGeneration).toMatch(/^mg_/);
});

test("reports migration-required when schemaVersion is missing", async () => {
  const status = await inspectStateMigrationStatus(root);
  expect(status.status).toBe("migration-required");
  expect(status.files.map((file) => file.path)).toContain("manifest.json");
});

test("marks caches as prune actions", async () => {
  const status = await inspectStateMigrationStatus(root);
  expect(status.files).toContainEqual(
    expect.objectContaining({
      path: "catalog/import-data.json",
      action: "prune",
    }),
  );
});

test("plans creation of empty collections file when no v1 virtual groups exist", async () => {
  const status = await inspectStateMigrationStatus(root);
  expect(status.files).toContainEqual(
    expect.objectContaining({
      path: "collections.json",
      action: "rewrite",
      reason: "Create empty schema v2 collections file.",
    }),
  );
});

test("reports incomplete when migration marker remains", async () => {
  await writeJsonFile(path.join(root, ".skillflow-migration.json"), {
    generation: "mg_test",
    status: "running",
  });

  const status = await inspectStateMigrationStatus(root);

  expect(status).toMatchObject({
    status: "incomplete",
    reasonCode: "STATE_MIGRATION_INCOMPLETE",
  });
});

test("reports incomplete when v2 authority files have different generations", async () => {
  await writeJsonFile(path.join(root, "manifest.json"), {
    schemaVersion: 2,
    migrationGeneration: "mg_a",
  });
  await writeJsonFile(path.join(root, "lock.json"), {
    schemaVersion: 2,
    migrationGeneration: "mg_b",
  });
  await writeJsonFile(path.join(root, "preferences.json"), {
    schemaVersion: 2,
    migrationGeneration: "mg_a",
  });
  await writeJsonFile(path.join(root, "collections.json"), {
    schemaVersion: 2,
    migrationGeneration: "mg_a",
    collections: {},
  });

  const status = await inspectStateMigrationStatus(root);

  expect(status).toMatchObject({
    status: "incomplete",
    reasonCode: "STATE_MIGRATION_INCOMPLETE",
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
npm run -w @skill-flow/storage test -- state-migration-status.test.ts
```

Expected: fail because `inspectStateMigrationStatus` does not exist.

- [ ] **Step 3: Implement inspection**

Create `packages/storage/src/state-migration-status.ts`:

```ts
import path from "node:path";
import {
  normalizeStateSchemaVersion,
  type StateFileMigrationPlan,
  type StateMigrationStatus,
} from "@skill-flow/domain/state-schema-v2";
import { pathExists, readJsonFile } from "@skill-flow/integration/utils/fs";

const BASE_AUTHORITY_FILES = ["manifest.json", "lock.json", "preferences.json"] as const;
const V1_COLLECTION_FILE = "virtual-groups.json";
const V2_COLLECTION_FILE = "collections.json";
const MIGRATION_MARKER_FILE = ".skillflow-migration.json";
const PRUNE_ENTRIES = [
  { path: "catalog/import-data.json", kind: "file" },
  { path: "catalog/source-metadata.json", kind: "file" },
  { path: "catalog/import-preparations.json", kind: "file" },
  { path: "catalog/import-preparations", kind: "directory" },
  { path: "catalog/git", kind: "directory" },
] as const;

export async function inspectStateMigrationStatus(stateRoot: string): Promise<StateMigrationStatus> {
  if (await pathExists(path.join(stateRoot, MIGRATION_MARKER_FILE))) {
    return {
      status: "incomplete",
      stateRoot,
      reasonCode: "STATE_MIGRATION_INCOMPLETE",
      diagnostics: [
        {
          code: "STATE_MIGRATION_MARKER_PRESENT",
          message: "Migration marker is still present.",
          path: MIGRATION_MARKER_FILE,
        },
      ],
    };
  }

  const files = [];
  let fromVersion = 2;
  const generations = new Map<string, string[]>();

  for (const relativePath of BASE_AUTHORITY_FILES) {
    const result = await inspectAuthorityFile(stateRoot, relativePath, generations);
    fromVersion = Math.min(fromVersion, result.version);
    if (result.status === "rewrite") {
      files.push(result.file);
    }
    if (result.status === "incomplete") {
      return result.incomplete;
    }
  }

  const hasV2Collections = await pathExists(path.join(stateRoot, V2_COLLECTION_FILE));
  const hasV1Collections = await pathExists(path.join(stateRoot, V1_COLLECTION_FILE));
  if (hasV2Collections) {
    const result = await inspectAuthorityFile(stateRoot, V2_COLLECTION_FILE, generations);
    fromVersion = Math.min(fromVersion, result.version);
    if (result.status === "rewrite") {
      files.push({
        path: V2_COLLECTION_FILE,
        action: "rewrite" as const,
        reason: "Normalize collections.json to schema v2.",
      });
    }
    if (result.status === "incomplete") {
      return result.incomplete;
    }
  } else if (hasV1Collections) {
    files.push({
      path: V1_COLLECTION_FILE,
      action: "rewrite" as const,
      reason: "Materialize legacy virtual groups into schema v2 collections.",
    });
  } else if (!hasV2Collections) {
    files.push({
      path: V2_COLLECTION_FILE,
      action: "rewrite" as const,
      reason: "Create empty schema v2 collections file.",
    });
  }

  if (fromVersion === 2 && generations.size > 1) {
    return {
      status: "incomplete",
      stateRoot,
      reasonCode: "STATE_MIGRATION_INCOMPLETE",
      diagnostics: [
        {
          code: "STATE_MIGRATION_GENERATION_MISMATCH",
          message: "Schema v2 authority files have different migrationGeneration values.",
        },
      ],
    };
  }

  for (const entry of PRUNE_ENTRIES) {
    if (await pathExists(path.join(stateRoot, entry.path))) {
      files.push({
        path: entry.path,
        action: "prune" as const,
        reason: "Cache can be rebuilt by schema v2 runtime.",
      });
    }
  }

  if (files.length === 0 && fromVersion === 2) {
    const migrationGeneration = [...generations.keys()][0]!;
    return { status: "current", version: 2, stateRoot, migrationGeneration };
  }

  return {
    status: "migration-required",
    fromVersion: 1,
    toVersion: 2,
    stateRoot,
    files,
  };
}

async function inspectAuthorityFile(
  stateRoot: string,
  relativePath: string,
  generations: Map<string, string[]>,
): Promise<
  | { status: "current"; version: 2 }
  | { status: "rewrite"; version: 1; file: StateFileMigrationPlan }
  | { status: "incomplete"; version: 2; incomplete: StateMigrationStatus }
> {
  const payload = await readJsonFile<Record<string, unknown>>(path.join(stateRoot, relativePath), {});
  const version = normalizeStateSchemaVersion(payload.schemaVersion);
  if (version < 2) {
    return {
      status: "rewrite",
      version: 1,
      file: {
        path: relativePath,
        action: "rewrite",
        reason: "Add schemaVersion 2 and normalize legacy fields.",
      },
    };
  }
  if (typeof payload.migrationGeneration !== "string") {
    return {
      status: "incomplete",
      version: 2,
      incomplete: {
        status: "incomplete",
        stateRoot,
        reasonCode: "STATE_MIGRATION_INCOMPLETE",
        diagnostics: [
          {
            code: "STATE_MIGRATION_GENERATION_MISSING",
            message: "Schema v2 authority file is missing migrationGeneration.",
            path: relativePath,
          },
        ],
      },
    };
  }
  const paths = generations.get(payload.migrationGeneration) ?? [];
  paths.push(relativePath);
  generations.set(payload.migrationGeneration, paths);
  return { status: "current", version: 2 };
}
```

- [ ] **Step 4: Export inspection**

Modify `packages/storage/src/index.ts`:

```ts
export * from "./state-migration-status.js";
```

- [ ] **Step 5: Run storage tests**

```bash
npm run -w @skill-flow/storage test -- state-migration-status.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/storage/src/state-migration-status.ts packages/storage/src/index.ts packages/storage/src/tests/state-migration-status.test.ts
git commit -m "feat: inspect state schema migration status"
```

### Task 3: Add schemaVersion dual-read to state files

**Files:**

- Modify: `packages/storage/src/store.ts`
- Modify: `packages/storage/src/preferences-store.ts`
- Modify: `packages/storage/src/import-preparation-cache.ts`
- Test: `packages/storage/src/tests/store.test.ts`
- Test: `packages/storage/src/tests/preferences-store.test.ts`
- Test: `packages/storage/src/tests/import-preparation-cache.test.ts`

- [ ] **Step 1: Write failing tests**

Add assertions:

```ts
test("writes schemaVersion 2 and migrationGeneration to manifest and lock", async () => {
  await store.writeState(manifest, lockFile);
  const manifestJson = await readJsonFile(path.join(stateRoot, "manifest.json"), {});
  const lockJson = await readJsonFile(path.join(stateRoot, "lock.json"), {});
  expect(manifestJson).toMatchObject({
    schemaVersion: 2,
    migrationGeneration: expect.stringMatching(/^mg_/),
  });
  expect(lockJson).toMatchObject({
    schemaVersion: 2,
    migrationGeneration: manifestJson.migrationGeneration,
  });
});

test("reads legacy preferences without schemaVersion", async () => {
  await writeJsonFile(path.join(stateRoot, "preferences.json"), {
    pinnedSourceIds: ["source-a"],
  });
  expect((await store.readPreferences()).pinnedSourceIds).toEqual(["source-a"]);
});

test("normalizes legacy import preparation skillIds", () => {
  const cache = normalizeImportPreparationCache({
    records: {
      "prep-1": {
        id: "prep-1",
        locator: "github:anthropics/skills",
        checkoutPath: "/tmp/checkout",
        skillIds: ["skills/frontend-design"],
        preparedAt: "2026-06-04T00:00:00.000Z",
        expiresAt: "2026-06-05T00:00:00.000Z",
        status: "ready",
      },
    },
    locatorIndex: {},
  });
  expect(cache.records["prep-1"]?.skillIds).toEqual(["skills/frontend-design"]);
  expect(cache.records["prep-1"]?.skillRefs).toBeUndefined();
});
```

- [ ] **Step 2: Run failing tests**

```bash
npm run -w @skill-flow/storage test -- store.test.ts preferences-store.test.ts import-preparation-cache.test.ts
```

Expected: schemaVersion assertions fail before implementation.

- [ ] **Step 3: Update serializers**

Modify storage serializers so writes include:

```ts
schemaVersion: STATE_SCHEMA_VERSION_V2
migrationGeneration: currentMigrationGeneration
```

for `manifest.json`, `lock.json`, `preferences.json`, and `collections.json`.

V2 cache files write only:

```ts
schemaVersion: STATE_SCHEMA_VERSION_V2
```

Authority files must all use the same `migrationGeneration`. V2 cache files may include `schemaVersion` but must not be used to decide authority generation.

- [ ] **Step 4: Preserve V1 read compatibility**

Keep current normalizer behavior for missing `schemaVersion`. Missing version means V1 and must not throw.

- [ ] **Step 5: Run storage tests**

```bash
npm run -w @skill-flow/storage test
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/storage/src packages/storage/src/tests
git commit -m "feat: write state schema version two"
```

### Task 4: Add V2 collection source kind contract

**Files:**

- Modify: `packages/domain/src/types.ts`
- Modify: `packages/storage/src/store.ts`
- Test: `packages/storage/src/tests/store.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests:

```ts
test("writes collection source kind in v2 manifest and lock", async () => {
  await store.writeState(
    {
      schemaVersion: 2,
      migrationGeneration: "mg_test",
      sources: [
        {
          id: "collection-1",
          kind: "collection",
          identity: {
            provider: "collection",
            locator: "collection:collection-1",
            canonicalLocator: "collection:collection-1",
          },
          displayName: "Frontend Collection",
          originalDisplayName: "Frontend Collection",
          addedAt: "2026-06-04T00:00:00.000Z",
          selectionMode: "partial",
        },
      ],
      bindings: {},
    },
    {
      schemaVersion: 2,
      migrationGeneration: "mg_test",
      updatedAt: "2026-06-04T00:00:00.000Z",
      sources: [
        {
          id: "collection-1",
          kind: "collection",
          identity: {
            provider: "collection",
            locator: "collection:collection-1",
            canonicalLocator: "collection:collection-1",
          },
          displayName: "Frontend Collection",
          originalDisplayName: "Frontend Collection",
          checkoutPath: "/tmp/state/source/collection/collection-1",
          updatedAt: "2026-06-04T00:00:00.000Z",
          leafIds: [],
          invalidLeafs: [],
        },
      ],
      leafInventory: [],
      projections: [],
    },
  );

  const manifest = await readJsonFile(path.join(stateRoot, "manifest.json"), {});
  const lock = await readJsonFile(path.join(stateRoot, "lock.json"), {});
  expect(manifest.sources[0].kind).toBe("collection");
  expect(lock.sources[0].kind).toBe("collection");
});

test("normalizes legacy virtual source kind to collection when writing v2", async () => {
  const normalized = normalizeSourceKindForSchemaV2("virtual");
  expect(normalized).toBe("collection");
});
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
npm run -w @skill-flow/storage test -- store.test.ts
```

Expected: fail until V2 source kind support exists.

- [ ] **Step 3: Update domain source kind**

V2 write model uses:

```ts
export type SourceKindV2 = "local" | "git" | "clawhub" | "collection";
```

V1 read model may still accept `"virtual"` inside normalizers and migration code only.

- [ ] **Step 4: Update serializers**

When writing V2:

- write `"collection"`
- never write `"virtual"`
- map legacy `"virtual"` to `"collection"` only at normalizer/migration boundary

- [ ] **Step 5: Run tests**

Run:

```bash
npm run -w @skill-flow/storage test -- store.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/types.ts packages/storage/src/store.ts packages/storage/src/tests/store.test.ts
git commit -m "feat: add collection source kind for schema v2"
```

### Task 5: Add skill collection materialization contract

**Files:**

- Create: `packages/storage/src/skill-collection-materialization.ts`
- Test: `packages/storage/src/tests/skill-collection-materialization.test.ts`
- Modify: `packages/domain/src/types.ts`

- [ ] **Step 1: Write failing tests**

Add tests:

```ts
test("builds materialized collection member from source leaf", () => {
  const member = buildSkillCollectionMemberSnapshot({
    collectionId: "collection-1",
    memberId: "member-1",
    stateRoot: "/tmp/state",
    source: {
      id: "source-a",
      locator: "github:anthropics/skills",
      canonicalLocator: "github:anthropics/skills",
    },
    leaf: {
      id: "leaf-a",
      sourceId: "source-a",
      name: "frontend-design",
      linkName: "frontend-design",
      title: "Frontend Design",
      description: "Design skill",
      relativePath: "skills/frontend-design",
      absolutePath: "/tmp/source/skills/frontend-design",
      skillFilePath: "/tmp/source/skills/frontend-design/SKILL.md",
      contentHash: "hash-a",
      metadataWarnings: [],
      valid: true,
    },
    materializedContentHash: "hash-copied",
    capturedAt: "2026-06-04T00:00:00.000Z",
  });

  expect(member.origin).toMatchObject({
    sourceId: "source-a",
    leafId: "leaf-a",
    repoPath: "skills/frontend-design",
    contentHashAtCapture: "hash-a",
  });
  expect(member.snapshot.materializedPath).toBe(
    "/tmp/state/source/collection/collection-1/member-1",
  );
  expect(member.snapshot.relativePath).toBe("member-1");
  expect(member.snapshot.contentHash).toBe("hash-copied");
  expect(member.updatePolicy).toBe("frozen");
});
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
npm run -w @skill-flow/storage test -- skill-collection-materialization.test.ts
```

Expected: fail because helper does not exist.

- [ ] **Step 3: Add domain types**

Add V2 types:

```ts
export type SkillCollectionRecordV2 = {
  id: string;
  displayName: string;
  materializedSourceId: string;
  members: SkillCollectionMemberV2[];
  hiddenSourceIds: string[];
  restoreSelections: Record<string, SkillCollectionRestoreSelectionV2>;
  createdAt: string;
  updatedAt: string;
};

export type SkillCollectionMemberOriginV2 = {
  sourceId: string;
  leafId: string;
  sourceLocator: string;
  canonicalLocator?: string;
  repoPath: string;
  contentHashAtCapture: string;
  capturedAt: string;
};

export type MaterializedSkillSnapshotV2 = {
  leafId: string;
  name: string;
  linkName: string;
  title: string;
  description: string;
  relativePath: string;
  materializedPath: string;
  skillFilePath: string;
  contentHash: string;
  metadataWarnings: string[];
};

export type SkillCollectionMemberV2 = {
  id: string;
  origin: SkillCollectionMemberOriginV2;
  snapshot: MaterializedSkillSnapshotV2;
  updatePolicy: "frozen" | "manual-refresh";
  addedAt: string;
  refreshedAt?: string;
};

export type SkillCollectionRestoreSelectionV2 = {
  selectedLeafIds: string[];
  enabledTargets: string[];
  bestEffort: true;
  diagnostics?: StateMigrationDiagnostic[];
};
```

- [ ] **Step 4: Implement helper**

Create `packages/storage/src/skill-collection-materialization.ts`:

```ts
import path from "node:path";
import type { LeafRecord, SkillCollectionMemberV2 } from "@skill-flow/domain/types";

export function buildSkillCollectionMemberSnapshot(input: {
  collectionId: string;
  memberId: string;
  stateRoot: string;
  source: {
    id: string;
    locator: string;
    canonicalLocator?: string;
  };
  leaf: LeafRecord;
  materializedContentHash: string;
  capturedAt: string;
}): SkillCollectionMemberV2 {
  const materializedPath = path.join(
    input.stateRoot,
    "source",
    "collection",
    input.collectionId,
    input.memberId,
  );
  const collectionLeafId = `${input.collectionId}:${input.memberId}`;
  return {
    id: input.memberId,
    origin: {
      sourceId: input.source.id,
      leafId: input.leaf.id,
      sourceLocator: input.source.locator,
      ...(input.source.canonicalLocator ? { canonicalLocator: input.source.canonicalLocator } : {}),
      repoPath: input.leaf.relativePath,
      contentHashAtCapture: input.leaf.contentHash,
      capturedAt: input.capturedAt,
    },
    snapshot: {
      leafId: collectionLeafId,
      name: input.leaf.name,
      linkName: input.leaf.linkName,
      title: input.leaf.title,
      description: input.leaf.description,
      relativePath: input.memberId,
      materializedPath,
      skillFilePath: path.join(materializedPath, "SKILL.md"),
      contentHash: input.materializedContentHash,
      metadataWarnings: [...input.leaf.metadataWarnings],
    },
    updatePolicy: "frozen",
    addedAt: input.capturedAt,
  };
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm run -w @skill-flow/storage test -- skill-collection-materialization.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/types.ts packages/storage/src/skill-collection-materialization.ts packages/storage/src/tests/skill-collection-materialization.test.ts
git commit -m "feat: define materialized skill collection members"
```

## Stage 2 固化自检

Stage 2 完成后，本文必须满足：

```json
{
  "stateMigrationStatusHasIncomplete": true,
  "currentStatusIncludesMigrationGeneration": true,
  "authoritySerializersWriteGeneration": true,
  "cacheSerializersDoNotControlGeneration": true,
  "restoreSelectionTypeIsNamed": true,
  "localSourceChoiceTypeIsNamed": true,
  "legacyFieldsRemainAtNormalizerBoundary": true,
  "v2CoreModelDoesNotConsumeLegacyIds": true
}
```

Stage 3 输入要求：

- `02-migration-tool.md` 必须使用 `inspectStateMigrationStatus` 的 `current | migration-required | incomplete | invalid` 状态。
- migration service 遇到 marker、generation 缺失或 generation 不一致时返回 `STATE_MIGRATION_INCOMPLETE`。
- migration service 写入 authority files 时必须写同一个 `migrationGeneration`。
- migration service 写入 collection restore 数据时必须写 `restoreSelections`，不能写旧的 restore 字段名。

自检命令：

```bash
rg -n "status: \"incomplete\"|STATE_MIGRATION_INCOMPLETE|migrationGeneration|restoreSelections|sourceChoiceId" plans/2026-06-04-state-schema-v2/01-state-contract.md
rg -n "migrationGeneration\\?:|Restore""Snapshot|restore""Snapshots|source""Key|Draft""BindingV2" plans/2026-06-04-state-schema-v2/01-state-contract.md
rg -n "selected""SkillIds|canonical""Repo|skill""Ids|selected""ChoiceId: \"origin\"" plans/2026-06-04-state-schema-v2/01-state-contract.md
```

预期：

- 第一条命令命中状态、generation、restore selection 和 local choice 契约。
- 第二条命令无命中。
- 第三条命令只命中 legacy normalizer、compat payload 或禁止进入 V2 core model 的说明。
