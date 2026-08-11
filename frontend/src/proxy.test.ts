import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { AUTH_COOKIE_NAME, createSessionToken } from "./lib/auth-session";
import { proxy } from "./proxy";

describe("CareCall proxy auth gate", () => {
  it("redirects dashboard requests without a session to login", async () => {
    const response = await proxy(new NextRequest("http://localhost/dashboard/preflight"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login?next=%2Fdashboard%2Fpreflight");
  });

  it("allows dashboard requests with a valid session cookie", async () => {
    const token = await createSessionToken("carecall-coordinator");
    const request = new NextRequest("http://localhost/dashboard", {
      headers: {
        cookie: `${AUTH_COOKIE_NAME}=${token}`,
      },
    });

    const response = await proxy(request);

    expect(response.status).toBe(200);
  });

  it("protects the backend proxy without a session", async () => {
    const response = await proxy(new NextRequest("http://localhost/api/carecall/api/dashboard"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login?next=%2Fapi%2Fcarecall%2Fapi%2Fdashboard");
  });
});
