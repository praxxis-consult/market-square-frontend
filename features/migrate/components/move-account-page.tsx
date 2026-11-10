"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateIdentitySurfaces } from "@/lib/api/invalidate";
import { useIdentityToken, usePrivy } from "@privy-io/react-auth";
import { useSocialAuth } from "decane-connect-kit";
import { Button, Spinner } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { DEMO_AUTH, LEGACY_PRIVY_APP_ID, PRIVY_AUTH } from "@/lib/auth-mode";
import {
  clearLegacySignIn,
  legacySignInIntended,
  markLegacySignIn,
} from "@/lib/legacy-signin-intent";
import { squareSettled, type LinkOutcome, type SquareRekey } from "@/lib/migration-link";
import { sq } from "@/lib/square-path";
import { profileHref } from "@/lib/profile-href";
import { msApi } from "@/lib/api/service";
import { ProfileSchema } from "@/lib/api/schemas";
import { linkLegacyAccount } from "../lib/api";

/**
 * While Square is still moving the profile, the LINK is re-sent every three
 * seconds until `rekey.square` settles. The link is idempotent by contract
 * and its answer carries the ledger's state, so it is the one call that both
 * asks where the move stands and re-announces it if the report went missing.
 * No ceiling: a reload lands the person on their profile as soon as the move
 * is done, so waiting here is only ever cheaper than that.
 */
const LINK_POLL_MS = 3_000;
import { LegacyPrivyProvider } from "./legacy-privy-provider";
import { Avatar } from "@/components/ui/avatar";
import { atHandle } from "@/lib/handle";
import type { LegacyProfileSummary } from "@/lib/account-state";

/**
 * BRING YOUR OLD ACCOUNT — /move-account.
 *
 * Before the move to Decane, Square accounts lived on Privy, and a profile —
 * handle, followers, posts, likes, tips — is keyed to that old account. A
 * Decane sign-in is a new id, so without a link the reader arrives as a
 * stranger while their followers sit on an account they cannot sign into.
 *
 * THE ORDER IS THE OLD ACCOUNT FIRST, and that is the whole design. A
 * returning reader arrives wanting to sign in as themselves; asking them to
 * create a new account before proving who they are reads as being told their
 * account is gone. So: sign in to the old one, hear once that Square has moved,
 * set up the new sign-in, and the link fires ON ITS OWN — there is no button
 * for it.
 *
 * Doing it this way also closes a window. Signing in with the new account makes
 * an empty profile under the new id, which Square absorbs when the link
 * arrives — but only while nobody has touched it. Linking immediately after
 * that sign-in means nobody can. The other order left the reader loose in the
 * app with an empty account and a handle to invent, and inventing one refuses
 * the move for good.
 *
 * Reopening this page re-sends the link, which is how one that met a transient
 * outage gets finished (the call is idempotent by contract).
 *
 * This page DOES watch for the move to finish. It used not to — Square did not
 * report the re-key, so a recorded link was the end of the story here and the
 * profile was assumed to be there afterwards. Square now answers with
 * `rekey.square`, so the three cases that used to look identical are told
 * apart: done, still going, and refused because this account already has a
 * profile. Announcing success over that last one is how somebody loses their
 * followers quietly.
 */
export function MoveAccountPage({
  legacy = null,
  onContinueAsNew,
}: {
  legacy?: LegacyProfileSummary | null;
  /**
   * From the gate: the reader may go on with this account as a new one. On
   * the /move-account route there is nothing to continue into, so it is
   * absent and the screens offer the way back instead.
   */
  onContinueAsNew?: () => void;
}) {
  // PRIVY_AUTH: the session already IS a Privy one, so there is no old account
  // to bring across — and the Decane hooks in LinkFlow below would throw with
  // DecaneKit unmounted. See use-account-state.ts.
  if (DEMO_AUTH || PRIVY_AUTH || !LEGACY_PRIVY_APP_ID) {
    return (
      <Frame title="Upgrade your account">
        <p>Upgrading an account isn&apos;t available in this build.</p>
      </Frame>
    );
  }

  // The provider wraps the WHOLE flow now, not just its second half: the old
  // account is the first thing asked for, so Privy has to be mounted before
  // anything is drawn. It still wraps this one route and nothing else.
  return (
    <LegacyPrivyProvider>
      <LinkFlow legacy={legacy} onContinueAsNew={onContinueAsNew} />
    </LegacyPrivyProvider>
  );
}

/**
 * The account being asked for, when the gate already knows which one: the
 * same handle, name and avatar its profile page shows. "Sign in to your old
 * account" is a request; "sign in to @sharpe, 12 followers" is a recognition,
 * and it is what stops somebody with two old accounts signing in to the
 * wrong one.
 */
function LegacyAccountCard({ legacy }: { legacy: LegacyProfileSummary }) {
  const handle = atHandle(legacy.username);
  const name = legacy.displayName ?? handle ?? "Your account";
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left">
      <Avatar name={name} seed={legacy.username ?? name} src={legacy.avatarUrl ?? undefined} size={44} />
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold text-white">{name}</p>
        <p className="truncate text-[13px] text-meta">
          {handle && handle !== name ? `${handle} · ` : ""}
          {legacy.followerCount} {legacy.followerCount === 1 ? "follower" : "followers"}
        </p>
      </div>
    </div>
  );
}

/**
 * A finished move changes the profile's ID, so every cached surface keyed to
 * the old one is stale — the profile, their posts, the feed, bookmarks,
 * stories, spotlight, conversations, discovery.
 *
 * Invalidating only `["ms","me"]` left all of those showing the old identity
 * until each happened to refetch. `lib/api/invalidate` exists for exactly this
 * and is what the admin console and the profile slice call after far smaller
 * identity changes; a re-key is the largest one there is.
 *
 * The linked flag goes too: it is read by the offer in onboarding, and its own
 * stale time would keep asking somebody who has just finished.
 */
/**
 * Where the finished move lands: the profile that just arrived. Read fresh,
 * because the id it now lives under is the new one and nothing cached knows
 * it yet. If even that fails, the front door — never a screen that asks the
 * person to do it again.
 */
async function goToMovedProfile(router: ReturnType<typeof useRouter>): Promise<void> {
  try {
    const me = ProfileSchema.parse(await msApi.authedGet("/me"));
    router.replace(profileHref(me));
  } catch {
    router.replace(sq("/"));
  }
}

function settleMovedProfile(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: ["ms", "me"] });
  void queryClient.invalidateQueries({ queryKey: ["ms", "migration", "linked"] });
  // And the gate's answer: a `legacy` that has just been linked.
  void queryClient.invalidateQueries({ queryKey: ["ms", "migration", "account-state"] });
  invalidateIdentitySurfaces(queryClient);
}

function LinkFlow({
  legacy,
  onContinueAsNew,
}: {
  legacy: LegacyProfileSummary | null;
  onContinueAsNew?: () => void;
}) {
  const privy = usePrivy();
  const { identityToken } = useIdentityToken();
  const decane = useAuth();
  // Which NEW account is asking — what the sign-in intent is bound to. Null
  // until the Decane sign-in exists, which on this route is after the old one.
  // Safe to call: this flow never renders in demo mode, where no kit is mounted.
  const owner = useSocialAuth().addresses?.evm ?? null;
  const queryClient = useQueryClient();
  const router = useRouter();
  const [outcome, setOutcome] = useState<LinkOutcome | null>(null);
  // Where Square says the profile move itself got to, separately from whether
  // the pairing was recorded. `waiting` is true only while it is `pending` and
  // we are still inside the ceiling.
  const [square, setSquare] = useState<SquareRekey>("unknown");
  const [waiting, setWaiting] = useState(false);
  const started = useRef(false);
  // The old account's tokens, kept for as long as the move is still being
  // asked about: each poll re-sends the link, and the link needs both sides.
  const legacyTokens = useRef<{ accessToken: string; idToken: string | null } | null>(null);
  /*
    Whether this component is still on screen — and ONLY that. The link
    effect used to answer "am I still wanted" with a flag its own cleanup
    cleared, and its dependencies include the Privy object, which changes
    identity on every Privy state change. Getting the access token is one.
    So the effect re-ran while the link was in flight, the cleanup cleared
    the flag, the 200 arrived and was thrown away, and `started` stopped it
    from ever being sent again: a linked account, and a spinner forever.
  */
  //
  // Set on mount as well as cleared on unmount. React's development-mode
  // double invoke runs mount, cleanup, mount — a ref that only the cleanup
  // wrote stayed false for the whole life of the component, and every link
  // answer was discarded: `done` in the response, a spinner on the screen.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  /*
    LEFT-OVER SESSIONS ARE DISCARDED, NOT SPENT.

    Privy keeps its session in the browser and restores it on load, so
    `authenticated` can be true for somebody who never signed in here — a
    session left by the old app, or by whoever used this machine before. Those
    keys belong to the BROWSER, not the person, and linking is permanent.

    A session is only ours if this tab asked for one. Google and X sign-in
    leave the page and come back to the same URL, where the result is
    indistinguishable from a leftover — so intent is recorded before leaving
    (see lib/legacy-signin-intent) and read on the way back. Anything else is
    signed out before it can be read.
  */
  // Once per NEW account, not once per mount: the account that asked for the
  // old session is what the intent is bound to, and a different one signing
  // in here must find that session gone rather than inherit it.
  const purgedFor = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!privy.ready || purgedFor.current === owner) return;
    purgedFor.current = owner;
    if (privy.authenticated && !legacySignInIntended(owner)) void privy.logout().catch(() => {});
  }, [privy, owner]);

  useEffect(() => {
    // BOTH sides, and the new one last. The link needs the old account's token
    // and the new account's bearer together, and asking for the old one first
    // is what lets this fire the moment the new account exists — before the
    // reader can do anything to the empty profile Square just made for them,
    // which is what would refuse the move for good.
    // Only a session this tab asked for. A leftover is being signed out by the
    // effect above and never reaches here.
    if (!privy.ready || !privy.authenticated || !decane.authenticated || started.current) return;
    if (!legacySignInIntended(owner)) return;
    started.current = true;
    void (async () => {
      const accessToken = await privy.getAccessToken().catch(() => null);
      if (!accessToken) {
        // Spent, whatever came of it: leaving the intent set would let the next
        // restored session in this tab be treated as one the reader asked for.
        clearLegacySignIn();
        if (!mounted.current) return;
        setOutcome({ kind: "reauth" });
        return;
      }
      legacyTokens.current = { accessToken, idToken: identityToken };
      const result = await linkLegacyAccount(legacyTokens.current);
      if (!mounted.current) return;
      setOutcome(result.outcome);
      setSquare(result.square);
      // The intent has been spent, whatever the answer was.
      clearLegacySignIn();
      if (result.outcome.kind === "linked" && result.square === "pending") {
        // Wait for the move rather than announcing success over it: sending
        // the reader on during `pending` lands them on a profile that does not
        // have their posts yet, which reads as data loss. The old session
        // stays for the polls, which re-send the link.
        setWaiting(true);
        return;
      }
      if (result.outcome.kind === "linked" && result.square === "done") {
        settleMovedProfile(queryClient);
        void goToMovedProfile(router);
      }
      if (result.outcome.kind !== "reauth") {
        // The old session has done its one job. Leaving it signed in would
        // keep a second identity alive in this browser for no reason.
        await privy.logout().catch(() => {});
      }
    })();
  }, [privy, decane.authenticated, identityToken, queryClient, owner, router]);

  // Re-send the link every three seconds while the move is in flight, until
  // Square reports `done` (on to the profile) or `failed` (said plainly). A
  // poll that cannot answer, or answers anything short of settled, changes
  // nothing — the next one asks again. Only a dead session ends the wait
  // early, because no number of polls revives one.
  //
  // Keyed on `waiting` ALONE. The Privy object changes identity on every
  // Privy state change, and an effect that re-ran on it cancelled the timer
  // each time — a poll that keeps being rescheduled is a poll that never
  // fires. What the ticks need from the outside they read through refs.
  const pollDeps = useRef({ privy, queryClient, router });
  useEffect(() => {
    pollDeps.current = { privy, queryClient, router };
  });
  useEffect(() => {
    if (!waiting) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const tokens = legacyTokens.current;
      if (!tokens) return;
      const result = await linkLegacyAccount(tokens);
      if (!live) return;
      if (result.outcome.kind === "reauth") {
        setOutcome(result.outcome);
        setWaiting(false);
        return;
      }
      if (result.outcome.kind === "linked" && squareSettled(result.square) && result.square !== "unknown") {
        const deps = pollDeps.current;
        setSquare(result.square);
        setWaiting(false);
        // Its one job is done either way.
        void deps.privy.logout().catch(() => {});
        if (result.square === "done") {
          settleMovedProfile(deps.queryClient);
          void goToMovedProfile(deps.router);
        }
        return;
      }
      timer = setTimeout(() => void tick(), LINK_POLL_MS);
    };
    timer = setTimeout(() => void tick(), LINK_POLL_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [waiting]);

  const signInAgain = () => {
    started.current = false;
    setOutcome(null);
    markLegacySignIn(owner);
    // The login must happen whether or not the logout does. Chained without a
    // catch, a rejected logout skipped it and left the reader on the bare
    // spinner below — no text, no button, and an unhandled rejection.
    void privy
      .logout()
      .catch(() => {})
      .finally(() => void privy.login());
  };

  if (!privy.ready || !decane.ready) {
    return (
      <Frame eyebrow="New economy unveiling." title="Upgrade your account">
        <Spinner className="mx-auto h-6 w-6 text-grey-500" />
      </Frame>
    );
  }

  // FIRST: the account they already have. A returning reader came here to sign
  // in as themselves, and asking them to make a new account before proving who
  // they are reads as being told their account is gone.
  if ((!privy.authenticated || !legacySignInIntended(owner)) && !outcome) {
    return (
      <Frame eyebrow="New economy unveiling." title="Upgrade your account">
        {legacy && <LegacyAccountCard legacy={legacy} />}
        <p>
          Square is on the new economy now. Confirm it&apos;s you — sign in the same way you used
          to — and your handle, followers and posts come across. It takes a moment, and you only
          do it once.
        </p>
        <Button
          className="w-full"
          onClick={() => {
            markLegacySignIn(owner);
            privy.login();
          }}
        >
          Upgrade your account
        </Button>
      </Frame>
    );
  }

  if (!decane.authenticated && !outcome) {
    return (
      <Frame eyebrow="Almost there." title="Set up your new sign-in">
        <p>
          Confirmed. Now set up the sign-in you&apos;ll use from here on, and everything you have
          — your handle, followers, posts and tips — comes with you.
        </p>
        <Button className="w-full" onClick={decane.login}>
          Continue
        </Button>
      </Frame>
    );
  }

  if (!outcome) {
    return (
      <Frame eyebrow="Almost there." title="Upgrading your account…">
        <Spinner className="mx-auto h-6 w-6 text-grey-500" />
      </Frame>
    );
  }

  switch (outcome.kind) {
    case "linked":
      // The pairing is recorded. What happened to the PROFILE is a separate
      // question, and the three answers need opposite words.
      if (waiting) {
        return (
          <Frame eyebrow="Almost there." title="Upgrading your account…">
            <p>Your handle, followers and posts are moving onto this account now.</p>
            <Spinner className="mx-auto h-6 w-6 text-grey-500" />
          </Frame>
        );
      }
      if (square === "failed") {
        // Square refused the move: the new id already owns a real profile, so
        // the person is split. Calling this "all set" is how somebody loses
        // their followers quietly.
        return (
          <Frame title="Your upgrade needs a hand">
            <p>
              Your accounts are linked, but your old profile could not move across because this
              account already has one. Contact support and we&apos;ll join them up — nothing is
              lost.
            </p>
            <Button className="w-full" onClick={() => router.push(sq("/auth"))}>
              Done
            </Button>
          </Frame>
        );
      }
      if (square === "pending") {
        // Only reachable when the polls stopped without an answer (a dead
        // session ends them). The move is still coming; a reload lands on it.
        return (
          <Frame eyebrow="Almost there." title="Finishing your upgrade">
            <p>
              Your accounts are linked and your profile is on its way. It will appear on its own
              — reload in a moment.
            </p>
            <Button className="w-full" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </Frame>
        );
      }
      if (square === "none") {
        // Nothing was there to move. Claiming their posts arrived invents an
        // old account they never had.
        return (
          <Frame title="You're all set">
            <p>
              Your account is upgraded. There was no old Square profile to bring across, so nothing
              has changed here; everything else on your old account is joined to this one.
            </p>
            <Button className="w-full" onClick={() => router.push(sq("/auth"))}>
              Done
            </Button>
          </Frame>
        );
      }
      if (square === "done") {
        return (
          <Frame title="You're all set">
            <p>
              Done. Your account and everything on it — your handle, followers and posts — are on
              the new Square now.
            </p>
            <Button className="w-full" onClick={() => router.push(sq("/auth"))}>
              Done
            </Button>
          </Frame>
        );
      }
      // `unknown`: the pairing is recorded, and Square did not say what became
      // of the profile — an older service, or a conflict that carries no rekey
      // map. Promising it arrived is the one thing that must not be said.
      return (
        <Frame title="Your account is upgraded">
          <p>
            Your accounts are joined. If your handle, followers and posts are not here yet, they
            will appear shortly.
          </p>
          <Button className="w-full" onClick={() => router.push(sq("/auth"))}>
            Done
          </Button>
        </Frame>
      );
    case "already-linked":
      // The old account is already joined to a DIFFERENT new sign-in. Usually
      // the same person, upgraded before under another email or method; the
      // answer is that account, not this one. Nothing here can link it.
      if (outcome.side === "legacy") {
        return (
          <Frame title="This account was already upgraded">
            {legacy && <LegacyAccountCard legacy={legacy} />}
            <p>
              It&apos;s already joined to a different new sign-in. If that was you, sign out and
              sign in with that account — your handle, followers and posts are there. If your old
              account used a different email or login, upgrade that one instead.
            </p>
            <Button className="w-full" onClick={signInAgain}>
              Upgrade a different account
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => void decane.logout()}>
              Sign out and use my other account
            </Button>
            {onContinueAsNew ? (
              <Button variant="ghost" className="w-full" onClick={onContinueAsNew}>
                Continue with this account as new
              </Button>
            ) : (
              <Button variant="ghost" className="w-full" onClick={() => router.push(sq("/auth"))}>
                Back to Square
              </Button>
            )}
          </Frame>
        );
      }
      // The NEW account already holds an old one; a second cannot be added.
      if (outcome.side === "current") {
        return (
          <Frame title="Nothing more to upgrade here">
            <p>
              The account you&apos;re signed in to has already been upgraded from a different old
              account, so this one can&apos;t be added to it. If that&apos;s wrong, contact support
              and we&apos;ll sort it out.
            </p>
            <Button className="w-full" onClick={onContinueAsNew ?? (() => router.push(sq("/auth")))}>
              {onContinueAsNew ? "Continue" : "Back to Square"}
            </Button>
          </Frame>
        );
      }
      return (
        <Frame title="That account is already linked">
          <p>
            One of these accounts is already linked to a different account, so we can&apos;t link
            them here. Contact support and we&apos;ll sort it out.
          </p>
          <Button className="w-full" onClick={onContinueAsNew ?? (() => router.push(sq("/auth")))}>
            {onContinueAsNew ? "Continue as a new account" : "Back to Square"}
          </Button>
        </Frame>
      );
    case "reauth":
      return (
        <Frame title="Confirm it's you again">
          <p>We couldn&apos;t confirm one of the two sign-ins. Sign in the way you used to once more.</p>
          <Button className="w-full" onClick={signInAgain}>
            Upgrade your account
          </Button>
        </Frame>
      );
    case "retry-later":
      return (
        <Frame title="Your upgrade isn't finished yet">
          <p>
            We couldn&apos;t reach the service that joins accounts. Nothing was changed. Come back
            in a little while to finish.
          </p>
          <Button className="w-full" onClick={() => router.push(sq("/auth"))}>
            Back to Square
          </Button>
        </Frame>
      );
    case "unavailable":
      return (
        <Frame title="Upgrading isn't available right now">
          <p>Upgrading an account isn&apos;t available right now. Nothing was changed.</p>
          <Button className="w-full" onClick={() => router.push(sq("/auth"))}>
            Back to Square
          </Button>
        </Frame>
      );
  }
}

function Frame({
  eyebrow,
  title,
  children,
}: {
  /** The announcement above the title — "New economy unveiling." — as in wsws. */
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[80dvh] items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-5 text-center text-[15px] leading-normal text-meta">
        <div className="space-y-2">
          {eyebrow && (
            <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-spotlight">
              {eyebrow}
            </p>
          )}
          <h1 className="text-[24px] font-bold leading-[28px] text-white">{title}</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
