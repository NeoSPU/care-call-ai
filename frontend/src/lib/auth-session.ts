export const AUTH_COOKIE_NAME = "carecall_session";
export const AUTH_MAX_AGE_SECONDS = 60 * 60 * 8;

export type OperatorSession = {
  exp: number;
  name: string;
  sub: string;
};

export type AuthConfig = {
  configured: boolean;
  password: string;
  signingKey: string;
  username: string;
};

const encoder = new TextEncoder();

function base64UrlEncode(input: string) {
  const bytes = encoder.encode(input);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string) {
  const padded = input.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

async function signature(payload: string, signingKey: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingKey),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  let binary = "";
  new Uint8Array(signed).forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function getAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const username = env.CARECALL_OPERATOR_USERNAME ?? "carecall-coordinator";
  const password = env.CARECALL_OPERATOR_PASSWORD ?? (env.NODE_ENV === "production" ? "" : "carecall-demo-password");
  const signingKey = env.CARECALL_AUTH_SECRET ?? (env.NODE_ENV === "production" ? "" : "carecall-local-dev-secret");
  return {
    configured: Boolean(username && password && signingKey),
    password,
    signingKey,
    username,
  };
}

export async function authenticateOperator(username: string, password: string, config = getAuthConfig()) {
  if (!config.configured) {
    return false;
  }
  return timingSafeEqual(username.trim(), config.username) && timingSafeEqual(password, config.password);
}

export async function createSessionToken(operatorName: string, config = getAuthConfig()) {
  if (!config.configured) {
    throw new Error("CareCall auth is not configured.");
  }
  const payload: OperatorSession = {
    exp: Math.floor(Date.now() / 1000) + AUTH_MAX_AGE_SECONDS,
    name: operatorName,
    sub: operatorName,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${await signature(encodedPayload, config.signingKey)}`;
}

export async function verifySessionToken(token: string | undefined, config = getAuthConfig()) {
  if (!token || !config.configured) {
    return null;
  }
  const [encodedPayload, providedSignature] = token.split(".");
  if (!encodedPayload || !providedSignature) {
    return null;
  }
  const expectedSignature = await signature(encodedPayload, config.signingKey);
  if (!timingSafeEqual(providedSignature, expectedSignature)) {
    return null;
  }
  try {
    const session = JSON.parse(base64UrlDecode(encodedPayload)) as OperatorSession;
    if (!session.sub || !session.name || session.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}
