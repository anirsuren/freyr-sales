"use client";

import { useState } from "react";
import { ChevronDown, FileText } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PitchPanel } from "@/components/sessions/PitchPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateTime, cn } from "@/lib/utils";
import type { PitchSession, RecommendedService } from "@/lib/types";

export function ContactSessions({ sessions }: { sessions: PitchSession[] }) {
  const [open, setOpen] = useState<string | null>(
    sessions[0]?.id || null
  );

  if (!sessions || sessions.length === 0) {
    return (
      <Card className="p-0">
        <EmptyState
          icon={FileText}
          title="No pitch sessions yet"
          description="Generated pitch sessions for this contact will appear here."
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {sessions.map((s) => {
        const services = (s.recommended_services ||
          []) as RecommendedService[];
        const isOpen = open === s.id;
        return (
          <Card key={s.id} className="p-0 overflow-hidden">
            <button
              onClick={() => setOpen(isOpen ? null : s.id)}
              className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-surface transition-colors"
            >
              <div>
                <p className="text-[15px] font-medium text-text-primary">
                  {services[0]?.service_name || "Pitch session"}
                </p>
                <p className="text-[13px] text-text-tertiary">
                  {formatDateTime(s.created_at)}
                </p>
              </div>
              <ChevronDown
                size={18}
                strokeWidth={1.5}
                className={cn(
                  "text-text-tertiary transition-transform shrink-0",
                  isOpen && "rotate-180"
                )}
              />
            </button>
            {isOpen && (
              <div className="px-5 pb-5 border-t border-border-light pt-4">
                <PitchPanel
                  pitch5min={s.pitch_5min_script}
                  pitchEmail={s.pitch_email}
                  pitchCall={s.pitch_call_script}
                />
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
