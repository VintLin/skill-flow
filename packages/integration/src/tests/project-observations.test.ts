import { describe, expect, test } from "vitest";
import { collectProjectObservationsFromCodexSessions } from "../project-observations.js";

describe("project observations", () => {
  test("collectProjectObservations prefers codex repository_url and falls back to cwd basename", () => {
    const observations = collectProjectObservationsFromCodexSessions([
      {
        session_meta: {
          payload: { git: { repository_url: "https://github.com/acme/skill-flow" } },
        },
      },
      { session_meta: { payload: { cwd: "/tmp/fallback-project" } } },
    ]);

    expect(observations.map((observation) => observation.projectId)).toEqual([
      "acme/skill-flow",
      "fallback-project",
    ]);
  });
});

