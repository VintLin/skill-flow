import fs from "node:fs/promises";
import path from "node:path";
import type {
  LeafRecordV2,
  SkillCollectionMemberV2,
} from "@skill-flow/domain/types";
import {
  hashDirectory,
  writeJsonFile,
} from "@skill-flow/integration/utils/fs";

export type SkillCollectionMemberRef = {
  sourceId: string;
  leafId: string;
};

export type SkillCollectionMemberOriginInput = {
  sourceId: string;
  leafId: string;
  sourceLocator: string;
  canonicalLocator: string;
  repoPath: string;
  contentHashAtCapture: string;
  sourcePath: string;
  title: string;
  description: string;
  displayName: string;
  legacyAliases: string[];
};

export type SkillCollectionMaterializeResult = {
  collectionRoot: string;
  members: SkillCollectionMemberV2[];
  leafs: LeafRecordV2[];
  leafIds: string[];
};

export type SkillCollectionMaterializeOptions = {
  stateRoot: string;
  collectionId: string;
  refs: SkillCollectionMemberRef[];
  migrationGeneration: string;
  capturedAt: string;
  resolveOrigin: (
    ref: SkillCollectionMemberRef,
    index: number,
  ) => Promise<SkillCollectionMemberOriginInput>;
  onContentHashMismatch?: (input: {
    collectionRoot: string;
    expectedHash: string;
    actualHash: string;
  }) => void;
};

export class SkillCollectionMemberOriginMissingError extends Error {
  readonly collectionId: string;
  readonly ref: SkillCollectionMemberRef;

  constructor(collectionId: string, ref: SkillCollectionMemberRef) {
    super(`Collection member origin is missing: ${collectionId}:${ref.sourceId}:${ref.leafId}`);
    this.name = "SkillCollectionMemberOriginMissingError";
    this.collectionId = collectionId;
    this.ref = ref;
  }
}

export async function materializeSkillCollectionMembers(
  options: SkillCollectionMaterializeOptions,
): Promise<SkillCollectionMaterializeResult> {
  const collectionRoot = path.join(options.stateRoot, "source", "collection", options.collectionId);

  try {
    await fs.rm(collectionRoot, { recursive: true, force: true });
    await fs.mkdir(collectionRoot, { recursive: true });

    const members: SkillCollectionMemberV2[] = [];
    const leafs: LeafRecordV2[] = [];
    const leafIds: string[] = [];

    for (const [index, ref] of options.refs.entries()) {
      const origin = await options.resolveOrigin(ref, index);
      const memberId = `member-${index + 1}`;
      const leafId = `${options.collectionId}:${memberId}`;
      const memberPath = path.join(collectionRoot, memberId);

      await fs.cp(origin.sourcePath, memberPath, { recursive: true, force: true });
      const actualHash = await hashDirectory(memberPath);
      if (actualHash !== origin.contentHashAtCapture) {
        options.onContentHashMismatch?.({
          collectionRoot,
          expectedHash: origin.contentHashAtCapture,
          actualHash,
        });
      }

      leafIds.push(leafId);
      leafs.push({
        id: leafId,
        sourceId: options.collectionId,
        relativePath: memberId,
        linkName: memberId,
        title: origin.title,
        description: origin.description,
        absolutePath: memberPath,
        skillFilePath: path.join(memberPath, "SKILL.md"),
        displayName: origin.displayName,
        contentHash: actualHash,
        selectors: {
          legacyAliases: [...origin.legacyAliases],
        },
        valid: true,
        diagnostics: [],
      });
      members.push({
        id: memberId,
        origin: {
          sourceId: origin.sourceId,
          leafId: origin.leafId,
          sourceLocator: origin.sourceLocator,
          canonicalLocator: origin.canonicalLocator,
          repoPath: origin.repoPath,
          contentHashAtCapture: origin.contentHashAtCapture,
          capturedAt: options.capturedAt,
        },
        snapshot: {
          leafId,
          materializedPath: memberId,
          skillFilePath: path.join(memberId, "SKILL.md"),
          relativePath: memberId,
          contentHash: actualHash,
        },
        updatePolicy: "frozen",
      });
    }

    await writeJsonFile(path.join(collectionRoot, ".skillflow-generation.json"), {
      schemaVersion: 2,
      migrationGeneration: options.migrationGeneration,
      collectionId: options.collectionId,
      createdAt: options.capturedAt,
      diagnostics: [],
    });

    return { collectionRoot, members, leafs, leafIds };
  } catch (error) {
    await fs.rm(collectionRoot, { recursive: true, force: true });
    throw error;
  }
}
