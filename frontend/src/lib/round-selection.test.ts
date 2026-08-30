import { beforeEach, describe, expect, it } from "vitest";

import { readStoredRoundSelection, storeRoundSelection } from "./round-selection";

describe("round selection storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns null when the operator has no saved round selection", () => {
    expect(readStoredRoundSelection(["rec-api-001"])).toBeNull();
  });

  it("persists recipient ids in operator order", () => {
    storeRoundSelection(["rec-api-004", "rec-api-001"]);

    expect(readStoredRoundSelection(["rec-api-001", "rec-api-004"])).toEqual([
      "rec-api-004",
      "rec-api-001",
    ]);
  });

  it("drops stale, ineligible, and malformed stored recipients", () => {
    window.localStorage.setItem(
      "carecall:selected-recipient-ids",
      JSON.stringify(["rec-api-001", "rec-api-missing", 42, null, "rec-api-004"]),
    );

    expect(readStoredRoundSelection(["rec-api-001", "rec-api-004"])).toEqual([
      "rec-api-001",
      "rec-api-004",
    ]);
  });

  it("keeps an empty operator selection when saved storage cannot be parsed", () => {
    window.localStorage.setItem("carecall:selected-recipient-ids", "{broken");

    expect(readStoredRoundSelection(["rec-api-001"])).toEqual([]);
  });
});
