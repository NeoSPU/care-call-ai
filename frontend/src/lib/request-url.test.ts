import { describe, expect, it } from "vitest";

import { absoluteRequestUrl } from "./request-url";

describe("absoluteRequestUrl", () => {
  it("uses forwarded host and protocol when present", () => {
    const request = new Request("http://0.0.0.0:3000/api/auth/login", {
      headers: {
        "x-forwarded-host": "carecall.example",
        "x-forwarded-proto": "https",
      },
    });

    expect(absoluteRequestUrl(request, "/dashboard").toString()).toBe("https://carecall.example/dashboard");
  });

  it("uses the public host header for local Docker port mapping", () => {
    const request = new Request("http://0.0.0.0:3000/api/auth/login", {
      headers: {
        host: "127.0.0.1:3001",
      },
    });

    expect(absoluteRequestUrl(request, "/dashboard").toString()).toBe("http://127.0.0.1:3001/dashboard");
  });
});
