"use client";

import { api } from "@/lib/square-path";

/**
 * Mirrors the Privy access token into a cookie, for requests that cannot carry
 * a Bearer header.
 *
 * The same job `lib/decane-session-cookie.ts` does, under the name the BFF
 * already reads: `extractAccessToken` in `lib/server/auth.ts` falls back to
 * `decane-token` and then `privy-token`, so this needs no server change. The
 * one request that depends on it is the chain-pinned receipt reader
 * (`lib/trade/receipt.ts`), which talks to `/api/evm-rpc` through viem's
 * transport and attaches no Authorization header of its own.
 *
 * Written by us rather than left to the SDK: whether Privy sets a first-party
 * cookie depends on its own configuration, and a token the BFF cannot find is
 * indistinguishable from being signed out.
 *
 * Deliberately narrow, because a bearer in a non-HttpOnly cookie is readable by
 * any script on the origin: scoped to this app's `/api` (so under the Ark zone
 * it is `/square/api` and never reaches wsws's routes), SameSite=Lax, Secure on
 * https, and it expires with the token.
 */

const COOKIE = "privy-token";
const FALLBACK_MAX_AGE_S = 3600;

function expiresAt(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as {
      exp?: unknown;
    };
    return typeof json.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}

function write(value: string, maxAgeSeconds: number): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE}=${value}; Path=${api("/api")}; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}

export function syncPrivySessionCookie(token: string | null): void {
  if (typeof document === "undefined") return;
  if (!token) return write("", 0);
  const exp = expiresAt(token);
  const remaining = exp ? exp - Math.floor(Date.now() / 1000) : FALLBACK_MAX_AGE_S;
  if (remaining <= 0) return write("", 0);
  write(token, remaining);
}

export function clearPrivySessionCookie(): void {
  syncPrivySessionCookie(null);
}
