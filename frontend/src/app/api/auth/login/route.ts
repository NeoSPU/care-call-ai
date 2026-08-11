import { NextRequest, NextResponse } from "next/server";

import {
  AUTH_COOKIE_NAME,
  AUTH_MAX_AGE_SECONDS,
  authenticateOperator,
  createSessionToken,
  getAuthConfig,
} from "../../../../lib/auth-session";
import { absoluteRequestUrl } from "../../../../lib/request-url";

function redirectToLogin(request: NextRequest, reason: string) {
  const url = absoluteRequestUrl(request, "/login");
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url, { status: 303 });
}

function safeNextPath(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/dashboard") ? next : "/dashboard";
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const config = getAuthConfig();

  if (!config.configured) {
    return redirectToLogin(request, "configuration");
  }

  if (!(await authenticateOperator(username, password, config))) {
    return redirectToLogin(request, "invalid");
  }

  const response = NextResponse.redirect(absoluteRequestUrl(request, safeNextPath(formData.get("next"))), { status: 303 });
  response.cookies.set({
    httpOnly: true,
    maxAge: AUTH_MAX_AGE_SECONDS,
    name: AUTH_COOKIE_NAME,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    value: await createSessionToken(config.username, config),
  });
  return response;
}
