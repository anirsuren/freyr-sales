"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export function TelegramCard() {
  const { toast } = useToast();
  const [bot, setBot] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch("/api/telegram/test")
      .then((r) => r.json())
      .then((d) => {
        setConfigured(!!d.configured);
        setBot(d.bot?.username || null);
      })
      .catch(() => {});
  }, []);

  async function test() {
    setSending(true);
    try {
      const r = await fetch("/api/telegram/test", { method: "POST" });
      const d = await r.json();
      if (d.ok) toast("Test message sent to Telegram");
      else if (d.skipped) toast("Telegram not configured", "error");
      else toast(d.error || "Couldn't send", "error");
    } catch {
      toast("Couldn't reach Telegram", "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[17px] font-semibold text-text-primary mb-1">
            Telegram Alerts
          </h2>
          <p className="text-[13px] text-text-secondary">
            {configured ? (
              <>
                Connected as{" "}
                <span className="font-medium text-text-primary">
                  @{bot || "bot"}
                </span>{" "}
                — new sessions and logged outcomes are pushed here.
              </>
            ) : (
              "Add TELEGRAM_BOT_TOKEN to .env.local to enable."
            )}
          </p>
          <p className="text-[12px] text-text-tertiary mt-2 leading-relaxed">
            First time? Message{" "}
            <span className="font-medium">@{bot || "your bot"}</span> with{" "}
            <code className="bg-surface px-1 rounded">/start</code> so it can
            reply — then send a test.
          </p>
        </div>
        <span
          className="inline-flex items-center gap-2 text-[13px] font-medium shrink-0"
          style={{ color: configured ? "#1A7A35" : "#7A4A00" }}
        >
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: configured ? "#34C759" : "#FF9F0A" }}
          />
          {configured ? "Connected" : "Not configured"}
        </span>
      </div>
      <div className="mt-4">
        <Button variant="secondary" onClick={test} loading={sending} disabled={!configured}>
          <Send size={16} strokeWidth={1.75} />
          Send test message
        </Button>
      </div>
    </Card>
  );
}
