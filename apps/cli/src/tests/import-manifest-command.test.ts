import { describe, expect, test } from "vitest";
import { parseImportManifestText } from "../import-manifest-command.js";

describe("parseImportManifestText", () => {
  test("parses plain text source list", () => {
    expect(parseImportManifestText("obra/superpowers\n# comment\n\ngarrytan/gstack\n", "sources.txt"))
      .toEqual({
        sources: [
          { source: "obra/superpowers" },
          { source: "garrytan/gstack" },
        ],
      });
  });

  test("parses JSON source manifest", () => {
    expect(parseImportManifestText(
      JSON.stringify({
        sources: [
          { source: "obra/superpowers", skills: "all", targets: ["codex"] },
          { source: "garrytan/gstack", skills: "none", targets: [] },
        ],
      }),
      "sources.json",
    )).toEqual({
      sources: [
        { source: "obra/superpowers", skills: "all", targets: ["codex"] },
        { source: "garrytan/gstack", skills: "none", targets: [] },
      ],
    });
  });

  test("strips UTF-8 BOM before parsing JSON manifest", () => {
    expect(parseImportManifestText("\uFEFF{\"sources\":[{\"source\":\"obra/superpowers\"}]}", "sources.txt"))
      .toEqual({
        sources: [
          { source: "obra/superpowers" },
        ],
      });
  });

  test("rejects JSON manifest without sources array", () => {
    expect(() => parseImportManifestText("{}", "sources.json")).toThrow(
      "Import manifest JSON must contain a sources array.",
    );
  });

  test("rejects JSON source entry without non-empty source", () => {
    expect(() => parseImportManifestText(
      JSON.stringify({ sources: [{ source: " " }] }),
      "sources.json",
    )).toThrow("Import manifest source at index 0 requires a non-empty source.");
  });

  test("rejects invalid skills value", () => {
    expect(() => parseImportManifestText(
      JSON.stringify({ sources: [{ source: "obra/superpowers", skills: "some" }] }),
      "sources.json",
    )).toThrow("Import manifest source obra/superpowers has invalid skills value.");
  });

  test("rejects non-string targets", () => {
    expect(() => parseImportManifestText(
      JSON.stringify({ sources: [{ source: "obra/superpowers", targets: ["codex", 1] }] }),
      "sources.json",
    )).toThrow("Import manifest source obra/superpowers targets must be strings.");
  });

  test("trims JSON target entries", () => {
    expect(parseImportManifestText(
      JSON.stringify({ sources: [{ source: "obra/superpowers", targets: [" codex "] }] }),
      "sources.json",
    )).toEqual({
      sources: [
        { source: "obra/superpowers", targets: ["codex"] },
      ],
    });
  });

  test("rejects empty JSON target entries after trim", () => {
    expect(() => parseImportManifestText(
      JSON.stringify({ sources: [{ source: "obra/superpowers", targets: [" "] }] }),
      "sources.json",
    )).toThrow("Import manifest source obra/superpowers targets must not be empty.");
  });
});
