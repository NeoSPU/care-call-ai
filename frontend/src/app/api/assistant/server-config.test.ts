import { describe, expect, it } from "vitest";

import { loadAssistantServerConfig } from "./server-config";

describe("loadAssistantServerConfig", () => {
  it("enables the assistant in production only when the server token is present", () => {
    const config = loadAssistantServerConfig({
      NODE_ENV: "production",
      CH_RAIXON_ENABLED: "true",
      CH_RAIXON_API_URL: "https://assistant.care.alexraixon.com",
      CH_RAIXON_SERVICE_TOKEN: "carecall-secret-token",
    } as NodeJS.ProcessEnv);

    expect(config.isEnabled).toBe(true);
    expect(config.apiUrl).toBe("https://assistant.care.alexraixon.com");
    expect(config.serviceToken).toBe("carecall-secret-token");
  });

  it("stays disabled in production without a server token", () => {
    const config = loadAssistantServerConfig({
      NODE_ENV: "production",
      CH_RAIXON_ENABLED: "true",
      CH_RAIXON_API_URL: "https://assistant.care.alexraixon.com",
    } as NodeJS.ProcessEnv);

    expect(config.isEnabled).toBe(false);
  });

  it("honors the explicit disabled flag", () => {
    const config = loadAssistantServerConfig({
      NODE_ENV: "production",
      CH_RAIXON_ENABLED: "false",
      CH_RAIXON_API_URL: "https://assistant.care.alexraixon.com",
      CH_RAIXON_SERVICE_TOKEN: "carecall-secret-token",
    } as NodeJS.ProcessEnv);

    expect(config.isEnabled).toBe(false);
  });

  it("derives a private rate-limit secret without reusing the service token", () => {
    const config = loadAssistantServerConfig({
      NODE_ENV: "production",
      CH_RAIXON_API_URL: "https://assistant.care.alexraixon.com",
      CH_RAIXON_SERVICE_TOKEN: "carecall-secret-token",
    } as NodeJS.ProcessEnv);

    expect(config.rateLimitKeySecret).toBeTruthy();
    expect(config.rateLimitKeySecret).not.toBe("carecall-secret-token");
  });
});
