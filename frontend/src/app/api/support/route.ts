import { NextRequest, NextResponse } from "next/server";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;
const rateLimit = new Map<string, { count: number; resetAt: number }>();

type SupportPayload = {
  name?: unknown;
  email?: unknown;
  message?: unknown;
  company?: unknown;
};

export async function POST(request: NextRequest) {
  if (!allowRequest(clientKey(request))) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let payload: SupportPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (text(payload.company).trim()) {
    return NextResponse.json({ ok: true });
  }

  const rawName = text(payload.name);
  const rawEmail = text(payload.email);
  const rawMessage = text(payload.message);

  if (looksLikeInjection(`${rawName}\n${rawEmail}\n${rawMessage}`)) {
    return NextResponse.json({ ok: false, error: "invalid_fields" }, { status: 400 });
  }

  const name = sanitize(rawName, 80);
  const email = sanitize(rawEmail, 120);
  const message = sanitize(rawMessage, 1500);

  if (!name || !validEmail(email) || message.length < 10) {
    return NextResponse.json({ ok: false, error: "invalid_fields" }, { status: 400 });
  }
  await deliverSupportMessage({ name, email, message });
  return NextResponse.json({ ok: true });
}

function clientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

function allowRequest(key: string) {
  const now = Date.now();
  const current = rateLimit.get(key);
  if (!current || current.resetAt <= now) {
    rateLimit.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (current.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  current.count += 1;
  return true;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function sanitize(value: string, maxLength: number) {
  return value
    .slice(0, maxLength)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 120;
}

function looksLikeInjection(value: string) {
  return /(\bselect\b|\binsert\b|\bdelete\b|\bdrop\b|<script|javascript:|\$\{|\.\.\/)/i.test(value);
}

async function deliverSupportMessage(payload: { name: string; email: string; message: string }) {
  const endpoint = process.env.CARECALL_SUPPORT_EMAIL_ENDPOINT;
  if (!endpoint) {
    return;
  }
  await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.CARECALL_SUPPORT_EMAIL_TOKEN
        ? { Authorization: `Bearer ${process.env.CARECALL_SUPPORT_EMAIL_TOKEN}` }
        : {}),
    },
    body: JSON.stringify({
      subject: "Care Call AI support message",
      from_name: payload.name,
      reply_to: payload.email,
      message: payload.message,
    }),
  });
}
