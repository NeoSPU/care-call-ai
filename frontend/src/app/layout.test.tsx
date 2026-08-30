import { describe, expect, it } from "vitest";

import { metadata } from "./layout";

describe("RootLayout metadata", () => {
  it("keeps the CareCall app icon configured", () => {
    expect(metadata.icons).toMatchObject({
      icon: expect.arrayContaining([
        expect.objectContaining({ url: "/icon.svg", type: "image/svg+xml" }),
        expect.objectContaining({ url: "/favicon-32.png", sizes: "32x32", type: "image/png" }),
      ]),
      shortcut: "/icon.svg",
      apple: "/apple-icon.png",
    });
  });
});
