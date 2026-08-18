import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { SessionPayload } from './constants';

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback-secret');
const COOKIE_NAME = 'session';

/**
 * Sign a JWT token with user payload.
 */
export async function signToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('24h')
    .setIssuedAt()
    .sign(SECRET);
}

/**
 * Verify a JWT token and return the payload.
 */
export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Get the current session from the request cookies.
 */
export async function getSession(request?: NextRequest): Promise<SessionPayload | null> {
  let token: string | undefined;

  if (request) {
    token = request.cookies.get(COOKIE_NAME)?.value;
  } else {
    const cookieStore = await cookies();
    token = cookieStore.get(COOKIE_NAME)?.value;
  }

  if (!token) return null;
  return verifyToken(token);
}

/**
 * Create Set-Cookie header value for the session.
 */
export function createSessionCookie(token: string): string {
  const maxAge = 60 * 60 * 24; // 24 hours
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

/**
 * Create Set-Cookie header value to clear the session.
 */
export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}
