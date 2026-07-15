"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  CheckCircle2,
  LoaderCircle,
  PhoneCall,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import type {
  StoredVoiceConversation,
  VoiceLifecycleStatus,
} from "@/lib/voiceEvents";
import { cn, formatDateTime } from "@/lib/utils";

const STATUS: Record<
  VoiceLifecycleStatus,
  { label: string; tone: string; icon: typeof PhoneCall }
> = {
  initiated: { label: "Calling", tone: "text-blue-primary bg-blue-light", icon: PhoneCall },
  in_progress: { label: "Live call", tone: "text-success bg-success/10", icon: PhoneCall },
  analyzing: { label: "Analyzing", tone: "text-warning bg-warning/10", icon: LoaderCircle },
  completed: { label: "Ready", tone: "text-success bg-success/10", icon: CheckCircle2 },
  failed: { label: "Failed", tone: "text-error bg-error/10", icon: AlertCircle },
};

export function VoiceLifecyclePanel() {
  const [items, setItems] = useState<StoredVoiceConversation[]>([]);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/voice/conversations?refresh=1", {
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = await response.json();
      setItems((data.conversations || []).slice(0, 6));
    } catch {}
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const active = items.some((item) =>
      ["initiated", "in_progress", "analyzing"].includes(item.status)
    );
    const timer = window.setInterval(load, active ? 4_000 : 15_000);
    return () => window.clearInterval(timer);
  }, [items, load]);

  if (items.length === 0) return null;

  return (
    <section className="border border-border-light rounded-lg overflow-hidden bg-white">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border-light">
        <div>
          <h2 className="text-[14px] font-semibold text-text-primary">Live call processing</h2>
          <p className="text-[12px] text-text-secondary">
            Calls update automatically from ringing through transcript analysis.
          </p>
        </div>
        <Bot size={18} className="text-blue-primary" strokeWidth={1.8} />
      </div>
      <div className="divide-y divide-border-light">
        {items.map((item) => {
          const meta = STATUS[item.status];
          const Icon = meta.icon;
          const href = item.conversation_id ? `/voice/c/${item.conversation_id}` : null;
          const content = (
            <div className="group flex items-center gap-3 px-4 py-3 hover:bg-surface transition-colors">
              <Avatar name={item.contact_name || item.external_number || "Caller"} className="w-9 h-9" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate text-[13.5px] font-semibold text-text-primary">
                    {item.contact_name || item.external_number || "Unknown caller"}
                  </span>
                  {item.direction === "inbound" && (
                    <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                      Inbound
                    </span>
                  )}
                </div>
                <p className="flex items-center gap-1.5 truncate text-[12px] text-text-secondary">
                  {item.company && <CompanyLogo name={item.company} className="w-4 h-4 text-[7px]" />}
                  {item.company || item.category || item.offering_name || "Voice agent call"}
                  {item.started_at ? ` · ${formatDateTime(item.started_at)}` : ""}
                </p>
              </div>
              <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold", meta.tone)}>
                <Icon
                  size={13}
                  strokeWidth={2}
                  className={item.status === "analyzing" ? "animate-spin" : undefined}
                />
                {meta.label}
              </span>
              {href && <ArrowRight size={15} className="text-text-tertiary group-hover:text-blue-primary" />}
            </div>
          );
          return href ? (
            <Link href={href} key={item.id}>{content}</Link>
          ) : (
            <div key={item.id}>{content}</div>
          );
        })}
      </div>
    </section>
  );
}
