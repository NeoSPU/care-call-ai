import { NextRequest, NextResponse } from "next/server";

import { AUTH_COOKIE_NAME, verifySessionToken } from "../../../lib/auth-session";

function redactedTokenState() {
  const token = process.env.CARECALL_BACKEND_API_TOKEN ?? "";
  return {
    present: token.length > 0,
    length: token.length,
  };
}

function sanitizedBaseUrl() {
  const value = process.env.CARECALL_API_BASE_URL ?? "";
  if (!value) {
    return { present: false, value: "" };
  }

  try {
    const url = new URL(value);
    return {
      present: true,
      value: `${url.protocol}//${url.host}`,
    };
  } catch {
    return {
      present: true,
      value: "invalid-url",
    };
  }
}

export async function GET(request: NextRequest) {
  const session = await verifySessionToken(request.cookies.get(AUTH_COOKIE_NAME)?.value);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiBase = sanitizedBaseUrl();
  const token = redactedTokenState();
  const target = process.env.CARECALL_API_BASE_URL ? `${process.env.CARECALL_API_BASE_URL.replace(/\/+$/, "")}/health` : "";
  let backendHealth: { ok: boolean; status?: number; error?: string } = { ok: false, error: "CARECALL_API_BASE_URL is not set" };

  if (target) {
    try {
      const response = await fetch(target, { cache: "no-store" });
      backendHealth = { ok: response.ok, status: response.status };
    } catch (error) {
      backendHealth = {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown fetch error",
      };
    }
  }

  return NextResponse.json({
    api_base: apiBase,
    backend_token: token,
    backend_health: backendHealth,
    node_env: process.env.NODE_ENV ?? "",
  });
}
