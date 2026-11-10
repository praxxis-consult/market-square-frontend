"use client";

import { useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { registerDecaneTokenSource } from "@/lib/auth-token";
import { clearPrivySessionCookie, syncPrivySessionCookie } from "@/lib/privy-session-cookie";

/**
 * Hands Privy's access token to the transport and mirrors it into the
 * `privy-token` cookie. Renders nothing; must sit inside `PrivyProvider`.
 *
 * ─── WHY THERE IS A CACHE, AND WHY IT IS NOT A `useRef` ─────────────────────
 * `lib/auth-token.ts` wants a SYNCHRONOUS `() => string | null`, because
 * `apiFetch` is a plain module that cannot await a React context. Decane's
 * `getAccessToken()` is synchronous and satisfied that directly. Privy's is
 * `Promise<string | null>`, so there is nothing synchronous to register.
 *
 * So the token is pulled on an interval and kept in a module-scope variable
 * that the registered getter reads. A ref would work equally well for the
 * component, but the getter outlives any single render and is called from
 * outside React entirely — module scope is where the value actually has to be.
 *
 * The consequence is honest and worth stating: for the first tick after
 * sign-in the transport has no token, so an immediate authenticated request
 * can go out unauthenticated and come back 401. That is why `useAuth` reports
 * `authenticated` from Privy's own state rather than from this cache — the
 * gates wait for Privy, not for the mirror — and why the interval is short.
 *
 * ─── POLLED, NOT WRITTEN ONCE ───────────────────────────────────────────────
 * Privy rotates the token while the identity stays the same, so there is no
 * dependency to react to. A null token is almost always mid-rotation rather
 * than a sign-out, so only a SETTLED signed-out session clears the cookie:
 * clearing on every null made it flicker, which is the same lesson
 * `DecaneTokenBridge` records.
 */

let cached: string | null = null;

const POLL_MS = 2_000;

export function PrivyTokenBridge() {
  const { ready, authenticated, getAccessToken } = usePrivy();

  useEffect(() => {
    registerDecaneTokenSource(() => cached);
    return () => {
      registerDecaneTokenSource(null);
      cached = null;
    };
  }, []);

  useEffect(() => {
    let live = true;

    const sync = async () => {
      // Asking before Privy has settled resolves null and would clear a cookie
      // that is about to become valid again.
      if (!ready) return;
      if (!authenticated) {
        cached = null;
        clearPrivySessionCookie();
        return;
      }
      try {
        const token = await getAccessToken();
        if (!live) return;
        if (token) {
          cached = token;
          syncPrivySessionCookie(token);
        }
        // A null here is a rotation in flight. Keep the last good token: the
        // alternative is signing the reader out of their own session for two
        // seconds, mid-request.
      } catch {
        // Network or SDK failure. Same reasoning — the token we hold is still
        // the best answer available, and it carries its own expiry.
      }
    };

    void sync();
    const timer = setInterval(() => void sync(), POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [ready, authenticated, getAccessToken]);

  return null;
}
