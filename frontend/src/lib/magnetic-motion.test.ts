import { describe, expect, it } from "vitest";

import { calculateMagneticOffset } from "./magnetic-motion";

describe("calculateMagneticOffset", () => {
  it("calculates a bounded pull from an element center", () => {
    const offset = calculateMagneticOffset(
      { height: 40, left: 40, top: 40, width: 120 },
      { x: 250, y: 80 },
      { maxX: 22, maxY: 12, radius: 230 },
    );

    expect(offset.x.toFixed(2)).toBe("4.36");
    expect(offset.y.toFixed(2)).toBe("0.52");
  });

  it("returns no offset for empty bounds", () => {
    expect(
      calculateMagneticOffset(
        { height: 0, left: 40, top: 40, width: 120 },
        { x: 250, y: 80 },
        { maxX: 22, maxY: 12, radius: 230 },
      ),
    ).toEqual({ x: 0, y: 0 });
  });
});
