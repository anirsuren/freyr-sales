"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
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

/**
 * THE SIGNED-IN USER'S OWN PICTURE, EVERYWHERE AT ONCE.
 *
 * Uploading a photo used to change only the Settings card that uploaded it, so
 * the header still showed initials and it looked like the save had failed
 * (Anir, Jul 29: "it says my profile picture is updated, but in the top right
 * it still doesn't say it"). Holding it here means every avatar of this person
 * reads from one place, and `refreshMyPhoto()` after an upload updates all of
 * them in the same tick.
 */
const MyPhotoContext = createContext<{
  photo: string | null;
  /** Whose photo it is, so any Avatar can tell if it is drawing this person. */
  name: string;
  refresh: () => void;
}>({ photo: null, name: "", refresh: () => {} });

export function MyPhotoProvider({ children }: { children: ReactNode }) {
  const user = useContext(CurrentUserContext);
  const [photo, setPhoto] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile/photo", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setPhoto(typeof d?.photo === "string" ? d.photo : null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tick]);
  return (
    <MyPhotoContext.Provider
      value={{
        photo,
        name: user?.name ?? "",
        refresh: () => setTick((n) => n + 1),
      }}
    >
      {children}
    </MyPhotoContext.Provider>
  );
}

/** The current user's uploaded photo, or null for initials. */
export function useMyPhoto() {
  return useContext(MyPhotoContext);
}

export function useCurrentUser(): UserIdentity {
  const user = useContext(CurrentUserContext);
  if (!user) {
    throw new Error("useCurrentUser must be used within CurrentUserProvider.");
  }
  return user;
}
