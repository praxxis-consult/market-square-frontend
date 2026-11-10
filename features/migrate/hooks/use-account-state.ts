"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSocialAuth } from "decane-connect-kit";
import { usePrivy } from "@privy-io/react-auth";
import { DEMO_AUTH, LEGACY_PRIVY_APP_ID, PRIVY_AUTH } from "@/lib/auth-mode";
import { useAuth } from "@/hooks/use-auth";
import {
  readCachedAccountState,
  recallSignInEmail,
  rememberSignInEmail,
  writeCachedAccountState,
  type AccountState,
  type AccountStateAnswerBody,
  type LegacyProfileSummary,
} from "@/lib/account-state";
import { fetchAccountState } from "../lib/api";

export const ACCOUNT_STATE_KEY = ["ms", "migration", "account-state"] as const;

/** The gate's one question, and which sign-in it was asked for. */
export interface AccountStateAnswer {
  /** Undefined while on its way; the gate renders nothing of the app until then. */
  state: AccountState | undefined;
  /** For `legacy`: the old Square account, so the screen can show which one. */
  legacy: LegacyProfileSummary | null;
  /** Stable per sign-in — what the browser's memory is keyed on. */
  key: string | null;
  /** Linking exists in this deployment at all. */
  enabled: boolean;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Where this Decane sign-in stands relative to the old provider.
 *
 * Asked once per sign-in. The email comes from the provider at sign-in and
 * is kept per account (Decane stores no profile, so a reload has nothing
 * else to ask with). `linked` and `new` are kept too, so a returning reader
 * pays no round trip; `legacy` is asked again every load — it is the answer
 * that linking changes.
 */
export function useAccountState(): AccountStateAnswer {
  const { ready, authenticated } = useAuth();
  const { address, email } = useSignInIdentity();
  /*
    OFF ON THE PRIVY LEG, and not merely because the hooks would throw.

    This whole flow exists to move an account OFF the old Privy app and ONTO
    Decane. Under `NEXT_PUBLIC_AUTH_PROVIDER=privy` the session already IS a
    Privy one, so there is nothing to move and `LEGACY_PRIVY_APP_ID` names the
    app the reader is signed into — asking the link service to join that
    account to itself is not a migration, it is a loop.
  */
  const enabled = !DEMO_AUTH && !PRIVY_AUTH && Boolean(LEGACY_PRIVY_APP_ID);
  const key = authenticated ? address : null;

  useEffect(() => {
    if (key) rememberSignInEmail(storage(), key, email);
  }, [key, email]);

  const cached = key ? readCachedAccountState(storage(), key) : undefined;
  const query = useQuery<AccountStateAnswerBody>({
    queryKey: [...ACCOUNT_STATE_KEY, key],
    enabled: enabled && ready && authenticated && key !== null && cached === undefined,
    queryFn: async () => {
      const answer = await fetchAccountState(email ?? recallSignInEmail(storage(), key!));
      writeCachedAccountState(storage(), key!, answer.state);
      return answer;
    },
    staleTime: Infinity,
    retry: false,
  });

  return { state: cached ?? query.data?.state, legacy: query.data?.legacy ?? null, key, enabled };
}

interface SignInIdentity {
  /** The EVM address, which is what `useAuth` treats as the signed-in identity. */
  address: string | null;
  /** Released by the provider at sign-in; gone after a reload. */
  email: string | undefined;
}

function useDecaneSignInIdentity(): SignInIdentity {
  const social = useSocialAuth();
  return { address: social.addresses?.evm ?? null, email: social.profile?.email };
}

// Demo mode mounts no Decane provider, so the kit's hook must not be called.
function useDemoSignInIdentity(): SignInIdentity {
  return { address: null, email: undefined };
}

/**
 * The Privy leg never asks the link service anything (`enabled` is false
 * above), so this only has to be a hook that does not throw with `DecaneKit`
 * unmounted. It still reports the real identity rather than nulls, so a reader
 * of this hook sees the truth if the flow is ever turned on here.
 */
function usePrivySignInIdentity(): SignInIdentity {
  const { user } = usePrivy();
  return {
    address: user?.wallet?.address ?? null,
    email: user?.email?.address,
  };
}

const useSignInIdentity: () => SignInIdentity = DEMO_AUTH
  ? useDemoSignInIdentity
  : PRIVY_AUTH
    ? usePrivySignInIdentity
    : useDecaneSignInIdentity;
