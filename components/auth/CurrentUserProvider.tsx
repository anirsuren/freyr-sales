"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { UserIdentity } from "@/lib/userIdentity";
import type { DataMode } from "@/lib/dataMode";
import { detectTimeZone, isValidTimeZone } from "@/lib/timeZone";

const CurrentUserContext = createContext<UserIdentity | null>(null);
const DataModeContext = createContext<DataMode>("live");

export function CurrentUserProvider({
  user,
  dataMode,
  children,
}: {
  user: UserIdentity;
  dataMode: DataMode;
  children: ReactNode;
}) {
  return (
    <DataModeContext.Provider value={dataMode}>
      <CurrentUserContext.Provider value={user}>
        {children}
      </CurrentUserContext.Provider>
    </DataModeContext.Provider>
  );
}

/** Mock mode may use generated demo portraits; Real mode never may. */
export function useCurrentDataMode(): DataMode {
  return useContext(DataModeContext);
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

/**
 * THE ZONE EVERY TIMESTAMP IS READ IN.
 *
 * One fetch for the whole app rather than one per row: a list of sixty
 * materials would otherwise ask sixty times. Starts on the device's own zone so
 * the first paint is already right, then adopts the saved preference if there
 * is one.
 */
const TimeZoneContext = createContext<{
  timeZone: string;
  /** "" when following the device — what Settings shows as "Automatic". */
  saved: string;
  refresh: () => void;
}>({ timeZone: "UTC", saved: "", refresh: () => {} });

export function TimeZoneProvider({ children }: { children: ReactNode }) {
  // Detected on mount, not at module load: the server has no device zone, and
  // rendering a server guess first would flash the wrong time.
  const [detected, setDetected] = useState("UTC");
  const [saved, setSaved] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    setDetected(detectTimeZone());
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile/timezone", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && typeof d?.timeZone === "string") setSaved(d.timeZone);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tick]);
  // A saved zone that this browser no longer recognises falls back to the
  // device rather than throwing on every timestamp on the page.
  const timeZone = saved && isValidTimeZone(saved) ? saved : detected;
  return (
    <TimeZoneContext.Provider
      value={{ timeZone, saved, refresh: () => setTick((n) => n + 1) }}
    >
      {children}
    </TimeZoneContext.Provider>
  );
}

/** The zone to render times in, and the raw preference behind it. */
export function useTimeZone() {
  return useContext(TimeZoneContext);
}
