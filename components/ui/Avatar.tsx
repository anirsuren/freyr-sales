"use client";

import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  useCurrentDataMode,
  useMyPhoto,
} from "@/components/auth/CurrentUserProvider";

// Real generated profile photos, keyed by person name (lowercased). People with
// a photo show it; everyone else falls back to initials. Every seeded contact
// and rep now has a real headshot (Anir, Jul 8: "everywhere there's a name of
// the person, you have the pfp of the entity"). Doctors are keyed both with and
// without the "Dr." prefix so a lookup matches however the name is rendered.
const PHOTOS: Record<string, string> = {
  // Contacts
  "dr. lena vogt": "/avatars/lena-vogt.png",
  "lena vogt": "/avatars/lena-vogt.png",
  "owen bradley": "/avatars/owen-bradley.png",
  "dr. priya mehta": "/avatars/priya-mehta.png",
  "priya mehta": "/avatars/priya-mehta.png",
  "marcus thorne": "/avatars/marcus-thorne.png",
  "prithvi nair": "/avatars/prithvi-nair.png",
  "dana whitfield": "/avatars/dana-whitfield.png",
  "stefan bauer": "/avatars/stefan-bauer.png",
  "megan ruiz": "/avatars/megan-ruiz.png",
  "dr. arun pillai": "/avatars/arun-pillai.png",
  "arun pillai": "/avatars/arun-pillai.png",
  "claudia hofmann": "/avatars/claudia-hofmann.png",
  "dr. hana kim": "/avatars/hana-kim.png",
  "hana kim": "/avatars/hana-kim.png",
  // Reps / internal team
  "suren dheen": "/avatars/suren-dheen.png",
  "mark miller": "/avatars/mark-miller.png",
  "priya nair": "/avatars/priya-nair.png",
  "diego alvarez": "/avatars/diego-alvarez.png",
  // The mock sales-floor names were de-identified in July, but the generated
  // portraits were (correctly) kept as static assets. Keep the name-to-image
  // bridge here so every Team, Forecast, Analytics, hover-card, and picker
  // avatar resolves through the same source of truth instead of falling back
  // to initials. The file names intentionally retain their original synthetic
  // identities; they are implementation details and are never shown in UI.
  "walter hensley": "/avatars/suren-dheen.png",
  "gordon ashby": "/avatars/diego-alvarez.png",
  "margaret whitfield": "/avatars/priya-nair.png",
  "eleanor rutherford": "/avatars/elena-rossi.png",
  "marcus bramwell": "/avatars/marcus-chen.png",
  "sylvia ashcroft": "/avatars/sofia-almeida.png",
  "audrey kingsley": "/avatars/aisha-khan.png",
  "thomas beckett": "/avatars/tomas-becker.png",
  "nancy caldwell": "/avatars/nina-kowalski.png",
  "russell pemberton": "/avatars/rajesh-patel.png",
  "grace lockwood": "/avatars/grace-liu.png",
  "yvonne thatcher": "/avatars/yuki-tanaka.png",
  "oliver hastings": "/avatars/omar-haddad.png",
  "clara middleton": "/avatars/clara-mendez.png",
  "victor prescott": "/avatars/viktor-petrov.png",
  "leonard stanton": "/avatars/leo-santos.png",
  // Full sales floor (the SALES_TEAM roster) — generated headshots.
  "viktor petrov": "/avatars/viktor-petrov.png",
  "grace liu": "/avatars/grace-liu.png",
  "daniel foster": "/avatars/daniel-foster.png",
  "aisha khan": "/avatars/aisha-khan.png",
  "elena rossi": "/avatars/elena-rossi.png",
  "marcus chen": "/avatars/marcus-chen.png",
  "sofia almeida": "/avatars/sofia-almeida.png",
  "james o'brien": "/avatars/james-obrien.png",
  "tomas becker": "/avatars/tomas-becker.png",
  "nina kowalski": "/avatars/nina-kowalski.png",
  "rajesh patel": "/avatars/rajesh-patel.png",
  "yuki tanaka": "/avatars/yuki-tanaka.png",
  "omar haddad": "/avatars/omar-haddad.png",
  "clara mendez": "/avatars/clara-mendez.png",
  "hannah schmidt": "/avatars/hannah-schmidt.png",
  "leo santos": "/avatars/leo-santos.png",
  // Offering service-delivery POCs (lib/offerings.ts `poc`). IMPORTANT: these
  // are AI-GENERATED STAND-IN PORTRAITS, not photographs of the real Freyr
  // colleagues who hold these names — they exist so the UI never falls back to
  // bare initials (Anir, Jul 26: "why does this not have a fucking profile
  // picture?"). Swap each one for the person's real photo before this is shown
  // to the colleague in question.
  ragav: "/avatars/ragav.png",
  "sathya k": "/avatars/sathya-k.png",
  "harshvardhan gummadi": "/avatars/harshvardhan-gummadi.png",
  "pranab gogoi": "/avatars/pranab-gogoi.png",
  mukundh: "/avatars/mukundh.png",
  "suresh modugu": "/avatars/suresh-modugu.png",
  "aditi kalia": "/avatars/aditi-kalia.png",
  "gurpreet kaur": "/avatars/gurpreet-kaur.png",
  "seema gurbani": "/avatars/seema-gurbani.png",
  "jaiprakash bhelonde": "/avatars/jaiprakash-bhelonde.png",
  "anushta chandrapalan": "/avatars/anushta-chandrapalan.png",
  "padmaja jagannathan": "/avatars/padmaja-jagannathan.png",
  "vikrant mahajan": "/avatars/vikrant-mahajan.png",
  // Joint POCs ("Mukundh / Suresh Modugu") resolve to the FIRST named person
  // rather than showing a lone initial pair for two people.
  "mukundh / suresh modugu": "/avatars/mukundh.png",
  "sathya k / harshvardhan gummadi": "/avatars/sathya-k.png",
};

function photoFor(name: string): string | null {
  return PHOTOS[name.trim().toLowerCase()] || null;
}

// A word can only supply an initial if it STARTS with a letter or a digit.
// Joint service-delivery POC names ("Mukundh / Suresh Modugu") used to render
// "M/" on the offering owner card, because the slash was split off as its own
// word and its first character became the second initial (Suren, Jul 26:
// "why does this not have a fucking profile picture?"). Punctuation joiners
// — "/", "&", "-", "|" — are now skipped, so "A / B" reads "AB". The range
// covers ASCII plus Latin-1/Latin-Extended accents (Émile, Ünal); a name in a
// script outside it falls back to the raw words rather than blanking out.
const NAME_WORD = /^[A-Za-z0-9\u00C0-\u024F]/;

export function Avatar({
  name,
  className,
  tooltip,
  src,
}: {
  name: string;
  className?: string;
  /** An explicit image (e.g. the signed-in user's upload) beats the name map. */
  src?: string | null;
  // When set, hovering the avatar explains who it is (e.g. "Owner: Anir Suren").
  // Pass `true` to use the name itself; pass a string for a custom label.
  tooltip?: string | boolean;
}) {
  /**
   * THE SIGNED-IN USER'S UPLOAD WINS, WHEREVER THEY APPEAR.
   *
   * Passing the photo in at each call site could never mean "everywhere": the
   * header got it and the owner chip on an offering card still drew initials
   * (Anir, Jul 29: "my name is everywhere... it should show my profile
   * picture"). Deciding it here means one rule covers every avatar in the app,
   * including the ones rendered from server pages, with nothing to remember at
   * the call site.
   *
   * Outside the provider (the login screen) the context default is empty and
   * this quietly falls through to the name map, then to initials.
   */
  const { photo: myPhoto, name: myName } = useMyPhoto();
  const dataMode = useCurrentDataMode();
  const isMe =
    !!myPhoto &&
    !!name &&
    name.trim().toLowerCase() === myName.trim().toLowerCase();
  // Static portraits are generated demo assets. Real mode shows an explicit
  // account photo (or the signed-in user's uploaded photo) and otherwise uses
  // honest initials; it never presents a synthetic face as a colleague.
  const photo =
    src ||
    (isMe ? myPhoto : null) ||
    (dataMode === "mock" ? photoFor(name) : null);
  const words = name.split(/\s+/).filter(Boolean);
  const nameWords = words.filter((w) => NAME_WORD.test(w));
  const initials =
    (nameWords.length ? nameWords : words)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";
  const badge = photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo}
      alt={name}
      className={cn(
        // Some uploaded/generated portraits contain transparent pixels around
        // the subject. Give the image its own opaque surface so a neighbouring
        // face in an overlapping fan can never show through the portrait.
        "block object-cover rounded-full shrink-0 bg-[var(--surface)]",
        className
      )}
    />
  ) : (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-blue-light text-blue-primary font-semibold shrink-0 isolate",
        className
      )}
    >
      {initials}
    </span>
  );
  if (!tooltip) return badge;
  return <Tooltip label={tooltip === true ? name : tooltip}>{badge}</Tooltip>;
}
