import { describe, expect, it } from "vitest";

import {
  authenticateOperator,
  createSessionToken,
  getAuthConfig,
  verifySessionToken,
} from "./auth-session";

const config = {
  configured: true,
  password: "strong-test-password",
  signingKey: "test-signing-key-at-least-long-enough",
  username: "test-coordinator",
};

describe("auth session", () => {
  it("authenticates configured operator credentials", async () => {
    await expect(authenticateOperator("test-coordinator", "strong-test-password", config)).resolves.toBe(true);
    await expect(authenticateOperator("test-coordinator", "wrong-password", config)).resolves.toBe(false);
  });

  it("creates and verifies a signed operator session", async () => {
    const signedSession = await createSessionToken("test-coordinator", config);
    const session = await verifySessionToken(signedSession, config);

    expect(session?.sub).toBe("test-coordinator");
    expect(session?.name).toBe("test-coordinator");
  });

  it("rejects tampered tokens", async () => {
    const signedSession = await createSessionToken("test-coordinator", config);
    const [payload, signedHash] = signedSession.split(".");
    const tampered = `${payload.slice(0, -1)}x.${signedHash}`;

    await expect(verifySessionToken(tampered, config)).resolves.toBeNull();
  });

  it("requires explicit auth configuration in production", () => {
    expect(getAuthConfig({ NODE_ENV: "production" }).configured).toBe(false);
  });
});
