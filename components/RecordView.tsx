"use client";

import { useEffect } from "react";
import { pushRecent, type RecentItem } from "@/lib/recent";

// Drop into a record detail page; logs the visit to recently-viewed on mount.
export function RecordView(item: RecentItem) {
  useEffect(() => {
    pushRecent(item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.href]);
  return null;
}
