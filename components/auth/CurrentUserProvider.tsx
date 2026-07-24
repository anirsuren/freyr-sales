"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { UserIdentity } from "@/lib/userIdentity";

const CurrentUserContext = createContext<UserIdentity | null>(null);

export function CurrentUserProvider({
  user,
  children,
}: {
  user: UserIdentity;
  children: ReactNode;
}) {
  return (
    <CurrentUserContext.Provider value={user}>
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser(): UserIdentity {
  const user = useContext(CurrentUserContext);
  if (!user) {
    throw new Error("useCurrentUser must be used within CurrentUserProvider.");
  }
  return user;
}
