"use client";

import { useEffect } from "react";
import { pushRecent, type RecentItem } from "@/lib/recent";
import { useCurrentUser } from "@/components/auth/CurrentUserProvider";

// Drop into a record detail page; logs the visit to recently-viewed on mount.
export function RecordView(item: RecentItem) {
  const currentUser = useCurrentUser();
  useEffect(() => {
    pushRecent(item, currentUser.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id, item.href]);
  return null;
}
