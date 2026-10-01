"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * FILES FOR THE AGENT, IN THE BROWSER (Anir, Sep 30: "it should be able to read
 * files, videos, audio... literally anything").
 *
 * A picked, dropped or pasted file goes straight up: a record and a signed
 * URL from /api/agent/files, the bytes PUT to storage with real progress (the
 * bar moves with bytes sent, never a timer), then reading starts on the server
 * and this polls until it is done. The message can be sent once every byte is
 * up; a reading still in progress is waited on by the server.
 */

export type PendingAttachment = {
  localId: string;
  name: string;
  size: number;
  type: string;
  fileId?: string;
  status: "uploading" | "reading" | "ready" | "failed";
  /** 0 to 100, bytes sent. */
  progress: number;
  kind?: string;
  error?: string;
  durationSeconds?: number;
  pages?: number;
};

export type SentAttachment = { fileId: string; name: string; kind?: string; bytes?: number };

type ChatWithFiles = { messages: { attachments?: SentAttachment[] }[] };

/** Every file sent in a chat, once each. */
export function chatFileIds(chat: ChatWithFiles): string[] {
  return [
    ...new Set(
      (chat.messages ?? [])
        .flatMap((m) => (m.attachments ?? []).map((a) => a?.fileId))
        .filter((id): id is string => Boolean(id))
    ),
  ];
}

/**
 * A DELETED CHAT TAKES ITS FILES WITH IT (Anir, Oct 1: "It should just be super
 * easy to delete"). Deleting a conversation only dropped the messages, so a
 * recording or a contract sent in it stayed in storage with nothing left that
 * could ever reach it. Each file goes through the same DELETE the x on a chip
 * uses, which only ever removes the signed-in person's own files.
 *
 * A file another remaining chat still shows is kept. keepalive lets the
 * requests finish if the page is left straight after deleting.
 */
export function discardChatFiles(gone: ChatWithFiles, kept: ChatWithFiles[]): void {
  const stillShown = new Set(kept.flatMap(chatFileIds));
  for (const fileId of chatFileIds(gone)) {
    if (stillShown.has(fileId)) continue;
    void fetch(`/api/agent/files/${encodeURIComponent(fileId)}`, { method: "DELETE", keepalive: true }).catch(() => undefined);
  }
}

type ServerFile = { fileId: string; status: PendingAttachment["status"]; kind?: string; error?: string; durationSeconds?: number; pages?: number };

/** A raw PUT to a signed URL, reporting bytes sent. */
function putWithProgress(url: string, headers: Record<string, string>, file: File, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [key, value] of Object.entries(headers)) if (value) xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = (event) => {
      // 99, not 100: the last step is storage confirming it, and a full bar with nothing back reads as stuck.
      if (event.lengthComputable) onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`The upload was refused (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error("The upload stopped. Check the connection and try again."));
    xhr.onabort = () => reject(new Error("The upload was cancelled."));
    xhr.send(file);
  });
}

export function useAgentAttachments() {
  const [files, setFiles] = useState<PendingAttachment[]>([]);
  const timers = useRef(new Map<string, number>());
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    const pending = timers.current;
    return () => {
      live.current = false;
      pending.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const update = useCallback((localId: string, patch: Partial<PendingAttachment>) => {
    if (!live.current) return;
    setFiles((prev) => prev.map((f) => (f.localId === localId ? { ...f, ...patch } : f)));
  }, []);

  const poll = useCallback((localId: string, fileId: string) => {
    const tick = async () => {
      try {
        const response = await fetch(`/api/agent/files/${encodeURIComponent(fileId)}`, { cache: "no-store" });
        const data = (await response.json().catch(() => null)) as { file?: ServerFile } | null;
        const file = data?.file;
        if (file && (file.status === "ready" || file.status === "failed")) {
          update(localId, { status: file.status, kind: file.kind, error: file.error, durationSeconds: file.durationSeconds, pages: file.pages });
          timers.current.delete(localId);
          return;
        }
      } catch {
        // A missed poll is not a failure; the next one asks again.
      }
      if (live.current) timers.current.set(localId, window.setTimeout(tick, 2500));
    };
    timers.current.set(localId, window.setTimeout(tick, 1500));
  }, [update]);

  const addFiles = useCallback((list: FileList | File[]) => {
    for (const file of Array.from(list).slice(0, 10)) {
      const localId = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      setFiles((prev) => [...prev, { localId, name: file.name || "file", size: file.size, type: file.type, status: "uploading", progress: 0 }]);
      void (async () => {
        try {
          const created = await fetch("/api/agent/files", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: file.name || "file", size: file.size, type: file.type }),
          });
          const data = (await created.json().catch(() => null)) as { file?: ServerFile; uploadUrl?: string; uploadHeaders?: Record<string, string>; error?: string } | null;
          if (!created.ok || !data?.file || !data.uploadUrl) throw new Error(data?.error || "Could not start the upload.");
          const fileId = data.file.fileId;
          update(localId, { fileId });
          await putWithProgress(data.uploadUrl, data.uploadHeaders ?? {}, file, (progress) => update(localId, { progress }));
          update(localId, { progress: 100, status: "reading" });
          const read = await fetch(`/api/agent/files/${encodeURIComponent(fileId)}/read`, { method: "POST" });
          const readData = (await read.json().catch(() => null)) as { file?: ServerFile; error?: string } | null;
          if (!read.ok) throw new Error(readData?.error || "Could not read that file.");
          if (readData?.file?.status === "ready") update(localId, { status: "ready", kind: readData.file.kind });
          else poll(localId, fileId);
        } catch (error) {
          update(localId, { status: "failed", error: error instanceof Error ? error.message : "That file could not be added." });
        }
      })();
    }
  }, [poll, update]);

  /** The x on a chip: drop it, and the upload with it. */
  const removeFile = useCallback((localId: string) => {
    const timer = timers.current.get(localId);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(localId);
    setFiles((prev) => {
      const gone = prev.find((f) => f.localId === localId);
      if (gone?.fileId) void fetch(`/api/agent/files/${encodeURIComponent(gone.fileId)}`, { method: "DELETE" }).catch(() => undefined);
      return prev.filter((f) => f.localId !== localId);
    });
  }, []);

  /** Hand the files to a message: everything whose bytes are up (a failed reading still goes, so the agent can say why). */
  const takeForSend = useCallback((): SentAttachment[] => {
    const sendable = files.filter((f) => f.fileId && f.status !== "uploading");
    sendable.forEach((f) => {
      const timer = timers.current.get(f.localId);
      if (timer) window.clearTimeout(timer);
      timers.current.delete(f.localId);
    });
    setFiles((prev) => prev.filter((f) => !sendable.some((s) => s.localId === f.localId)));
    return sendable.map((f) => ({ fileId: f.fileId!, name: f.name, ...(f.kind ? { kind: f.kind } : {}), bytes: f.size }));
  }, [files]);

  const uploading = files.some((f) => f.status === "uploading");
  const sendable = files.some((f) => f.fileId && f.status !== "uploading");
  return { files, addFiles, removeFile, takeForSend, uploading, sendable };
}
