import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { POST } from "./route";

describe("logout route", () => {
  it("returns operators to the public start page", async () => {
    const response = await POST(new NextRequest("http://localhost/api/auth/logout"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/");
  });
});
