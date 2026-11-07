/**
 * Control Center — server-component session reader.
 *
 * Kept separate from ./auth.js so that module stays free of `next` imports and
 * unit-testable. Server components and layouts call this to know who is
 * signed in to the Control Center.
 */
import { cookies } from 'next/headers';
import { CONTROL_COOKIE, getControlSessionFromToken } from './auth.js';

/** Current Control Center operator, or null. */
export async function getControlSessionFromCookies() {
  const store = await cookies();
  const token = store.get(CONTROL_COOKIE)?.value;
  if (!token) return null;
  return getControlSessionFromToken(token);
}

/** Raw token from the cookie jar (for the post-login redirect / session screens). */
export async function readControlToken() {
  const store = await cookies();
  return store.get(CONTROL_COOKIE)?.value ?? null;
}
