# 数据结构盘点、术语表与闭环审查

日期：2026-06-04

## 目标

本文把当前应用中已经出现的数据结构按功能域提取出来，用 JSON 形态展示其职责，再基于这些结构建立统一术语表，最后反推现有结构和 V2 计划中仍可能存在的逻辑漏洞。

范围：

- 当前代码中的 V1 / runtime 结构，主要来自 `packages/domain/src/types.ts`。
- 当前计划中的 V2 目标结构，主要来自本目录内 `00-data-model.md` 和 import contract 计划。
- 不覆盖 UI 组件内部的临时 view state，除非它会跨 bridge 或写入 state root。

## 数据结构总览

### 1. 结果与诊断

```json
{
  "Result": {
    "ok": true,
    "data": {},
    "warnings": [
      {
        "code": "STRING_CODE",
        "message": "Human readable warning"
      }
    ],
    "errors": []
  },
  "FailureResult": {
    "ok": false,
    "warnings": [],
    "errors": [
      {
        "code": "STRING_CODE",
        "message": "Human readable error"
      }
    ]
  }
}
```

说明：这是通用返回结构。V2 中应继续保留，但业务失败需要和 bridge 协议失败区分。业务失败进入 result data 或 diagnostics，协议错误进入 bridge envelope。

### 2. Query / Bridge Runtime Results

当前结构：

```json
{
  "workflowSummary": {
    "source": {
      "id": "source-id",
      "locator": "github:owner/repo",
      "kind": "git",
      "displayName": "Repo Name"
    },
    "lock": {
      "id": "source-id",
      "checkoutPath": "/Users/me/.skillflow/source/git/source-id",
      "leafIds": ["source-id:skills/foo"]
    },
    "leafs": [
      {
        "id": "source-id:skills/foo",
        "relativePath": "skills/foo",
        "contentHash": "hash-leaf"
      }
    ],
    "bindings": {
      "selectedLeafIds": ["source-id:skills/foo"],
      "targets": {
        "codex": {
          "enabled": true,
          "leafIds": ["source-id:skills/foo"]
        }
      }
    },
    "activeTargetCount": 1,
    "health": "HEALTHY",
    "issueCounts": {
      "warning": 0,
      "error": 0
    }
  },
  "doctorReport": {
    "status": "HEALTHY",
    "issues": [
      {
        "severity": "warning",
        "sourceId": "source-id",
        "sourceLabel": "Repo Name",
        "target": "codex",
        "leafId": "source-id:skills/foo",
        "leafLabel": "Foo",
        "code": "DRIFT_DETECTED",
        "message": "Target content differs from lock."
      }
    ]
  },
  "configBootStatus": {
    "phase": "partial_failure",
    "updatedSourceIds": ["source-id"],
    "failedSources": [
      {
        "sourceId": "source-id",
        "message": "Failed to refresh source."
      }
    ]
  }
}
```

说明：这些是 query、TUI、desktop bridge 消费的运行时聚合结果，不写入权威状态。V2 中应只从 `manifest + lock + preferences + collections + diagnostics` 派生；如果读取到 V1 或半迁移状态，必须先经过 normalizer 或返回明确诊断，不能让 UI 自己猜 schema。

### 3. Manifest

当前结构：

```json
{
  "schemaVersion": 1,
  "sources": [
    {
      "id": "source-id",
      "locator": "github:owner/repo",
      "kind": "git",
      "displayName": "Repo Name",
      "originalDisplayName": "Repo Name",
      "addedAt": "2026-06-04T00:00:00.000Z",
      "requestedPath": "skills",
      "selectionMode": "partial",
      "originLocator": "github:owner/repo",
      "originRequestedPath": "skills"
    }
  ],
  "bindings": {
    "source-id": {
      "selectedLeafIds": ["source-id:skills/foo"],
      "targets": {
        "codex": {
          "enabled": true,
          "leafIds": ["source-id:skills/foo"]
        }
      }
    }
  }
}
```

说明：`manifest` 记录用户声明安装了哪些 source，以及 source 与 target 的绑定关系。当前 `SourceManifestRecord` 把 source identity 拆散为 `locator/requestedPath/originLocator` 等字段；V2 计划收敛到 `identity` 对象。

V2 目标结构：

```json
{
  "schemaVersion": 2,
  "sources": [
    {
      "id": "source-id",
      "kind": "git",
      "identity": {
        "provider": "github",
        "locator": "github:owner/repo",
        "canonicalLocator": "github:owner/repo",
        "requestedPath": "skills",
        "originLocator": "github:owner/repo",
        "originRequestedPath": "skills"
      },
      "displayName": "Repo Name",
      "originalDisplayName": "Repo Name",
      "addedAt": "2026-06-04T00:00:00.000Z",
      "selectionMode": "partial",
      "metadata": {
        "title": "Repo Name",
        "sourceUrl": "https://github.com/owner/repo"
      }
    }
  ],
  "bindings": {
    "source-id": {
      "selectedLeafIds": ["source-id:skills/foo"],
      "targets": {
        "codex": {
          "enabled": true,
          "leafIds": ["source-id:skills/foo"],
          "strategy": "symlink",
          "updatedAt": "2026-06-04T00:00:00.000Z"
        }
      }
    }
  }
}
```

闭环要求：`bindings[*].selectedLeafIds` 表达 source 级选择，`targets[*].leafIds` 表达 target 级实际启用 skill。二者不是重复字段，因为当前功能允许不同 target 启用不同 leaf。

当前 V1 还可能出现 `kind: "virtual"` 的 source。V2 读取时只能在 normalizer/migration 边界接受 `virtual`，写回必须统一为 `kind: "collection"`。

### 4. Lock File

当前结构：

```json
{
  "schemaVersion": 1,
  "sources": [
    {
      "id": "source-id",
      "locator": "github:owner/repo",
      "kind": "git",
      "displayName": "Repo Name",
      "originalDisplayName": "Repo Name",
      "checkoutPath": "/Users/me/.skillflow/source/git/source-id",
      "updatedAt": "2026-06-04T00:00:00.000Z",
      "leafIds": ["source-id:skills/foo"],
      "invalidLeafs": [],
      "duplicateLeafs": [
        {
          "path": "skills/foo-copy",
          "keptPath": "skills/foo"
        }
      ],
      "commitSha": "abc123",
      "originBranch": "main",
      "contentHash": "hash-source",
      "versionMode": "floating",
      "importMode": "explicit-add"
    }
  ],
  "leafInventory": [
    {
      "id": "source-id:skills/foo",
      "sourceId": "source-id",
      "name": "foo",
      "linkName": "foo",
      "title": "Foo",
      "description": "Foo skill",
      "relativePath": "skills/foo",
      "absolutePath": "/Users/me/.skillflow/source/git/source-id/skills/foo",
      "skillFilePath": "/Users/me/.skillflow/source/git/source-id/skills/foo/SKILL.md",
      "contentHash": "hash-leaf",
      "metadataWarnings": [],
      "valid": true
    }
  ],
  "deployments": [
    {
      "sourceId": "source-id",
      "leafId": "source-id:skills/foo",
      "target": "codex",
      "targetPath": "/Users/me/.codex/skills/foo",
      "strategy": "symlink",
      "status": "active",
      "contentHash": "hash-leaf",
      "appliedAt": "2026-06-04T00:00:00.000Z"
    }
  ],
  "projections": [
    {
      "mode": "managed",
      "sourceId": "source-id",
      "leafId": "source-id:skills/foo",
      "target": "codex",
      "targetPath": "/Users/me/.codex/skills/foo",
      "strategy": "symlink",
      "status": "active",
      "contentHash": "hash-leaf",
      "appliedAt": "2026-06-04T00:00:00.000Z"
    }
  ]
}
```

说明：`lock` 记录 source 的实际解析结果、leaf inventory 和部署投影。当前同时存在 `deployments` 与 `projections`，V2 只保留 `projections`。`duplicateLeafs` 是 inventory 扫描诊断，不必长期持久化为权威字段，但 V2 diagnostics 必须能表达 `path` 与 `keptPath`，否则 selector、linkName、aliases 的冲突无法解释。

V2 目标结构：

```json
{
  "schemaVersion": 2,
  "updatedAt": "2026-06-04T00:00:00.000Z",
  "sources": [
    {
      "id": "source-id",
      "kind": "git",
      "identity": {
        "provider": "github",
        "locator": "github:owner/repo",
        "canonicalLocator": "github:owner/repo"
      },
      "displayName": "Repo Name",
      "originalDisplayName": "Repo Name",
      "checkoutPath": "/Users/me/.skillflow/source/git/source-id",
      "updatedAt": "2026-06-04T00:00:00.000Z",
      "leafIds": ["source-id:skills/foo"],
      "invalidLeafs": [],
      "sourceRevision": {
        "commitSha": "abc123",
        "branch": "main"
      },
      "importInfo": {
        "mode": "explicit-add"
      }
    }
  ],
  "leafInventory": [
    {
      "id": "source-id:skills/foo",
      "sourceId": "source-id",
      "name": "foo",
      "linkName": "foo",
      "title": "Foo",
      "description": "Foo skill",
      "relativePath": "skills/foo",
      "absolutePath": "/Users/me/.skillflow/source/git/source-id/skills/foo",
      "skillFilePath": "/Users/me/.skillflow/source/git/source-id/skills/foo/SKILL.md",
      "contentHash": "hash-leaf",
      "metadataWarnings": [],
      "valid": true,
      "selectors": {
        "skillName": "foo",
        "linkName": "foo",
        "aliases": []
      }
    }
  ],
  "projections": [
    {
      "mode": "managed",
      "sourceId": "source-id",
      "leafId": "source-id:skills/foo",
      "target": "codex",
      "targetPath": "/Users/me/.codex/skills/foo",
      "strategy": "symlink",
      "status": "active",
      "contentHash": "hash-leaf",
      "appliedAt": "2026-06-04T00:00:00.000Z"
    }
  ]
}
```

注意：`absolutePath` 和 `skillFilePath` 可由 `checkoutPath + relativePath` 推导。当前应用大量使用这些字段，V2 如果继续持久化，需要把它们定义为 lock runtime snapshot 字段，并在 state root 迁移或 checkout path 改变时重建。

### 5. Source Update / Repair Result

当前结构：

```json
{
  "updated": [
    {
      "sourceId": "source-id",
      "changed": true,
      "requestedPath": "skills",
      "selectionMode": "partial",
      "addedLeafIds": ["source-id:skills/new"],
      "removedLeafIds": ["source-id:skills/old"],
      "invalidatedLeafIds": ["source-id:skills/broken"],
      "diffs": [
        {
          "kind": "moved",
          "sourceId": "source-id",
          "leafId": "source-id:skills/foo-renamed",
          "relativePath": "skills/foo-renamed",
          "contentHash": "hash-new",
          "previousLeafId": "source-id:skills/foo",
          "previousRelativePath": "skills/foo",
          "previousContentHash": "hash-old"
        },
        {
          "kind": "changed",
          "sourceId": "source-id",
          "leafId": "source-id:skills/bar",
          "relativePath": "skills/bar",
          "contentHash": "hash-new",
          "previousContentHash": "hash-old"
        }
      ]
    }
  ]
}
```

说明：这是 update/repair 的运行时结果，不写权威状态。V2 需要明确 `moved` 必须携带 previous 字段；selection、projection、project draft 的迁移或修复应基于 diff 解析，而不是只按新 leaf inventory 覆盖。

### 6. Direct Add / Target Detection

当前结构：

```json
{
  "addSourceDraftOptions": {
    "skillNames": ["foo"],
    "agentTargets": ["codex"],
    "draft": {
      "enabledTargets": ["codex"],
      "selectedLeafIds": ["source-id:skills/foo"]
    },
    "skipTargetDetection": false
  },
  "addSourcePreparation": {
    "sourceId": "source-id",
    "availableTargets": ["codex"],
    "draft": {
      "enabledTargets": ["codex"],
      "selectedLeafIds": ["source-id:skills/foo"]
    },
    "leafs": [
      {
        "id": "source-id:skills/foo",
        "relativePath": "skills/foo",
        "contentHash": "hash-leaf"
      }
    ]
  },
  "channelDetection": {
    "target": "codex",
    "strategy": "symlink",
    "available": true,
    "rootPath": "/Users/me/.codex/skills"
  }
}
```

说明：这是 CLI/TUI 直接 add source 的运行时准备结构，不等同于 import preview/preparation，也不写入权威状态。V2 中 `skillNames` 应在 add source 流程内解析为 selector 或 leaf id 后再进入 binding，不能复用 import preview 的 `selectedSkillIds` 语义。

### 7. Preferences

当前结构：

```json
{
  "schemaVersion": 1,
  "pinnedSourceIds": ["source-id"],
  "selectedProjectScope": {
    "kind": "project",
    "projectId": "project-id"
  },
  "recentProjects": [
    {
      "projectId": "project-id",
      "title": "Project",
      "lastActivityAt": "2026-06-04T00:00:00.000Z",
      "projectPath": "/Users/me/project",
      "tools": ["codex"]
    }
  ],
  "projectDrafts": {
    "project-id": {
      "source-id": {
        "enabledTargets": ["codex"],
        "selectedLeafIds": ["source-id:skills/foo"]
      }
    }
  },
  "customTargets": [
    {
      "id": "my-agent",
      "name": "My Agent",
      "globalPath": "/Users/me/.my-agent/skills",
      "projectPathTemplate": ".my-agent/skills",
      "strategy": "copy",
      "createdAt": "2026-06-04T00:00:00.000Z",
      "updatedAt": "2026-06-04T00:00:00.000Z"
    }
  ],
  "agentDisplayOrder": ["codex", "claude-code"]
}
```

说明：preferences 保存用户偏好和 project-scoped draft。这里的 `DraftBinding.selectedLeafIds` 指已安装 source 的 leaf id，不等同于 import preview 的 `selectedSkillIds`。

### 8. Virtual Groups / Collections

当前结构：

```json
{
  "schemaVersion": 1,
  "groups": {
    "group-id": {
      "id": "group-id",
      "displayName": "My Group",
      "includedSkills": [
        {
          "sourceId": "source-id",
          "leafId": "source-id:skills/foo"
        }
      ],
      "hiddenSourceIds": ["source-id"],
      "restoreSnapshots": {
        "source-id": {
          "selectedLeafIds": ["source-id:skills/foo"],
          "enabledTargets": ["codex"]
        }
      },
      "createdAt": "2026-06-04T00:00:00.000Z",
      "updatedAt": "2026-06-04T00:00:00.000Z"
    }
  }
}
```

说明：当前 virtual group 只保存 ref，不保存用户确认时的内容。如果原 skill 删除或更新，group 语义会漂移。

V2 目标结构：

```json
{
  "schemaVersion": 2,
  "collections": {
    "collection-id": {
      "id": "collection-id",
      "materializedSourceId": "collection-id",
      "displayName": "My Collection",
      "members": [
        {
          "id": "member-id",
          "origin": {
            "sourceId": "source-id",
            "leafId": "source-id:skills/foo",
            "sourceLocator": "github:owner/repo",
            "canonicalLocator": "github:owner/repo",
            "repoPath": "skills/foo",
            "contentHashAtCapture": "hash-origin",
            "capturedAt": "2026-06-04T00:00:00.000Z"
          },
          "snapshot": {
            "leafId": "collection-id:member-id",
            "name": "foo",
            "linkName": "foo",
            "title": "Foo",
            "description": "Foo skill",
            "relativePath": "member-id",
            "materializedPath": "/Users/me/.skillflow/source/collection/collection-id/member-id",
            "skillFilePath": "/Users/me/.skillflow/source/collection/collection-id/member-id/SKILL.md",
            "contentHash": "hash-copied",
            "metadataWarnings": []
          },
          "updatePolicy": "frozen",
          "addedAt": "2026-06-04T00:00:00.000Z"
        }
      ],
      "hiddenSourceIds": ["source-id"],
      "restoreSelections": {
        "source-id": {
          "selectedLeafIds": ["source-id:skills/foo"],
          "enabledTargets": ["codex"],
          "bestEffort": true
        }
      },
      "createdAt": "2026-06-04T00:00:00.000Z",
      "updatedAt": "2026-06-04T00:00:00.000Z"
    }
  }
}
```

说明：V2 collection 是实体组合。`origin` 用于比较和提示，`snapshot` 是部署使用的冻结内容。`materializedSourceId` 必须对应 manifest/lock 中 `kind: "collection"` 的 source；如果未来允许它不等于 `collection.id`，所有 bindings、leafInventory、projections 都必须使用 `materializedSourceId` 作为 source 前缀。

### 9. Source Metadata Cache

当前结构：

```json
{
  "source-id": {
    "sourceId": "source-id",
    "provider": "github",
    "status": "ready",
    "reasonCode": "provider_data_unavailable",
    "retryable": false,
    "checkedAt": "2026-06-04T00:00:00.000Z",
    "expiresAt": "2026-06-05T00:00:00.000Z",
    "data": {
      "provider": "github",
      "repoLabel": "owner/repo",
      "repoUrl": "https://github.com/owner/repo",
      "sourceUrl": "https://github.com/owner/repo",
      "starCount": 100,
      "summary": "Repo summary"
    }
  }
}
```

说明：`catalog/source-metadata.json` 是按已安装 `sourceId` 索引的可重建缓存，不等同于 repo/canonical 级的 import data cache。V2 migration 可以 prune 后重建，不能并入权威 manifest/lock，也不能反向生成 source identity。

### 10. Import Data Cache

当前结构：

```json
{
  "searches": {
    "query-key": {
      "query": "resume",
      "checkedAt": "2026-06-04T00:00:00.000Z",
      "expiresAt": "2026-06-05T00:00:00.000Z",
      "hits": [
        {
          "id": "hit-id",
          "skillId": "resume-writer",
          "title": "Resume Writer",
          "source": "skills",
          "canonicalRepo": "anthropics/skills"
        }
      ],
      "groups": ["anthropics/skills"]
    }
  },
  "repos": {
    "github:owner/repo": {
      "canonicalRepo": "owner/repo",
      "checkedAt": "2026-06-04T00:00:00.000Z",
      "expiresAt": "2026-06-05T00:00:00.000Z",
      "identity": {
        "canonicalRepo": "owner/repo",
        "aliases": ["github:owner/repo"],
        "origins": ["github", "skills"]
      },
      "providers": {},
      "resolved": {
        "title": "Repo",
        "fieldSources": {
          "title": "github"
        }
      }
    }
  },
  "recommendations": {
    "official": {
      "id": "official",
      "checkedAt": "2026-06-04T00:00:00.000Z",
      "expiresAt": "2026-06-05T00:00:00.000Z",
      "groups": ["anthropics/skills"]
    }
  }
}
```

说明：import data cache 是可重建缓存，不是权威状态。当前 `canonicalRepo` 与 `identity.canonicalRepo` 重复；V2 应改名为 `canonicalLocator`，并只保留 `identity.canonicalLocator`。

### 11. Import Discovery / Group Candidate

当前结构：

```json
{
  "groupCandidate": {
    "id": "github:anthropics/skills",
    "provider": "skills",
    "locator": "github:anthropics/skills",
    "canonicalRepo": "anthropics/skills",
    "aliases": ["github:anthropics/skills"],
    "title": "Anthropic Skills",
    "installed": false,
    "summary": "Recommended skill source",
    "sourceUrl": "https://skills.sh/anthropics/skills",
    "repoUrl": "https://github.com/anthropics/skills",
    "skillCount": 12,
    "matchedSkills": [
      {
        "skillId": "frontend-design",
        "title": "frontend-design",
        "installs": 1000
      }
    ],
    "snapshot": {
      "canonicalRepo": "anthropics/skills",
      "provider": "skills",
      "skills": [
        {
          "skillId": "frontend-design",
          "title": "frontend-design"
        }
      ]
    },
    "enrichState": {
      "status": "ready"
    },
    "previewState": {
      "status": "idle"
    },
    "localImport": {
      "validationStatus": "matched",
      "selectedChoiceId": "origin",
      "choices": []
    }
  }
}
```

说明：这是推荐页/搜索页进入 preview 前的组级候选结构。V2 中 `canonicalRepo` 应改为 `canonicalLocator`，`source` 字段不得继续表示 provider；推荐页状态只能作为 discovery cache/view model，不作为 source 权威状态。

### 12. Import Preview / Draft / Commit

当前结构：

```json
{
  "preview": {
    "status": "ready",
    "locator": "github:anthropics/skills",
    "canonicalRepo": "anthropics/skills",
    "preparationId": "prep-id",
    "preparationStatus": "ready",
    "preparedAt": "2026-06-04T00:00:00.000Z",
    "expiresAt": "2026-06-05T00:00:00.000Z",
    "selectedSkillIds": ["skills/frontend-design"],
    "enabledTargets": ["codex"],
    "skills": [
      {
        "id": "skills/frontend-design",
        "title": "frontend-design",
        "summary": "Design skill",
        "selectedByDefault": true
      }
    ],
    "targets": [
      {
        "id": "codex",
        "selectedByDefault": true
      }
    ]
  },
  "draft": {
    "selectedSkillIds": ["skills/frontend-design"],
    "enabledTargets": ["codex"]
  },
  "commitDraft": {
    "preparationId": "prep-id",
    "selectedSkillIds": ["skills/frontend-design"],
    "enabledTargets": ["codex"]
  }
}
```

说明：当前 `selectedSkillIds` 多义。它可能是 UI id、provider id、archive path、repo path 或 leaf id。

当前 prepare / commit 返回结构：

```json
{
  "preparationResult": {
    "status": "ready",
    "preparationId": "prep-id",
    "locator": "github:anthropics/skills",
    "canonicalRepo": "anthropics/skills",
    "preparedAt": "2026-06-04T00:00:00.000Z",
    "expiresAt": "2026-06-05T00:00:00.000Z"
  },
  "failedPreparationResult": {
    "status": "failed",
    "preparationId": "prep-id",
    "reasonCode": "provider_request_failed",
    "retryable": true
  },
  "importSourceResult": {
    "status": "ready",
    "sourceId": "source-id",
    "canonicalRepo": "anthropics/skills",
    "preparationId": "prep-id",
    "usedPreparation": true
  },
  "failedImportSourceResult": {
    "status": "failed",
    "reasonCode": "IMPORT_SELECTOR_NOT_FOUND",
    "retryable": false
  }
}
```

说明：V2 返回契约需要同步改为 `canonicalLocator`，并在 failed 分支保留 `reasonCode/retryable/diagnostics`。业务失败仍是 result data，不应伪装成 bridge envelope 失败。

V2 目标结构：

```json
{
  "preview": {
    "version": 2,
    "status": "ready",
    "locator": "github:anthropics/skills",
    "canonicalLocator": "github:anthropics/skills",
    "previewSource": {
      "provider": "github",
      "mode": "archiveFallback"
    },
    "preparation": {
      "preparationId": "prep-id",
      "status": "ready",
      "preparedAt": "2026-06-04T00:00:00.000Z",
      "expiresAt": "2026-06-05T00:00:00.000Z"
    },
    "selectedSkillIds": ["skills/frontend-design"],
    "selectedSkills": [
      {
        "uiId": "skill_b6hm2m3d9nd8c4k7q2ea",
        "selector": {
          "kind": "repoPath",
          "path": "skills/frontend-design"
        }
      }
    ],
    "enabledTargets": ["codex"],
    "skills": [
      {
        "id": "skills/frontend-design",
        "uiId": "skill_b6hm2m3d9nd8c4k7q2ea",
        "title": "frontend-design",
        "summary": "Design skill",
        "selectedByDefault": true,
        "selector": {
          "kind": "repoPath",
          "path": "skills/frontend-design"
        },
        "origin": {
          "provider": "github",
          "archivePath": "skills-main/skills/frontend-design"
        },
        "diagnostics": {
          "confidence": "normalized"
        }
      }
    ],
    "targets": [
      {
        "id": "codex",
        "selectedByDefault": true
      }
    ]
  },
  "draft": {
    "selectedSkills": [
      {
        "uiId": "skill_b6hm2m3d9nd8c4k7q2ea",
        "selector": {
          "kind": "repoPath",
          "path": "skills/frontend-design"
        }
      }
    ],
    "enabledTargets": ["codex"]
  }
}
```

说明：V2 commit 不能依赖 `uiId` 或 provider id 找 leaf，只能通过 `selector` 绑定 preparation record 里的 `PreparedSkillRef`。

### 13. Import Preparation Cache

当前结构：

```json
{
  "records": {
    "prep-id": {
      "id": "prep-id",
      "cacheKey": "github:anthropics/skills",
      "locator": "github:anthropics/skills",
      "canonicalRepo": "anthropics/skills",
      "sourceKind": "git",
      "checkoutPath": "/Users/me/.skillflow/catalog/git/prep-id",
      "sourceId": "source-id",
      "displayName": "skills",
      "requestedPath": "skills",
      "status": "ready",
      "preparedAt": "2026-06-04T00:00:00.000Z",
      "expiresAt": "2026-06-05T00:00:00.000Z",
      "commitSha": "abc123",
      "skillIds": ["skills/frontend-design"],
      "availableTargets": ["codex"]
    }
  },
  "locatorIndex": {
    "github:anthropics/skills": "prep-id"
  }
}
```

V2 目标结构：

```json
{
  "schemaVersion": 2,
  "records": {
    "prep-id": {
      "id": "prep-id",
      "locator": "github:anthropics/skills",
      "cacheKey": "github:anthropics/skills",
      "canonicalLocator": "github:anthropics/skills",
      "sourceKind": "git",
      "checkoutPath": "/Users/me/.skillflow/catalog/git/prep-id",
      "sourceId": "source-id",
      "displayName": "skills",
      "requestedPath": "skills",
      "status": "ready",
      "preparedAt": "2026-06-04T00:00:00.000Z",
      "expiresAt": "2026-06-05T00:00:00.000Z",
      "sourceRevision": {
        "commitSha": "abc123"
      },
      "skillRefs": [
        {
          "leafId": "source-id:skills/frontend-design",
          "name": "frontend-design",
          "linkName": "frontend-design",
          "repoPath": "skills/frontend-design",
          "contentHash": "hash-leaf"
        }
      ],
      "availableTargets": ["codex"]
    }
  },
  "locatorIndex": {
    "github:anthropics/skills": "prep-id"
  }
}
```

说明：V2 新 record 只写 `skillRefs`。旧 `skillIds` 只在 normalizer 中兼容读取。

### 14. Local Import / Local Scan

当前结构：

```json
{
  "localImport": {
    "validationStatus": "matched",
    "selectedChoiceId": "origin",
    "choices": [
      {
        "id": "origin",
        "label": "Origin",
        "locator": "github:owner/repo",
        "selectedSkillIds": ["skills/foo"]
      }
    ],
    "detectedSkills": [
      {
        "id": "foo",
        "title": "Foo",
        "localPath": "/Users/me/.codex/skills/foo",
        "discoveredTargets": ["codex"],
        "validationStatus": "matched",
        "originSkillId": "skills/foo"
      }
    ]
  },
  "localScan": {
    "id": "scan-group",
    "title": "Local Skills",
    "status": "matched",
    "sourcePaths": [
      {
        "path": "/Users/me/.codex/skills/foo",
        "kind": "target-agent",
        "contentHash": "hash-local",
        "alreadyManaged": false,
        "target": "codex"
      }
    ],
    "skills": [
      {
        "id": "foo",
        "title": "Foo",
        "status": "matched",
        "variants": [
          {
            "id": "foo-local",
            "path": "/Users/me/.codex/skills/foo",
            "contentHash": "hash-local",
            "selectedByDefault": true,
            "importable": true
          }
        ],
        "selectionRequired": false,
        "originSkillId": "skills/foo"
      }
    ],
    "importChoices": [
      {
        "id": "origin",
        "label": "Origin",
        "locator": "github:owner/repo",
        "selectedSkillIds": ["skills/foo"],
        "enabled": true
      }
    ],
    "origin": {
      "canonicalRepo": "owner/repo",
      "locator": "github:owner/repo",
      "previewStatus": "ready"
    }
  }
}
```

说明：local import 和 local scan 仍使用 `selectedSkillIds`。V2 应补 `selectedSkills`，并把旧字段限制在兼容边界。

### 15. Target / Deployment

当前结构：

```json
{
  "targetDefinition": {
    "id": "codex",
    "label": "Codex",
    "strategy": "symlink",
    "kind": "builtin",
    "isMutable": false,
    "globalPath": "/Users/me/.codex/skills"
  },
  "deploymentPlan": {
    "actions": [
      {
        "kind": "create",
        "sourceId": "source-id",
        "leafId": "source-id:skills/foo",
        "target": "codex",
        "strategy": "symlink",
        "sourcePath": "/Users/me/.skillflow/source/git/source-id/skills/foo",
        "targetPath": "/Users/me/.codex/skills/foo",
        "contentHash": "hash-leaf"
      },
      {
        "kind": "update",
        "sourceId": "source-id",
        "leafId": "source-id:skills/foo",
        "target": "codex",
        "strategy": "symlink",
        "sourcePath": "/Users/me/.skillflow/source/git/source-id/skills/foo",
        "targetPath": "/Users/me/.codex/skills/foo",
        "previousTargetPath": "/Users/me/.codex/skills/foo-old",
        "previousTargetRootPath": "/Users/me/.codex/skills",
        "relocateExternalToTargetPath": "/Users/me/.skillflow/backup/external/foo",
        "contentHash": "hash-new"
      },
      {
        "kind": "blocked",
        "sourceId": "source-id",
        "leafId": "source-id:skills/bar",
        "target": "missing-agent",
        "strategy": "copy",
        "sourcePath": "/Users/me/.skillflow/source/git/source-id/skills/bar",
        "targetPath": "/Users/me/.missing-agent/skills/bar",
        "reason": "Target is not available.",
        "contentHash": "hash-bar"
      }
    ],
    "warnings": [],
    "blocked": []
  }
}
```

说明：target 是部署目的地。`binding` 是用户配置，`projection` 是已应用状态，`deploymentPlan` 是下一次 apply 的动作计划。

## 统一术语表

| 术语 | 推荐名称 | 不推荐混用 | 定义 |
| --- | --- | --- | --- |
| 状态根目录 | `stateRoot` | app data dir | `~/.skillflow` 或 `SKILL_FLOW_STATE_ROOT` 指向的目录。 |
| 权威状态 | authoritative state | cache, target dir | `manifest.json`、`lock.json`、`preferences.json`、`collections.json` 和 collection materialized 内容。 |
| 缓存 | cache | state | 可删除重建的数据，如 import data、metadata、preparation、git checkout cache。 |
| Source 实例 | `source` / `sourceId` | repo, group | 用户安装到 Skill Flow 的来源实例。一个 canonical repo 可对应多个 source 实例。 |
| Source 身份 | `SourceIdentity` | locator fields | 描述 source 来自哪里，包括 `provider`、`locator`、`canonicalLocator`、`requestedPath`。 |
| Identity provider | `identity.provider` | kind, sourceKind | source 身份命名空间，如 `github`、`skills`、`local`、`clawhub`、`collection`。 |
| Preview provider | `origin.provider` | source.kind | preview/import 数据来源，如 `github` archive fallback 或 `skills` catalog。 |
| Source kind | `source.kind` / `kind` | provider | 本地 materialization 类型，如 `local`、`git`、`clawhub`、`collection`。非 source record 中引用该类型时可命名为 `sourceKind`。 |
| Locator | `locator` | repo, path | 用户输入或推荐页发起导入时使用的定位字符串。 |
| Canonical Locator | `canonicalLocator` | canonicalRepo, cacheKey | 稳定来源身份，如 `github:owner/repo`。不包含 repo subpath。 |
| Cache key | `cacheKey` / `preparationCacheKey` | canonicalLocator | 短期缓存查找键，可包含 locator、requestedPath、provider mode、checkout mode；不得写入权威文件。 |
| Requested Path | `requestedPath` | selector, repoPath | 用户请求导入 source 的 repo 子路径。属于 source identity。 |
| Skill leaf | `leaf` | skill id | source 中可独立部署的 skill 单元。 |
| Leaf id | `leafId` | skillId, uiId | source 实例下的 leaf 引用，可在 prepare 阶段预分配；只有写入 lock 后才成为权威 leaf id。 |
| Repo path | `repoPath` / `relativePath` | archivePath, providerPath | source checkout 根目录内的 POSIX 相对路径。 |
| Archive path | `archivePath` | repoPath | archive 解压树内路径，可包含 archive root，只用于诊断和 legacy 恢复。 |
| Provider path | `providerPath` | repoPath | provider 返回的原始路径，只用于诊断和 legacy 恢复。 |
| Source locator at capture | `sourceLocator` | canonicalLocator | collection capture 时原 source 的 `identity.locator`，用于展示和 refresh diagnostics。 |
| Selector | `selector` | selectedSkillIds | import commit 前用于绑定 leaf 的结构化选择器。 |
| Source selection key | `sourceSelectionKey` | sourceKey, canonicalLocator alone | 生成 `uiId` 的来源维度，由 `canonicalLocator + requestedPath` 规范化组合；不包含 preview provider、archive fallback、checkout mode。 |
| Selector key | `selectorKey` | uiId | selector 的规范化字符串，如 `repoPath:skills/foo`。 |
| UI id | `uiId` | id, leafId | preview UI 勾选状态 key，由 `sourceSelectionKey + selectorKey` hash 派生。 |
| Legacy selection id | `id` / `legacyAliases` | uiId | 兼容旧 `selectedSkillIds` 的字符串选择值。 |
| Prepared skill ref | `PreparedSkillRef` | skillIds | preparation record 中可被 selector 绑定的 leaf 引用。 |
| Import draft | `ImportDraftV2` | binding | import commit 前用户选择的 skill 和 target，使用 `selectedSkills[].selector`。 |
| Project source draft | `ProjectSourceDraftV2` | binding, DraftBindingV2 | 已安装 source 在 project scope 下尚未 apply 的选择，使用 leaf id。 |
| Binding | `binding` | deployment | manifest 中 source 到 target 的期望配置。 |
| Projection | `projection` | deployment record | lock 中已经应用或检测到的 target 投影状态。 |
| Deployment action | `DeploymentAction` | projection | 下一次 apply 要执行的动作。 |
| Skill Collection | `collection` | virtual group, bundle | 用户确认的实体技能集合。 |
| Collection member | `member` | includedSkill | collection 内的一个冻结 skill 条目。 |
| Member origin | `memberOrigin` / `origin` in collection member | snapshot | collection member 来源引用，仅用于比较、刷新提示和诊断。 |
| Preview origin | `previewOrigin` / `origin` in preview skill | selector | provider/archive provenance，仅用于展示、诊断和 legacy 恢复。 |
| Materialized snapshot | `materializedSnapshot` / `snapshot` in collection member | origin, providerSnapshot | member 冻结后的 materialized 内容，是 collection 部署来源。 |
| Provider snapshot | `providerSnapshot` / metadata snapshot | materializedSnapshot | provider 或推荐页返回的元数据快照，不作为部署内容来源。 |
| Restore selection | `restoreSelection` / `restoreDraft` | restoreSnapshot | collection 隐藏原 source 时保存的可恢复选择，best-effort。 |
| Preparation | `preparation` | preview cache | import preview/commit 跨请求状态。短期缓存。 |
| Diagnostics | `diagnostics` | errors only | 用于说明 normalized、fallback、warning、business failure 的结构化信息。 |
| Bridge compatibility | compat serializer | core contract | bridge/query 对旧 Swift 或旧 CLI 附加兼容字段的边界层。 |

## 命名规则

1. `id` 只在局部实体内表示该实体自身 id；跨阶段引用必须带语义前缀，例如 `sourceId`、`leafId`、`uiId`。
2. `skillId` 不再作为新 V2 字段名使用。根据场景改为 `leafId`、`providerSkillId`、`uiId` 或 `selector`。
3. `canonicalRepo` 改为 `canonicalLocator`。旧字段只在 compat serializer 或 legacy cache normalizer 出现。
4. `repoPath` 只表示 checkout 根目录内路径。archive 解压根目录路径必须叫 `archivePath`。
5. import draft 使用 `selectedSkills`；已安装 source 的配置 draft 使用 `selectedLeafIds`。
6. `virtual group` 只作为 V1 legacy 名称。V2 统一叫 `collection`。
7. `bundle` 不作为功能术语使用，避免被理解为安装包。
8. `ImportSearchHit.source` 这类 legacy 字段在 V2 中改为 `provider` 或 `resultProvider`，避免和已安装 source 实例混用。
9. `DraftBindingV2` 改名为 `ProjectSourceDraftV2` 或 `ScopedSourceDraftV2`；`binding` 只保留给 manifest 中已声明的期望配置。
10. `repoPath` selector 永远相对完整 checkout root；可以包含 `requestedPath` 作为路径前缀，但不能包含 `locator#path` 标记或 archive root。

## 逻辑漏洞与不闭环审查

### A. 当前 V1 已确认的问题

```json
{
  "issue": "selectedSkillIds 多义",
  "affectedStructures": [
    "ImportDraft",
    "ImportPreviewResult",
    "LocalImportChoice",
    "LocalScanImportChoice"
  ],
  "symptom": "同一字段可能表示 ui id、provider id、archive path、repo path 或 leaf id",
  "v2Closure": "新增 selectedSkills[].selector，selectedSkillIds 只在 bridge/query 边界兼容"
}
```

```json
{
  "issue": "canonicalRepo/cacheKey/locator 混用",
  "affectedStructures": [
    "ImportPreparationRecord",
    "RepoMetadataCacheEntry",
    "UnifiedSourceSnapshot"
  ],
  "symptom": "同一个字符串既可能是 repo 标识、cache key，也可能包含 provider 或 subpath",
  "v2Closure": "canonicalLocator 表示来源身份，cacheKey 只做缓存索引，requestedPath 独立保存"
}
```

```json
{
  "issue": "virtual group 只保存引用，不保存确认时内容",
  "affectedStructures": [
    "VirtualGroupRecord"
  ],
  "symptom": "原始 skill 删除或更新后，group 内容语义变化",
  "v2Closure": "collection member materialize 到 source/collection/*，origin 只用于比较"
}
```

```json
{
  "issue": "prepare record 只有 skillIds",
  "affectedStructures": [
    "ImportPreparationRecord"
  ],
  "symptom": "preview 使用 archive fallback 时 id 形态和 checkout leaf path 不一致，commit 找不到 skill",
  "v2Closure": "prepare record 写 PreparedSkillRef[]，commit 先 selector binding 再删除 record"
}
```

```json
{
  "issue": "deployments 与 projections 并存",
  "affectedStructures": [
    "LockFile"
  ],
  "symptom": "两套结构都描述 target 投影，可能产生写入顺序和读取优先级不一致",
  "v2Closure": "V2 只写 projections，V1 deployments 只在 migration/normalizer 读取"
}
```

### B. V2 计划中仍需明确的问题

```json
{
  "issue": "LeafRecord.absolutePath 和 skillFilePath 是派生字段",
  "affectedStructures": [
    "LeafRecordV2"
  ],
  "risk": "state root 或 checkoutPath 迁移后，持久化 absolutePath 可能失效",
  "recommendation": "二选一：要么从持久化结构移除并运行时派生；要么明确它们是 lock runtime snapshot，并在 migration/repair 时强制重建"
}
```

```json
{
  "issue": "SourceManifestRecordV2 与 SourceLockRecordV2 都保存 identity/displayName",
  "affectedStructures": [
    "ManifestV2",
    "LockFileV2"
  ],
  "risk": "manifest 和 lock 中同一 source identity/display 字段可能不同步",
  "recommendation": "manifest 作为用户声明权威，lock 中 identity/displayName 作为解析快照；需要校验规则：同 sourceId 下 canonicalLocator 不一致时 lock 失效并重建"
}
```

```json
{
  "issue": "SourceBinding.selectedLeafIds 与 TargetBinding.leafIds 看起来重复",
  "affectedStructures": [
    "SourceBindingV2",
    "TargetBindingV2"
  ],
  "risk": "如果缺少约束，target leafIds 可能包含未被 source selectedLeafIds 选中的 leaf",
  "recommendation": "保留两者，但增加 invariant：每个 enabled target 的 leafIds 必须是 selectedLeafIds 的子集；selectionMode=all 时 selectedLeafIds 由当前 leaf inventory 展开后校验"
}
```

```json
{
  "issue": "ImportPreviewResult 同时服务 core 和 bridge compat",
  "affectedStructures": [
    "ImportPreviewResultV2"
  ],
  "risk": "如果 serializer 边界不清，canonicalRepo 和扁平 preparation 字段会再次进入 core",
  "recommendation": "定义 CoreImportPreviewResultV2 与 BridgeImportPreviewResponseV2 两个类型，后者只能在 query/bridge 层追加 legacy aliases"
}
```

```json
{
  "issue": "Local import/local scan 的 selectedSkills 需要和 preview selector 统一",
  "affectedStructures": [
    "LocalImportChoiceV2",
    "LocalScanImportChoiceV2"
  ],
  "risk": "如果 local path 或 originSkillId 继续作为 selectedSkillIds 提交，会复现 import selector 不稳定问题",
  "recommendation": "local choice 必须保存 selectedSkills[].selector；本地单 skill 使用 repoPath '.'"
}
```

```json
{
  "issue": "Collection restore selection 使用原 source leafId",
  "affectedStructures": [
    "SkillCollectionRestoreSelectionV2"
  ],
  "risk": "如果原 source 被删除或 leafId 迁移，restore selection 不能直接恢复",
  "recommendation": "restore selection 保留 legacy leafId 可以接受，但必须标记为 best-effort；恢复失败时展示 diagnostics，不影响 collection snapshot 部署"
}
```

```json
{
  "issue": "providerSkillId 与 legacyAliases 的关系需要边界",
  "affectedStructures": [
    "ImportPreviewSkillV2"
  ],
  "risk": "provider id 如果进入 selector，会把字符串多义转移到新字段",
  "recommendation": "providerSkillId 只在 origin/diagnostics；legacyAliases 只用于兼容旧选择恢复，不参与 core resolver"
}
```

### C. 生命周期闭环风险

#### P0

```json
{
  "issue": "migration atomicity 不是跨文件事务",
  "affectedStructures": [
    "manifest.json",
    "lock.json",
    "preferences.json",
    "collections.json",
    "source/collection/*",
    "virtual-groups.json",
    "catalog/*"
  ],
  "failureScenario": "进程在替换部分权威文件后崩溃，runtime 看到部分 V2 文件并误判为 current。",
  "recommendation": "增加 migration transaction marker 或 generation id。所有权威文件和 collection materialized 内容必须属于同一次 generation；启动发现 marker 或 generation 不一致时返回 STATE_MIGRATION_INCOMPLETE，并恢复 backup 或阻塞提示。virtual-groups.json 删除和 cache prune 只能在 post-commit 全量验证后执行。"
}
```

```json
{
  "issue": "import preparation lifecycle 缺少并发和崩溃恢复闭环",
  "affectedStructures": [
    "ImportPreparationRecordV2.status",
    "locatorIndex",
    "checkoutPath",
    "skillRefs",
    "BoundImportDraft",
    "manifest/lock/projections"
  ],
  "failureScenario": "两个桌面请求同时提交同一 preparationId，或进程在 committing 状态崩溃，可能重复 apply 或永久卡住。",
  "recommendation": "ready -> committing 必须 compare-and-set，并写入 attemptId、commitStartedAt 或 leaseExpiresAt。过期 committing 转为 failed/stale 并保留 diagnostics。第二个 commit 返回 IMPORT_PREPARATION_ALREADY_COMMITTING 或幂等结果。只有 state 写入和 apply 成功后才能删除 preparation。"
}
```

#### P1

```json
{
  "issue": "collectionId 与 materializedSourceId 没有完全闭合",
  "affectedStructures": [
    "SkillCollectionRecordV2.materializedSourceId",
    "members[].snapshot.leafId",
    "manifest.sources",
    "manifest.bindings",
    "lock.sources",
    "lock.leafInventory",
    "projections"
  ],
  "failureScenario": "collection id 与 materialized source id 不同或冲突时，binding、projection、leaf inventory 使用不同 source 前缀而断开。",
  "recommendation": "collection.materializedSourceId 必须存在于 manifest/lock，且 kind === collection。collection leaf id 使用 materializedSourceId 作为 source 前缀，或明确 materializedSourceId === collection.id 并验证唯一性。"
}
```

```json
{
  "issue": "target projection repair 没有完整重建规则",
  "affectedStructures": [
    "SourceBindingV2",
    "TargetBindingV2",
    "ProjectionRecordV2",
    "target definitions",
    "custom targets",
    "collection materialized snapshot"
  ],
  "failureScenario": "target root 改变、custom target 删除、linkName 改变或 collection origin hash 变化时，repair 如果信任旧 targetPath，会写到旧目录或误判 active。",
  "recommendation": "repair 必须从 manifest binding、当前 target definition、lock leaf inventory 重新计算 desired projection。active projection 的 targetPath 必须位于当前 targetRootPath 下；未知 target 标记 blocked，disabled leaf 标记 removed。collection projection 的 contentHash 来自 materialized snapshot，不来自 origin leaf。"
}
```

```json
{
  "issue": "desktop bridge fallback 可能掩盖 selector 语义错误",
  "affectedStructures": [
    "ImportPreviewSkillV2",
    "ImportDraftV2",
    "bridge response envelope",
    "capabilities.importDraftV2",
    "legacy selectedSkillIds"
  ],
  "failureScenario": "BRIDGE_REQUEST_INVALID 同时表示旧 CLI 不支持 V2 和 selector payload 非法；如果都 fallback 到 legacy，会重现 selectedSkillIds 多义问题。",
  "recommendation": "错误码区分 BRIDGE_UNSUPPORTED_IMPORT_DRAFT_V2 与 IMPORT_SELECTOR_INVALID/NOT_FOUND。只有不支持 V2 字段时允许 legacy retry；selector 语义错误必须刷新 preview/prepare。capability 必须来自同一 bridge process 的 bootstrap 或 preview response。"
}
```

#### P2

```json
{
  "issue": "migration prune preparation cache 后，桌面已有 preview 没有失效协议",
  "affectedStructures": [
    "ImportPreviewResultV2.preparation",
    "catalog/import-preparations.json",
    "desktop import view model draft"
  ],
  "failureScenario": "桌面停留在 import preview 页面时执行迁移，cache 被 prune 后用户继续 commit，preparationId 已不存在。",
  "recommendation": "迁移后增加 state/cache epoch。preview response 携带 epoch，commit 时 epoch 不一致返回 IMPORT_PREPARATION_STALE_AFTER_MIGRATION，桌面清空当前 preview/draft 并提示刷新。"
}
```

```json
{
  "issue": "preferences project drafts 没有随 V2 leaf inventory 校验",
  "affectedStructures": [
    "preferences.projectDrafts[*].selectedLeafIds",
    "SkillCollectionRestoreSelectionV2",
    "lock.leafInventory"
  ],
  "failureScenario": "virtual group 迁移重写 leaf id 后，project draft 或 restore selection 仍引用旧 virtual/origin leaf id，后续 apply 选中不存在的 leaf。",
  "recommendation": "迁移后所有 executable draft 的 selectedLeafIds 必须是当前 lock.leafInventory 子集。能确定映射的 virtual leaf id 重写为 collection leaf id；不能确定的保留 diagnostics，并从可执行 draft 中移除或标记 best-effort。"
}
```

### D. 建议补充到后续计划的 invariant

1. `canonicalLocator` 不包含 repo subpath。
2. `cacheKey` 不写入权威文件。
3. `repoPath` 不包含 archive root。
4. `uiId` 不能等于 legacy `id` 作为设计要求；允许偶然相等但不得依赖。
5. `selectedSkills[].selector` 是 import commit 的唯一解析入口。
6. `selectedSkillIds` 只在 bridge/query compat 层出现。
7. V2 新 preparation record 只写 `skillRefs`。
8. collection 部署只读 `snapshot`，不读 `origin`。
9. `TargetBinding.leafIds` 必须是 source selected leaf set 的子集。
10. `ProjectionRecord.contentHash` 必须等于部署时使用的 leaf 或 collection snapshot hash。
11. migration generation 必须在所有权威文件和 materialized collection 内容中一致。
12. import preparation `ready -> committing` 必须是 CAS，并带 attempt/lease 信息。
13. `materializedSourceId` 是 collection leaf id、binding、projection 的 source 前缀。
14. bridge legacy retry 只允许用于“不支持 V2 payload”，不允许用于 selector 语义错误。
15. project draft 和 restore selection 在迁移后必须校验为 leaf inventory 子集。

### E. V2 重构计划覆盖矩阵

| 问题类型 | 具体问题 | V2 计划状态 | 已有修复位置 | 仍需串行固化 |
| --- | --- | --- | --- | --- |
| 术语不统一 | `selectedSkillIds` 同时表示 UI id、provider id、archive path、repo path、leaf id | 已覆盖 | `03-import-selector-contract.md` 引入 `selectedSkills[].selector`；`04-desktop-bridge.md` 只在兼容边界发送 legacy ids | Stage 4/5 实现时确认 local import/local scan 也使用 selector |
| 术语不统一 | `canonicalRepo`、`canonicalLocator`、`cacheKey` 混用 | 已覆盖 | `00-data-model.md`、import redesign 计划拆分 `canonicalLocator` 与 `cacheKey` | Stage 1 确认所有 V2 cache 类型只保留 `identity.canonicalLocator` |
| 术语不统一 | `sourceKey` 与 `canonicalLocator/requestedPath` 混用 | 已修正计划 | 本文术语表定义 `sourceSelectionKey`；import redesign、`00/01/03` 已同步改名 | Stage 4 实现时禁止重新引入 `sourceKey` 字段名 |
| 术语不统一 | `provider`、`kind`、`sourceKind` 边界不清 | 已修正计划 | 本文术语表拆成 `identity.provider`、`origin.provider`、`source.kind`；`00-data-model.md` 限定 `ImportPreparationRecordV2.sourceKind` 只表示本地 materialization 类型 | Stage 4 实现时不得把 provider 写入 `sourceKind` |
| 术语不统一 | `origin` 同时表示 member origin、preview provenance、local choice id | 已修正计划 | 本文术语表拆成 member origin、preview origin、matched source choice；`00-data-model.md` 和 `03-import-selector-contract.md` 使用 `sourceChoiceId` 表示本地选择 | Stage 4 实现时 legacy `selectedChoiceId: "origin"` 只能在 compat parser 出现 |
| 术语不统一 | `snapshot` 同时表示 provider metadata、collection materialized 内容、restore snapshot | 已修正计划 | 本文术语表拆成 materialized snapshot、provider snapshot、restore selection；`00-data-model.md` 明确只在 collection member 内保留 `snapshot` 字段 | Stage 1 实现类型时禁止 provider metadata 和 restore selection 复用 `snapshot` 字段名 |
| 结构冗余 | `LeafSelectorIndexV2.repoPath` 与 `LeafRecordV2.relativePath` 重复 | 已覆盖 | `00-data-model.md` 已删除 `selectors.repoPath`，selector 匹配 `relativePath` | 无 |
| 结构冗余 | `MaterializedSkillSnapshotV2.originRepoPath` 与 `member.origin.repoPath` 重复 | 已覆盖 | `00-data-model.md`、`01-state-contract.md`、`02-migration-tool.md` 已删除 `originRepoPath` | 无 |
| 结构冗余 | `legacyId` 总是等于 `id` | 已覆盖 | `ImportPreviewSkillV2` 改为 `legacyAliases?: string[]` | Stage 4 实现时只在有额外旧值时写入 |
| 结构冗余 | `ImportPreviewResult` 同时有嵌套 preparation 和扁平 preparation 字段 | 已覆盖 | import redesign 计划规定 core 只用嵌套 `preparation`，扁平字段只由 compat serializer 追加 | Stage 5 验证旧 Swift 兼容 serializer |
| 结构冗余 | `RepoMetadataCacheEntry.canonicalLocator` 与 `identity.canonicalLocator` 重复 | 已覆盖 | `00-data-model.md` 已保留 `identity.canonicalLocator` | Stage 1 确认 cache prune/rebuild 不迁移旧重复字段 |
| 概念不清 | `DraftBindingV2` 与 manifest `binding` 混用 | 已修正计划 | `00-data-model.md` 改为 `ProjectSourceDraftV2`；本文术语表同步 | Stage 2 实现类型时避免继续沿用 `DraftBindingV2` |
| 概念不清 | `repoPath` 坐标系不明确 | 已覆盖 | 本文命名规则规定 selector `repoPath` 永远相对完整 checkout root | Stage 4 测试 GitHub subpath、archive fallback、本地单 skill |
| 概念不清 | `PreparedSkillRef.leafId` 在 prepare 阶段是否权威 | 已修正计划 | `00-data-model.md` 明确 prepared leaf id 是缓存期 provisional id；`03-import-selector-contract.md` 验证 committed leaf id 必须来自 prepared skill ref | Stage 4 实现时 checkout 变化返回 `IMPORT_PREPARATION_STALE` |
| 逻辑不闭环 | migration 跨文件非事务 | 已修正计划 | 本文 P0 风险、`00-data-model.md` 的 `migrationGeneration`、`02-migration-tool.md` 的 marker/generation 流程 | Stage 3 实现时验证 marker 残留和 generation 不一致均返回 `STATE_MIGRATION_INCOMPLETE` |
| 逻辑不闭环 | import preparation 并发和崩溃恢复 | 已修正计划 | 本文 P0 风险、`00-data-model.md` 的 attempt/lease 字段、`03-import-selector-contract.md` 的 CAS/lease 测试和 API | Stage 4 实现时验证第二个 commit 返回 `IMPORT_PREPARATION_ALREADY_COMMITTING` |
| 逻辑不闭环 | `collectionId` 与 `materializedSourceId` 关系 | 已修正计划 | 本文 V2 示例补 `materializedSourceId`；`00-data-model.md` 与 `02-migration-tool.md` 明确 V2 第一版 `materializedSourceId === collection.id` | Stage 3 实现时验证 manifest/lock/projection 全部使用 collection id 前缀 |
| 逻辑不闭环 | desktop bridge fallback 掩盖 selector 错误 | 已修正计划 | `04-desktop-bridge.md` 改为只对 `BRIDGE_UNSUPPORTED_IMPORT_DRAFT_V2` fallback | Stage 5 验证 selector invalid/not found 不 fallback |
| 逻辑不闭环 | target projection repair 只信任旧 projection | 已修正计划 | `00-data-model.md` 明确 desired projection 必须重算；`05-verification-and-release.md` 覆盖 target root 改变和 unknown target blocked | Stage 6 实现时验证 collection projection hash 来自 materialized snapshot |

结论：V2 计划已经覆盖主要术语和结构冗余问题，但 lifecycle 类闭环问题不能只停留在 `06`。它们必须按 [07-serial-documentation-workflow.md](07-serial-documentation-workflow.md) 串行回写到对应阶段文档后，才算真正进入可执行计划。

## 结论

当前结构的问题不是单个字段命名错误，而是同一阶段的数据同时承担了 UI、provider、cache、commit resolver、部署状态多种职责。V2 需要以术语表为边界重新分层：

- `identity` 解决来源是谁。
- `selector` 解决 import 时选哪个 skill。
- `leafId` 解决安装后引用哪个实体。
- `binding` 解决用户希望部署到哪里。
- `projection` 解决实际部署到了哪里。
- `origin` 解决冻结内容从哪里来。
- `snapshot` 解决实际部署什么内容。

只要这几组术语不再混用，后续 import、collection、migration、desktop bridge 的数据流才能闭环。
