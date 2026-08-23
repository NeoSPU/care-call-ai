import { NextRequest, NextResponse } from "next/server";

const BACKEND_BASE_URL = process.env.CARECALL_API_BASE_URL ?? "http://127.0.0.1:8001";
const BACKEND_API_CREDENTIAL =
  process.env.CARECALL_BACKEND_API_TOKEN ?? (process.env.NODE_ENV === "production" ? "" : "carecall-local-backend-token");

type RouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

function backendUrl(request: NextRequest, path: string[]) {
  const url = new URL(`/${path.join("/")}`, BACKEND_BASE_URL);
  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });
  return url;
}

async function proxyJson(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const method = request.method.toUpperCase();
  const response = await fetch(backendUrl(request, path), {
    body: method === "GET" || method === "HEAD" ? undefined : await request.text(),
    cache: "no-store",
    headers: {
      ...(BACKEND_API_CREDENTIAL ? { Authorization: `Bearer ${BACKEND_API_CREDENTIAL}` } : {}),
      "Content-Type": request.headers.get("Content-Type") ?? "application/json",
    },
    method,
  });
  const text = await response.text();
  return new NextResponse(text, {
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "application/json",
    },
    status: response.status,
  });
}

export function GET(request: NextRequest, context: RouteContext) {
  return proxyJson(request, context);
}

export function POST(request: NextRequest, context: RouteContext) {
  return proxyJson(request, context);
}

export function PATCH(request: NextRequest, context: RouteContext) {
  return proxyJson(request, context);
}
