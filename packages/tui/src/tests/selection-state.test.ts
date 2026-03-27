import { describe, expect, test } from "vitest";
import {
  getParentSelectionState,
  toggleChild,
  toggleParent,
  type TreeSelectionState,
} from "../selection-state.js";

function createState(selectedLeafIds: string[]): TreeSelectionState {
  return {
    allLeafIds: ["a", "b", "c"],
    selectedLeafIds,
  };
}

describe("selection-state", () => {
  test("derives parent selection state from child selection counts", () => {
    expect(getParentSelectionState(createState([]))).toBe("empty");
    expect(getParentSelectionState(createState(["a"]))).toBe("partial");
    expect(getParentSelectionState(createState(["a", "b", "c"]))).toBe("full");
  });

  test("toggleParent selects all children unless already full", () => {
    expect(toggleParent(createState(["a"]))).toEqual({
      allLeafIds: ["a", "b", "c"],
      selectedLeafIds: ["a", "b", "c"],
    });

    expect(toggleParent(createState(["a", "b", "c"]))).toEqual({
      allLeafIds: ["a", "b", "c"],
      selectedLeafIds: [],
    });
  });

  test("toggleChild adds and removes leaves while preserving canonical order", () => {
    expect(toggleChild(createState(["b"]), "a")).toEqual({
      allLeafIds: ["a", "b", "c"],
      selectedLeafIds: ["a", "b"],
    });

    expect(toggleChild(createState(["a", "b"]), "a")).toEqual({
      allLeafIds: ["a", "b", "c"],
      selectedLeafIds: ["b"],
    });
  });
});
