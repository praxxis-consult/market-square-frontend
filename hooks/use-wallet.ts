"use client";

import { useSocialAuth } from "decane-connect-kit";
import { useWallets } from "@privy-io/react-auth";
import { DEMO_AUTH, PRIVY_AUTH } from "@/lib/auth-mode";
import { useAuth } from "@/hooks/use-auth";

export interface WalletState {
  /**
   * The reader's embedded EVM wallet, or null.
   *
   * Null has three causes and every surface treats them the same way —
   * quietly. The session has not finished hydrating, nobody is signed in, or
   * the Decane session has no EVM wallet yet. A KASH balance or a buy
   * control can do nothing useful in any of them, and inventing an address is
   * the one thing that must never happen on a money surface.
   */
  address: string | null;
  /** The session has settled. Until then a null `address` means "not yet". */
  ready: boolean;
}

function useDecaneWallet(): WalletState {
  const { addresses } = useSocialAuth();
  const { ready, authenticated } = useAuth();
  if (!ready || !authenticated) return { address: null, ready };
  return { address: addresses?.evm ?? null, ready: true };
}

/**
 * The Privy leg. `privy` is Privy's own name for the embedded wallet, as
 * opposed to an injected or WalletConnect one, and it is the only wallet the
 * BFF's ownership check will accept — `getRequestWallet` resolves the session's
 * EMBEDDED address, so an external wallet the browser named would be proven
 * against a different address and refused. Same rule as `lib/wallet.ts`.
 *
 * Null is expected here far more often than under Decane: the staging Privy app
 * has `create_on_login: off`, so an email account may genuinely have no
 * embedded wallet. Every KASH and buy surface already treats null as "nothing
 * useful to do", which is the correct behaviour rather than a gap to paper over.
 */
function usePrivyWallet(): WalletState {
  const { ready: walletsReady, wallets } = useWallets();
  const { ready, authenticated } = useAuth();
  if (!ready || !authenticated) return { address: null, ready };
  if (!walletsReady) return { address: null, ready: false };
  const embedded = wallets.find((w) => w.walletClientType === "privy");
  return { address: embedded?.address ?? null, ready: true };
}

/**
 * Demo mode mounts no Decane provider, so `useSocialAuth()` would throw rather than
 * return nothing. The branch is taken at MODULE level for the same reason
 * `useAuth` takes it there: a conditional hook call inside the component is a
 * hooks-order violation, not a fallback.
 *
 * There is deliberately no fixture wallet. Every KASH and buy surface is
 * absent in demo mode rather than showing invented money — a balance somebody
 * could try to spend is not a thing to demo.
 */
function useDemoWallet(): WalletState {
  return { address: null, ready: true };
}

/**
 * The wallet Market Square knows the reader by.
 *
 * Market Square and the trading app share ONE Decane identity, so the embedded
 * wallet a reader has there is the same wallet here — which is the whole
 * reason a balance earned on one surface can be spent on the other. A Decane
 * session has exactly one EVM wallet, so there is nothing to pick: the BFF
 * proves ownership server-side by asking Decane for the same address
 * (`getRequestWallet` in `lib/server/auth.ts`).
 */
export const useEmbeddedWallet: () => WalletState = DEMO_AUTH
  ? useDemoWallet
  : PRIVY_AUTH
    ? usePrivyWallet
    : useDecaneWallet;
