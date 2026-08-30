import { NextResponse } from "next/server";

import { AUTH_COOKIE_NAME } from "../../../../lib/auth-session";
import { absoluteRequestUrl } from "../../../../lib/request-url";

export async function POST(request: Request) {
  const response = NextResponse.redirect(absoluteRequestUrl(request, "/"), { status: 303 });
  response.cookies.set({
    maxAge: 0,
    name: AUTH_COOKIE_NAME,
    path: "/",
    value: "",
  });
  return response;
}
