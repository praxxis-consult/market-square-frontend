/**
 * WHICH IDENTITY VENDOR SIGNS PEOPLE IN — and why this is an environment
 * setting rather than a branch.
 *
 * Decane is the vendor in production. The STAGING backend accepts Privy tokens
 * only (`AUTH_PROVIDERS=privy`), because Decane's production subscription is
 * unpaid and staging was stood up on Privy instead. A Decane token sent there
 * is refused as `UNAUTHORIZED` — byte-identical to sending no token at all —
 * so the whole API reads as dead rather than as a provider mismatch.
 *
 * So `staging-environment` must not become a fork of the auth code that drifts
 * from main. Set `NEXT_PUBLIC_AUTH_PROVIDER=privy` and the Privy legs are
 * mounted; leave it unset and nothing about production changes.
 *
 * Both legs are real, and there is deliberately NO shared abstraction over the
 * two vendors: a session, a wallet and a signature mean different things to
 * each. The three hooks that consume them (`use-auth`, `use-wallet`,
 * `use-evm-send`) each branch at MODULE level, the same way they already branch
 * for demo mode — a conditional hook call inside a component is a hooks-order
 * violation, not a fallback.
 */
export type AuthProvider = "decane" | "privy";

export const AUTH_PROVIDER: AuthProvider =
  process.env.NEXT_PUBLIC_AUTH_PROVIDER === "privy" ? "privy" : "decane";

/**
 * The Privy app the accounts lived on before the move to Decane — and, when
 * `AUTH_PROVIDER` is `privy`, the app the whole product signs in with.
 *
 * Under Decane this powers ONE page, /move-account, where a reader signs into
 * their OLD account so it can be linked and their profile moves across.
 */
export const LEGACY_PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

/**
 * Privy cannot be the vendor without an app id: `privyAppId()` would hand the
 * provider a well-formed placeholder that authenticates nobody, so every
 * button on the sign-in card would fail against an app that does not exist.
 * Asking for the Privy leg with no id is a misconfiguration, and demo mode is
 * the safer landing for it.
 */
export const PRIVY_AUTH = AUTH_PROVIDER === "privy" && LEGACY_PRIVY_APP_ID !== "";

/**
 * Demo mode: the client assumes a signed-in demo session and the BFF (in
 * fixture mode) treats every request as the demo user.
 *
 * It is the state of having NO configured vendor at all — neither a Decane app
 * id nor a usable Privy one. Under `AUTH_PROVIDER=privy` the Decane id is
 * irrelevant, which is why it cannot be the only thing consulted any more.
 */
export const DEMO_AUTH = PRIVY_AUTH
  ? false
  : !process.env.NEXT_PUBLIC_DECANE_APP_ID;

/**
 * Whether the Privy leg draws the Ark button.
 *
 * Google is a per-APP setting, and the two Privy apps need not agree: the
 * staging app had it off until 2026-11-08, and a button that opens a provider
 * the app has disabled fails every time it is pressed. So the card asks this
 * rather than assuming, and pointing a build at an app without Google is one
 * env var rather than an edit to the sign-in card.
 *
 * Defaults ON when the Privy leg is active, because that is the shape the
 * product has everywhere else — set `NEXT_PUBLIC_PRIVY_GOOGLE=0` to drop it.
 */
export const PRIVY_GOOGLE = PRIVY_AUTH && process.env.NEXT_PUBLIC_PRIVY_GOOGLE !== "0";
