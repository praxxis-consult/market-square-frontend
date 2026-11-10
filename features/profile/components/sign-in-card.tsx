"use client";

import { useEffect, useState } from "react";
import { useSocialAuth, useSocialWallet } from "decane-connect-kit";
import { Spinner } from "@/components/ui/button";
import { SquareLockup } from "@/components/ui/square-mark";
import { usePrivy, useLoginWithEmail, useLoginWithOAuth } from "@privy-io/react-auth";
import { DEMO_AUTH, PRIVY_AUTH, PRIVY_GOOGLE } from "@/lib/auth-mode";
import { cn } from "@/lib/cn";

/**
 * THE SIGN-IN CARD — Desktop 40, the end of the welcome sequence.
 *
 * ─── NOBODY IS TOLD ABOUT THE AUTH VENDOR, AND THAT IS THE POINT ────────────
 * The page this replaces had a button reading "Continue with Privy". Our auth
 * vendor — Decane now — is not a thing the reader has, wants, or should have
 * to understand. It is entirely behind the two controls the design draws — the
 * Ark button, and an email — driven HEADLESSLY through `useSocialAuth()` rather
 * than the kit's own wallet modal, which would give the vendor away.
 *
 * `showStatusOverlay: false` is set in `app/providers.tsx` for the same reason
 * on the wallet side. Same shape wsws-frontend uses.
 *
 * ─── THE ONE PLACE THE FILE RUNS OUT ────────────────────────────────────────
 * Email sign-in is two steps — send a code, then enter it — and the file draws
 * only the first. So the code step is mine: the same card, the same rhythm, the
 * field swapped, and a way back to the email field for the person who mistyped
 * it. It deliberately does NOT advance the stepper: the three dots count the
 * three steps of getting set up, and entering a code is still the first of them.
 *
 * ─── THINGS I CHANGED, AND WHY ──────────────────────────────────────────────
 * · The Google button sits 14px left of the card's centre in the file (113px of
 *   space to its left, 141px to its right). Centred.
 * · The file draws Continue in its DISABLED state only — #1F1F1F under #999999
 *   text, because no email has been typed. That state is reproduced exactly;
 *   the enabled state is the purple ramp every other primary action in the
 *   product uses, since the file never shows one.
 * · `Enter Email` at #5A5A5A is the placeholder, kept as measured. It is a
 *   placeholder, not a value, so the contrast floor that applies to copy does
 *   not apply — the field also carries a real, permanent label above it, which
 *   is what a reader actually navigates by.
 */

/**
 * THE ARK LOCKUP — the button's mark, replacing Google's.
 *
 * Ark and Market Square run on ONE Decane identity, so the account somebody signs
 * in with here IS their Ark account: a balance earned in one is spendable in
 * the other, and this button is the door to both. Naming Google on it named our
 * identity vendor rather than the thing the reader gets — the same objection
 * the note above makes to ever naming the vendor on this card.
 *
 * ─── IT IS A WORDMARK, AND THAT DECIDES THE COPY ────────────────────────────
 * There is NO icon-only Ark mark. Every piece of Ark artwork in either repo is
 * the full lockup — `ark-logo.svg` at 186x37, `ark-logo-dark.png` at 3352x668,
 * `market-logo.png` at 520x84 — all of them about 5:1. So it cannot sit in the
 * 20x20 slot the Google `G` occupied, and, more to the point, it already SAYS
 * "ARK". The label is therefore "Continue with your account": the mark carries
 * the brand, the words carry the action, and the button reads "Continue with
 * your ARK account" without printing the name twice.
 *
 * The vectors are `ark-logo.svg`'s own paths, inlined rather than fetched —
 * the same treatment any brand lockup gets, and
 * for the same reason: brand artwork keeps its own fills instead
 * of being recoloured to `currentColor`. That is also why it reads brighter
 * than the #8E8E93 label, exactly as the full-colour Google mark did.
 *
 * ─── WHAT DID NOT CHANGE ────────────────────────────────────────────────────
 * The FLOW. This is still a Google sign-in (`signInWithGoogle()`) and pressing it
 * still opens Google's account chooser. That is not a mismatch being papered
 * over: Google is how you prove who you are, Ark is the account you land in.
 * If a second provider is ever added, this button becomes the one that offers
 * the choice and nothing else on this card has to move.
 */
function ArkMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 186 37" fill="none" aria-hidden className={className}>
      <path d="M138.141 21.491L130.497 26.0329L146.117 36.7785H159.078L138.141 21.491Z" fill="white" />
      <path d="M112.994 37V25.1467C129.301 13.3599 168.236 3.47106 185.665 0C155.71 8.24192 130.719 22.7834 121.967 29.024V37H112.994Z" fill="white" />
      <path d="M113.216 22.3773V4.54193H121.967V17.503L113.216 22.3773Z" fill="white" />
      <path d="M59.488 36.7785H67.9072V10.1916H89.9521C92.3382 10.1916 94.2724 12.1259 94.2724 14.512C94.2724 16.8981 92.3382 18.8323 89.9521 18.8323H72.6707L95.1587 36.7785H106.015L89.8413 24.3713H93.9955C99.41 24.3713 103.799 19.9819 103.799 14.5674V14.2904C103.799 9.02885 99.534 4.76349 94.2724 4.76349H59.488V36.7785Z" fill="white" />
      <path d="M10.4132 36.7785L27.1407 12.7395L37.1108 26.4761H19.2754L41.8742 33.012L45.0868 36.7785H54.503L30.4641 4.87427H23.1527L0 36.7785H10.4132Z" fill="white" />
    </svg>
  );
}

/** `Rectangle 33` — 546x54 at radius 8 over #333333 at 31%, text inset 26. */
const FIELD =
  "h-[54px] w-full rounded-lg bg-[#333333]/[0.31] px-[26px] text-[14px] font-medium text-white outline-none transition-colors placeholder:text-[#5A5A5A] focus:bg-[#333333]/[0.45]";

/** `Frame 2147225680` — 440x49. The file draws only the disabled state. */
function CardButton({
  children,
  disabled,
  busy,
  onClick,
  type = "button",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  busy?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  const dead = disabled || busy;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={dead}
      className={cn(
        "flex h-[49px] w-full items-center justify-center gap-2 rounded-full text-[16px] font-medium transition-opacity",
        dead
          ? "cursor-not-allowed bg-[#1F1F1F] text-[#999999]"
          : "ws-btn-welcome ws-press hover:opacity-90"
      )}
    >
      {busy && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

function DecaneForm() {
  const {
    signInWithGoogle,
    googleLoading,
    sendEmailCode,
    confirmEmailCode,
    emailLoading,
    canUsePasskey,
    signInWithPasskey,
    error: kitError,
  } = useSocialAuth();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code" | "password">("email");
  const [error, setError] = useState<string | null>(null);
  const [googleFailed, setGoogleFailed] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  /*
    THE OTHER WAY BACK IN.

    A device can be set up to open a session from a password alone — no
    provider, no emailed code. Whether THIS device is, is a question only the
    kit can answer and only asynchronously, so it is asked once on mount and
    the affordance simply is not drawn until the answer is yes.
  */
  const wallet = useSocialWallet();
  const [canUsePassword, setCanUsePassword] = useState(false);
  useEffect(() => {
    let live = true;
    void wallet
      .canUnlockWithPassword()
      .then((can) => {
        if (live) setCanUsePassword(can);
      })
      .catch(() => {
        // Cannot tell: leave it undrawn. The ordinary ways in are all present.
      });
    return () => {
      live = false;
    };
  }, [wallet]);

  const submitPassword = async () => {
    if (password.length === 0) return;
    setError(null);
    setPasswordBusy(true);
    try {
      await wallet.unlockWithPassword(password);
    } catch {
      // The kit distinguishes a wrong password from a broken one; the reader
      // can only act on the first, and retyping is the action either way.
      setError("That password didn't open this device. Try again.");
    } finally {
      setPasswordBusy(false);
    }
  };

  /*
    THE WAY BACK IN FOR SOMEBODY WHO HAS BEEN HERE.

    Signing out clears the remembered session but deliberately leaves the
    passkey-wrapped share on the device, so a returning reader can be signed
    straight back in with one biometric prompt — no redirect, no emailed code.
    `canUsePasskey` is the kit saying this device holds such a share for the
    account that signed out; it is false on a new device and for PIN-only
    wallets, so this never appears where it would fail.

    Without it, everyone who signed out was pushed back through Google or an
    email code even while holding a perfectly good passkey.
  */
  const passkey = async () => {
    setError(null);
    setPasskeyBusy(true);
    try {
      await signInWithPasskey();
    } catch (err) {
      // Dismissing the authenticator sheet is a decision, not a failure, and
      // the other ways in are still on screen underneath.
      const name = (err as { name?: string })?.name;
      if (name !== "NotAllowedError" && name !== "UserCancelledError") {
        setError("That didn't work. Try another way in.");
      }
    } finally {
      setPasskeyBusy(false);
    }
  };

  const busy = emailLoading;
  // Not a validator — just enough to stop an obviously empty submit. The
  // service decides what a real address is, and says so.
  const emailLooksReal = /.+@.+\..+/.test(email.trim());

  const google = async () => {
    setError(null);
    setGoogleFailed(false);
    // A full-page redirect: on success the page navigates away and this never
    // settles in place. A failure BEFORE leaving is recorded on the kit's own
    // `error` rather than thrown, so it is read from there once this returns.
    await signInWithGoogle();
    setGoogleFailed(true);
  };
  // Never the kit's message: it names the vendor.
  const googleError =
    googleFailed && kitError && !googleLoading ? "Couldn't reach Google just then. Try again." : null;

  const submitEmail = async () => {
    if (!emailLooksReal) return;
    setError(null);
    try {
      await sendEmailCode(email.trim());
      setStep("code");
    } catch {
      setError("We couldn't send that code. Check the address and try again.");
    }
  };

  const submitCode = async () => {
    setError(null);
    try {
      await confirmEmailCode(email.trim(), code);
    } catch {
      setCode("");
      setError("That code didn't match. Check it and try again.");
    }
  };

  if (step === "password") {
    return (
      <form
        className="contents"
        onSubmit={(e) => {
          e.preventDefault();
          void submitPassword();
        }}
      >
        <div className="mt-[61px] px-[27px]">
          <p className="text-[14px] leading-[18px] text-[#999999]">
            The password you set on this device.
          </p>
          <label htmlFor="ms-password" className="mt-6 block text-[14px] font-medium text-white">
            Password
          </label>
          <input
            id="ms-password"
            autoFocus
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className={cn(FIELD, "mt-2.5")}
          />
          {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
        </div>
        <div className="mt-auto px-[80px] pt-8">
          <CardButton type="submit" busy={passwordBusy} disabled={password.length === 0}>
            {passwordBusy ? "Opening…" : "Continue"}
          </CardButton>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setPassword("");
              setStep("email");
            }}
            className="mt-4 w-full text-center text-[14px] text-[#999999] transition-colors hover:text-white"
          >
            Use another way in
          </button>
        </div>
      </form>
    );
  }

  if (step === "code") {
    return (
      <form
        className="contents"
        onSubmit={(e) => {
          e.preventDefault();
          void submitCode();
        }}
      >
        <div className="mt-[61px] px-[27px]">
          <p className="text-[14px] leading-[18px] text-[#999999]">
            We sent a 6-digit code to{" "}
            <span className="font-medium text-white">{email.trim()}</span>.
          </p>
          <label htmlFor="ms-code" className="mt-6 block text-[14px] font-medium text-white">
            Code
          </label>
          <input
            id="ms-code"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            // The one attribute that lets a phone offer the code from the
            // notification instead of making somebody switch apps to read it.
            autoComplete="one-time-code"
            placeholder="123456"
            className={cn(FIELD, "mt-2.5 tracking-[0.5em]")}
          />
          {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
        </div>
        <div className="mt-auto px-[80px] pt-8">
          <CardButton type="submit" busy={busy} disabled={code.length !== 6}>
            {busy ? "Checking…" : "Continue"}
          </CardButton>
          <div className="mt-4 flex justify-between text-[13px]">
            <button
              type="button"
              className="text-[#999999] transition-colors hover:text-white"
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
              }}
            >
              Use a different email
            </button>
            <button
              type="button"
              disabled={busy}
              className="text-[#999999] transition-colors hover:text-white disabled:opacity-50"
              onClick={() => void sendEmailCode(email.trim()).catch(() => {})}
            >
              Resend code
            </button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <form
      className="contents"
      onSubmit={(e) => {
        e.preventDefault();
        void submitEmail();
      }}
    >
      {/* Offered first when it exists, because it is the shortest way back and
          costs one prompt. The file's own button follows it as the way in for
          everybody else. */}
      {canUsePasskey && (
        <div className="mt-[61px] flex justify-center px-6">
          <button
            type="button"
            onClick={() => void passkey()}
            disabled={passkeyBusy}
            className="ws-press flex h-[54px] w-full max-w-[346px] items-center justify-center gap-2.5 rounded-[34px] bg-white text-[16px] font-semibold tracking-[-0.01em] text-[#0F0F0F] transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {passkeyBusy ? <Spinner className="h-5 w-5" /> : null}
            {passkeyBusy ? "Waiting for your passkey…" : "Sign in with your passkey"}
          </button>
        </div>
      )}

      {/* The other way back, for a device set up to open from a password
          alone. A link rather than a second big button: it is the fallback for
          the passkey, not a third equal option. */}
      {canUsePassword && (
        <div className="mt-4 flex justify-center px-6">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setStep("password");
            }}
            className="text-[14px] font-medium text-[#999999] underline-offset-4 transition-colors hover:text-white hover:underline"
          >
            Sign in with your device password
          </button>
        </div>
      )}

      {/* `btn-google` — 346x54, radius 34, #000 at 20% under a #000 12% hairline. */}
      <div
        className={cn(
          "flex justify-center px-6",
          canUsePasskey || canUsePassword ? "mt-4" : "mt-[61px]"
        )}
      >
        <button
          type="button"
          onClick={() => void google()}
          disabled={googleLoading}
          className="ws-press flex h-[54px] w-full max-w-[346px] items-center justify-center gap-2.5 rounded-[34px] border border-black/[0.12] bg-black/20 text-[16px] font-semibold tracking-[-0.01em] text-[#8E8E93] transition-colors hover:bg-black/30 disabled:opacity-60"
        >
          {/* 14px tall, so the 5:1 lockup lands at ~70 wide and the pair still
              fits the 346 button on the narrowest phone. */}
          {googleLoading ? (
            <Spinner className="h-5 w-5" />
          ) : (
            <ArkMark className="h-[14px] w-[70px] shrink-0" />
          )}
          Continue with your account
        </button>
      </div>

      <div className="mt-[31px] px-[27px]">
        <label htmlFor="ms-email" className="block text-[14px] font-medium text-white">
          Email
        </label>
        <input
          id="ms-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="Enter Email"
          className={cn(FIELD, "mt-2.5")}
        />
        {(error ?? googleError) && (
          <p className="mt-3 text-[13px] text-danger">{error ?? googleError}</p>
        )}
      </div>

      {/* The file leaves 98px of air here and puts Continue 28px off the card's
          bottom edge in a 488-tall card. Reproduced as `mt-auto` against that
          height rather than as a literal 98: Figma reports TEXT boxes at
          cap-height, so every real line box above this is a few pixels taller
          than the file says and a hard 98 pushed the card to 520. Pinning the
          button to the bottom instead puts the slack exactly where the file
          puts it, and the card lands on 488. It also lets the taller code step
          grow past it instead of overflowing. */}
      <div className="mt-8 px-6 pb-1 sm:px-[80px] lg:mt-auto">
        <CardButton type="submit" busy={busy} disabled={!emailLooksReal}>
          {busy ? "Sending…" : "Continue"}
        </CardButton>
      </div>
    </form>
  );
}

/**
 * THE PRIVY FORM — the `NEXT_PUBLIC_AUTH_PROVIDER=privy` leg.
 *
 * The same two-step email rhythm the Decane form uses, against Privy's own
 * `sendCode` / `loginWithCode`, plus the Ark button when the app can actually
 * serve it.
 *
 * ─── THE ARK BUTTON IS CONDITIONAL, AND THAT IS THE POINT ───────────────────
 * It was absent at first because the staging app had `google_oauth` false, and
 * a button that opens a provider the app has disabled fails every time it is
 * pressed. It was switched on in the Privy dashboard on 2026-11-08, so it is
 * drawn again — but behind `NEXT_PUBLIC_PRIVY_GOOGLE`, because the two Privy
 * apps do not have to agree: whoever points this build at a Privy app without
 * Google must be able to drop the button without editing this file.
 *
 * `apple_oauth`, `twitter_oauth`, `sms_auth` and `passkey_auth` remain false on
 * that app, so there is still no X button and no passkey or device-password way
 * back in. Same rule, same reason.
 *
 * The wallet option is NOT decoration. `wallet_auth` is true and
 * `create_on_login` is off on both chains, so an email account can arrive with
 * no embedded wallet at all — and the service refuses a tip whose recipient has
 * no payable address. Signing in with an external wallet is the one door that
 * guarantees an account has one.
 */
function PrivyForm() {
  const { login } = usePrivy();
  const { sendCode, loginWithCode } = useLoginWithEmail();
  const { initOAuth } = useLoginWithOAuth();
  const [oauthBusy, setOauthBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const emailLooksReal = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  /*
    THE SAME FLOW THE DECANE CARD HAD, AND THE SAME NAMING RULE.

    Google is how you prove who you are; Ark is the account you land in. The
    mark carries the brand and the words carry the action, which is why the
    label never says "Google" even though pressing it opens Google's account
    chooser.
  */
  const oauth = async () => {
    setError(null);
    setOauthBusy(true);
    try {
      await initOAuth({ provider: "google" });
    } catch {
      setError("That didn't complete. Try again, or use your email below.");
    } finally {
      setOauthBusy(false);
    }
  };

  const submitEmail = async () => {
    setError(null);
    setBusy(true);
    try {
      await sendCode({ email: email.trim() });
      setStep("code");
    } catch {
      setError("We couldn't send a code to that address. Check it and try again.");
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    setError(null);
    setBusy(true);
    try {
      await loginWithCode({ code: code.trim() });
    } catch {
      setCode("");
      setError("That code didn't match. Check it and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (step === "code") {
    return (
      <form
        className="contents"
        onSubmit={(e) => {
          e.preventDefault();
          void submitCode();
        }}
      >
        <div className="mt-[61px] px-[27px]">
          <p className="text-[14px] leading-[18px] text-[#999999]">
            We sent a 6-digit code to <span className="text-white">{email.trim()}</span>.
          </p>
          <label htmlFor="ms-privy-code" className="mt-6 block text-[14px] font-medium text-white">
            Code
          </label>
          <input
            id="ms-privy-code"
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={cn(FIELD, "mt-2.5")}
          />
          {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
        </div>
        <div className="mt-auto px-6 pt-8 sm:px-[80px]">
          <CardButton type="submit" busy={busy} disabled={code.trim().length === 0}>
            {busy ? "Signing in…" : "Continue"}
          </CardButton>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setCode("");
              setStep("email");
            }}
            className="mt-4 w-full text-center text-[14px] text-[#999999] transition-colors hover:text-white"
          >
            Use another email
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      className="contents"
      onSubmit={(e) => {
        e.preventDefault();
        void submitEmail();
      }}
    >
      <div className="mt-[61px] px-[27px]">
        {PRIVY_GOOGLE && (
          <>
            <CardButton busy={oauthBusy} onClick={() => void oauth()}>
              <ArkMark className="h-[18px] w-auto" />
              <span>Continue with your account</span>
            </CardButton>
            <div className="my-6 flex items-center gap-4">
              <span className="h-px flex-1 bg-white/10" />
              <span className="text-[13px] text-[#5A5A5A]">or</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
          </>
        )}
        <label htmlFor="ms-privy-email" className="block text-[14px] font-medium text-white">
          Email
        </label>
        <input
          id="ms-privy-email"
          type="email"
          autoComplete="email"
          placeholder="Enter Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={cn(FIELD, "mt-2.5")}
        />
        {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
      </div>
      <div className="mt-8 px-6 pb-1 sm:px-[80px] lg:mt-auto">
        <CardButton type="submit" busy={busy} disabled={!emailLooksReal}>
          {busy ? "Sending…" : "Continue"}
        </CardButton>
        <button
          type="button"
          onClick={login}
          className="mt-4 w-full text-center text-[14px] text-[#999999] transition-colors hover:text-white"
        >
          Use a wallet instead
        </button>
      </div>
    </form>
  );
}

/** No Decane provider is mounted in demo mode, so its hooks cannot be called. */
function DemoForm() {
  return (
    <div className="mt-[61px] px-[27px]">
      <p className="text-[14px] leading-[18px] text-[#999999]">
        This build runs with a demo session — there is no sign-in to do. Set
        <code className="mx-1 text-white">NEXT_PUBLIC_DECANE_APP_ID</code>
        to enable real accounts.
      </p>
    </div>
  );
}

const Form = DEMO_AUTH ? DemoForm : PRIVY_AUTH ? PrivyForm : DecaneForm;

export function SignInCard({
  onSkip,
  notice,
}: {
  onSkip?: () => void;
  /**
   * One line above the form for a reader who was sent here for a reason —
   * "your account has been upgraded, sign in with the new one". Absent for
   * a first visit, which needs no explaining.
   */
  notice?: string;
}) {
  return (
    /* The file centres the CARD in the viewport, not the card plus its lockup:
       the card runs 269-757 in a 1024 frame, whose midpoint is the frame's. The
       bottom padding is the lockup block's own height plus its 41px gap, which
       is what lifts the stack so the card lands centred with the lockup above
       it rather than the whole thing sitting 58px low. */
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#0F0F0F] px-4 py-10 lg:pb-[118px]">
      <SquareLockup className="[--lockup-mark:80px] lg:[--lockup-mark:103.1px]" />

      {/* `Frame 2147225685` — 600x488, radius 34, 3% white under a 10% hairline. */}
      <div className="mt-[41px] flex w-full max-w-[600px] flex-col rounded-[34px] border border-white/10 bg-white/[0.03] pt-9 pb-7 lg:min-h-[488px]">
        <div className="flex items-start justify-between gap-4 pl-6 pr-[30px]">
          <div>
            <h1 className="text-[24px] font-bold leading-[28px] text-white">
              Welcome to Square
            </h1>
            <p className="mt-3 text-[14px] font-medium leading-[18px] text-[#999999]">
              Your Square to discover Gists and meet
              <br className="hidden sm:inline" /> new people near you.
            </p>
          </div>
          {/* Step 1 of the three it takes to get set up — this card, then the
              profile details, then Friends on Square (Desktop 32). */}
          <div className="mt-1 flex h-2 shrink-0 items-center gap-[5px]">
            <span className="h-2 w-[50px] rounded-[25px] bg-spotlight" />
            <span className="h-2 w-[19px] rounded-[25px] bg-[#D9D9D9]" />
            <span className="h-2 w-[17px] rounded-[25px] bg-[#D9D9D9]" />
          </div>
        </div>

        {notice && (
          <p
            role="status"
            className="mx-6 mt-5 rounded-2xl border border-spotlight/30 bg-spotlight/10 px-4 py-3 text-[14px] leading-[20px] text-white"
          >
            {notice}
          </p>
        )}

        <Form />
      </div>

      {/* Not in the file — see the note in welcome-gate.tsx. Without it the
          sequence ends on a card offering two ways in and no way past, and
          signed-out browsing is a supported thing in this app. */}
      {onSkip && (
        <button
          type="button"
          onClick={onSkip}
          className="mt-4 text-[14px] text-[#999999] transition-colors hover:text-white"
        >
          Look around first
        </button>
      )}
    </div>
  );
}
