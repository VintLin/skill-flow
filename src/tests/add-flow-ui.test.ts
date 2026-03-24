import { describe, expect, test } from "vitest";
import { ADD_BADGE_TEXT, getAddLoadingLabel } from "../tui/add-flow.js";

describe("add flow ui", () => {
  test("uses the skill flow badge title", () => {
    expect(ADD_BADGE_TEXT).toBe(" skill flow ");
  });

  test("maps loading phases to visible progress labels", () => {
    expect(getAddLoadingLabel("loading")).toBe("Preparing source and discovering skills...");
    expect(getAddLoadingLabel("agents-loading")).toBe("Loading available agents...");
    expect(getAddLoadingLabel("applying")).toBe("Applying selected skills and agents...");
    expect(getAddLoadingLabel("rolling-back")).toBe("Rolling back imported source...");
    expect(getAddLoadingLabel("skills")).toBeUndefined();
    expect(getAddLoadingLabel("done")).toBeUndefined();
  });
});
