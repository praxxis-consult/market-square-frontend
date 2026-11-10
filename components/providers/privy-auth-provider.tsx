"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { LEGACY_PRIVY_APP_ID } from "@/lib/auth-mode";
import { privyAppId } from "@/lib/privy-app-id";
import { asset } from "@/lib/square-path";
import { PrivyTokenBridge } from "@/components/providers/privy-token-bridge";

/**
 * PRIVY AS THE PRODUCT'S VENDOR — the `NEXT_PUBLIC_AUTH_PROVIDER=privy` leg.
 *
 * Mounted instead of `DecaneKit` so the app can sign into the STAGING backend,
 * which accepts Privy tokens only. See `lib/auth-mode.ts` for why the vendor is
 * an environment setting.
 *
 * This is NOT `LegacyPrivyProvider`. That one wraps /move-account to read an
 * OLD account for linking, and sets `createOnLogin: "off"` on purpose so that
 * signing in to read an account can never write to it. Here the session IS the
 * product's session, so the opposite is wanted.
 *
 * ─── LOGIN METHODS ARE THE STAGING APP'S, NOT A GUESS ───────────────────────
 * Read from the app's own config: `email_auth` true, `wallet_auth` true,
 * `google_oauth` / `apple_oauth` / `twitter_oauth` ALL false, `sms_auth` false,
 * `passkey_auth` false, `mfa_methods` empty, `captcha_enabled` false. So email
 * and an external wallet are the only two doors that exist, and offering a
 * Google button here would draw a control that cannot work — the same
 * objection the sign-in card's own notes make to naming a vendor.
 *
 * `showWalletUIs: false` for the reason it is set under Decane: our sheet is
 * the confirmation, and a vendor modal in front of each step turns one
 * deliberate act into a sequence the reader has to decode.
 *
 * ─── WHY `createOnLogin` IS REQUESTED HERE ──────────────────────────────────
 * The staging app's dashboard has `create_on_login: off` on both chains, so an
 * email login arrives with NO embedded wallet. That is not cosmetic: the
 * service refuses a tip whose RECIPIENT has no payable EVM address, so a
 * staging account made by email could not receive one and the tip test would
 * fail for a reason unrelated to the mock rail. Asking for a wallet here is
 * the client-side half of the fix. If the dashboard setting wins, the
 * remaining door is signing in with an external wallet, which arrives with a
 * real address — which is why that method is offered rather than hidden.
 */
export function PrivyAuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={privyAppId(LEGACY_PRIVY_APP_ID)}
      config={{
        loginMethods: ["email", "wallet"],
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
          showWalletUIs: false,
        },
        appearance: { theme: "#0c0c0e", accentColor: "#d4d4d8", logo: asset("/logo.svg") },
      }}
    >
      {children}
      <PrivyTokenBridge />
    </PrivyProvider>
  );
}
