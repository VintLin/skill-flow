import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import * as ts from "typescript";
import { describe, expect, test } from "vitest";

describe("domain types", () => {
  test("resolves the published domain package and core compatibility re-export", () => {
    const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
    const fixtureDir = mkdtempSync(join(packageRoot, ".tmp-domain-contract-"));
    const fixturePath = join(fixtureDir, "contract.ts");
    const coreDomainTypesPath = fileURLToPath(
      new URL("../../../../packages/core/src/domain/types.ts", import.meta.url),
    ).replace(/\\/g, "/");

    try {
      writeFileSync(
        fixturePath,
        [
          'import type { Failure, Manifest, Result, Warning } from "@skill-flow/domain";',
          'import type {',
          "  Failure as CoreFailure,",
          "  Manifest as CoreManifest,",
          "  Result as CoreResult,",
          "  Warning as CoreWarning,",
          `} from ${JSON.stringify(coreDomainTypesPath)};`,
          "",
          "declare const domainFailure: Failure;",
          "declare const domainWarning: Warning;",
          "declare const domainManifest: Manifest;",
          "declare const domainResult: Result<Manifest>;",
          "",
          "declare const coreFailure: CoreFailure;",
          "declare const coreWarning: CoreWarning;",
          "declare const coreManifest: CoreManifest;",
          "declare const coreResult: CoreResult<CoreManifest>;",
          "",
          "const _failure: Failure = coreFailure;",
          "const _coreFailure: CoreFailure = domainFailure;",
          "const _warning: Warning = coreWarning;",
          "const _coreWarning: CoreWarning = domainWarning;",
          "const _manifest: Manifest = coreManifest;",
          "const _coreManifest: CoreManifest = domainManifest;",
          "const _result: Result<Manifest> = coreResult;",
          "const _coreResult: CoreResult<CoreManifest> = domainResult;",
          "",
        ].join("\n"),
        "utf8",
      );

      const options: ts.CompilerOptions = {
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        target: ts.ScriptTarget.ES2022,
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        esModuleInterop: true,
        resolvePackageJsonExports: true,
        resolvePackageJsonImports: true,
      };
      const host = ts.createCompilerHost(options, true);
      const program = ts.createProgram([fixturePath], options, host);
      const diagnostics = ts.getPreEmitDiagnostics(program);
      const resolvedDomain = ts.resolveModuleName(
        "@skill-flow/domain",
        fixturePath,
        options,
        host,
      ).resolvedModule?.resolvedFileName;

      expect(resolvedDomain).toBe(join(packageRoot, "dist/index.d.ts"));
      expect(
        diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")),
      ).toEqual([]);
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});
