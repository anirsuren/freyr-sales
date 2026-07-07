"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export function RecrawlButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">(
    "idle"
  );
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  async function recrawl() {
    setStatus("running");
    setMessage("Crawling freyr-solutions.com…");
    try {
      const res = await fetch("/api/kb/crawl", { method: "POST" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Crawl failed");
      setPageCount(data.page_count);
      setStatus("done");
      setMessage(`Indexed ${data.page_count} pages (version ${data.version}).`);
      toast(`Knowledge base updated — ${data.page_count} pages`);
      router.refresh();
    } catch (e: any) {
      setStatus("error");
      setMessage(e?.message || "Crawl failed");
      toast("Crawl failed", "error");
    }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Button onClick={recrawl} loading={status === "running"}>
        {status === "running" ? "Crawling…" : "Re-crawl Freyr Website"}
      </Button>
      {message && (
        <span
          className={
            status === "error"
              ? "text-[13px] text-error"
              : "text-[13px] text-text-secondary"
          }
        >
          {message}
          {status === "running" && pageCount !== null
            ? ` (${pageCount} pages)`
            : ""}
        </span>
      )}
    </div>
  );
}
