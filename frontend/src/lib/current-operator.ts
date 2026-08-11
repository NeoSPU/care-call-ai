import { cookies } from "next/headers";

import { AUTH_COOKIE_NAME, getAuthConfig, verifySessionToken } from "./auth-session";

export async function getCurrentOperatorName() {
  const config = getAuthConfig();
  try {
    const cookieStore = await cookies();
    const session = await verifySessionToken(cookieStore.get(AUTH_COOKIE_NAME)?.value, config);
    return session?.name ?? config.username;
  } catch {
    return config.username;
  }
}
