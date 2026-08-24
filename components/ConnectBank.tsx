"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink, type PlaidLinkOnSuccess } from "react-plaid-link";

type Status = { type: "success" | "error"; message: string } | null;

// OAuth institutions (Chase included) redirect the browser away to the
// bank's own login and back to PLAID_REDIRECT_URI — a full page load, not a
// callback. Link tokens are single-use across that round trip, so it has to
// survive the reload; sessionStorage (not state) is what does that.
const STORAGE_KEY = "plaid_link_token";

// Are we the page the bank's OAuth login just redirected back to? (Plaid
// appends oauth_state_id to the URL.) Read once, lazily, at initial render —
// not in an effect — so we seed state from this external source without an
// extra render pass. SSR has no window/sessionStorage, so this only ever
// resolves truthy client-side, same render the browser paints.
function readResumedLinkToken(): string | null {
  if (typeof window === "undefined") return null;
  if (!window.location.search.includes("oauth_state_id")) return null;
  return sessionStorage.getItem(STORAGE_KEY);
}

export function ConnectBank() {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(readResumedLinkToken);
  const [receivedRedirectUri, setReceivedRedirectUri] = useState<string | undefined>(() =>
    readResumedLinkToken() ? window.location.href : undefined,
  );
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  const cleanup = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setLinkToken(null);
    setReceivedRedirectUri(undefined);
    // Drop oauth_state_id etc. from the URL so a refresh doesn't try to
    // resume a finished/abandoned session.
    if (window.location.search.includes("oauth_state_id")) {
      router.replace(window.location.pathname);
    }
  }, [router]);

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (publicToken) => {
      setBusy(true);
      setStatus(null);
      try {
        const res = await fetch("/api/plaid/exchange-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicToken }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setStatus({ type: "error", message: body?.error ?? `Failed to connect (${res.status}).` });
          return;
        }
        const body = await res.json();
        setStatus({
          type: "success",
          message: `Connected ${body.institutionName} — ${body.accountCount} account${body.accountCount === 1 ? "" : "s"}.`,
        });
        router.refresh();
      } catch {
        setStatus({ type: "error", message: "Network error — try again." });
      } finally {
        setBusy(false);
        cleanup();
      }
    },
    [router, cleanup],
  );

  const onExit = useCallback(() => {
    setBusy(false);
    cleanup();
  }, [cleanup]);

  const { open, ready } = usePlaidLink({
    token: linkToken ?? "",
    onSuccess,
    onExit,
    ...(receivedRedirectUri ? { receivedRedirectUri } : {}),
  });

  // Open Link as soon as we have a token and the widget's finished
  // initializing with it — usePlaidLink needs a render cycle after
  // setLinkToken before `ready` flips true, so this can't happen inline
  // in handleClick.
  useEffect(() => {
    if (linkToken && ready) {
      open();
    }
  }, [linkToken, ready, open]);

  async function handleClick() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/plaid/create-link-token", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setStatus({ type: "error", message: body?.error ?? `Failed to start (${res.status}).` });
        return;
      }
      const body = await res.json();
      sessionStorage.setItem(STORAGE_KEY, body.linkToken);
      setLinkToken(body.linkToken);
    } catch {
      setStatus({ type: "error", message: "Network error — try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy || (linkToken !== null && !ready)}
        className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {busy ? "Working…" : "Connect a bank"}
      </button>
      {status && (
        <p className={status.type === "success" ? "text-sm text-emerald-600 dark:text-emerald-400" : "text-sm text-red-600 dark:text-red-400"}>
          {status.message}
        </p>
      )}
    </div>
  );
}
