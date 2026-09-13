"use client";

import { useEffect, useState } from "react";
import { putConversations } from "@/lib/saveConversations";

type History = { id: string; title: string; messages: unknown[]; updated: number }[];
function read(key: string): History {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value.filter(item => item && typeof item.id === "string" && Array.isArray(item.messages)) : [];
  } catch { return []; }
}

/** Recovery is explicit and additive; it never replaces the remote version. */
export function ConversationRecovery({ storageKey, failed, ready }: { storageKey: string; failed: boolean; ready: boolean }) {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setAvailable(read(`${storageKey}:recovery`).length > 0);
    setError("");
  }, [storageKey, failed, ready]);
  if (!available && !failed) return null;

  async function recover() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/agent/conversations", { cache: "no-store" });
      if (!response.ok) throw new Error("History is unavailable. Your local chats are still safe; try again shortly.");
      const data = await response.json();
      if (!Array.isArray(data.conversations)) throw new Error("Could not read account history.");
      const remote: History = data.conversations;
      const archived = read(`${storageKey}:recovery`);
      const base = read(`${storageKey}:base`);
      const candidates = archived.length ? archived : read(storageKey).filter(chat =>
        JSON.stringify(chat) !== JSON.stringify(base.find(item => item.id === chat.id))
      );
      const copies = candidates.filter(chat => chat.messages.length &&
        JSON.stringify(chat) !== JSON.stringify(remote.find(item => item.id === chat.id))
      ).map(chat => ({ ...chat, id: crypto.randomUUID(), title: `Recovered: ${chat.title || "Chat"}`, updated: Date.now() }));
      const next = [...remote, ...copies];
      await putConversations(next, remote);
      localStorage.setItem(storageKey, JSON.stringify(next));
      localStorage.setItem(`${storageKey}:base`, JSON.stringify(next));
      localStorage.removeItem(`${storageKey}:recovery`);
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Recovery failed. Your local chats are still saved.");
    } finally { setBusy(false); }
  }

  return <div className="mx-2 my-2 rounded-lg border border-border-light bg-surface p-3 text-xs text-text-secondary">
    <p>{available ? "Local chats are available to recover." : "Some changes could not sync. You can preserve them as separate chats."}</p>
    <button type="button" disabled={busy} onClick={recover} className="mt-2 font-semibold text-blue-primary disabled:opacity-50">
      {busy ? "Recovering…" : "Recover local chats"}
    </button>
    {error && <p role="alert" className="mt-2 text-error">{error}</p>}
  </div>;
}
