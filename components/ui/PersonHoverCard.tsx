"use client";

import { Mail, Package, Phone } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { HoverCard } from "@/components/ui/HoverCard";
import { TeamsIcon } from "@/components/ui/TeamsIcon";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";
import { repEmail, teamsChatUrl } from "@/lib/team";

/**
 * HOVER A FACE, GET THE PERSON.
 *
 * The campaigns "Going to" pattern: an avatar you hover to see who it is and
 * every way to reach them. Four ways, as icons only, because the icon already
 * says which one it is (Anir, Jul 28: "you don't need to say Teams. You already
 * have the icon. Just show me the LinkedIn logo, the Teams logo, the email, the
 * phone. That's all you need").
 *
 * The old version was 250px wide with `truncate` on both lines, so a name and
 * its context were cut off mid-word inside the popup itself. Nothing here
 * truncates (standing rule) and the card is wide enough to hold a full name and
 * role; the HoverCard portals to <body> and flips side so it can't be clipped
 * by a card's own bounds.
 */
export function PersonHoverCard({
  name,
  role,
  context,
  email,
  phone,
  linkedin,
  children,
}: {
  name: string;
  /** What they do, e.g. "Service delivery POC". */
  role: string;
  /** What they're the contact FOR, e.g. the offering name. Optional. */
  context?: string;
  /** Real address if one was entered; a demo one is derived when blank. */
  email?: string;
  phone?: string;
  /** A REAL profile URL. Omitted means no LinkedIn chip, never a guessed one. */
  linkedin?: string | null;
  children: React.ReactNode;
}) {
  /**
   * NEVER INVENT A WAY TO REACH A REAL PERSON.
   *
   * This card used to fill every gap from lib/team's generators, which exist for
   * the synthetic demo reps: a missing phone became a hashed `+1 (5xx) …` and
   * LinkedIn was ALWAYS `linkedin.com/in/<name>` because no caller passes one.
   * On a real colleague that is a fabricated phone number and a link to a
   * stranger's profile, sitting in a card that looks authoritative — the exact
   * thing Anir keeps pulling out of real mode ("we cannot have any fake
   * accounts on the real mode").
   *
   * A channel now renders only when someone actually supplied it. Email is the
   * one derivation kept: every Freyr address is first.last@freyrsolutions.com,
   * so it is the company's own convention rather than a guess. Callers with
   * synthetic people pass the generated values in explicitly.
   */
  const mail = (email || "").trim() || repEmail(name);
  const tel = (phone || "").trim();
  const profile = (linkedin || "").trim();
  const links: { href: string; label: string; icon: React.ReactNode }[] = [
    ...(profile
      ? [
          {
            href: profile,
            label: `${name} on LinkedIn`,
            icon: <LinkedInIcon size={15} />,
          },
        ]
      : []),
    {
      href: teamsChatUrl(name, mail),
      label: `Message ${name.split(" ")[0]} on Teams`,
      icon: <TeamsIcon size={15} />,
    },
    {
      href: `mailto:${mail}`,
      label: mail,
      icon: <Mail size={15} strokeWidth={1.9} />,
    },
    ...(tel
      ? [
          {
            href: `tel:${tel.replace(/[^\d+]/g, "")}`,
            label: tel,
            icon: <Phone size={15} strokeWidth={1.9} />,
          },
        ]
      : []),
  ];

  return (
    <HoverCard
      side="top"
      delayMs={0}
      width={296}
      className="inline-flex"
      content={
        <div>
          <div className="flex items-center gap-2.5">
            <Avatar name={name} className="h-10 w-10 shrink-0 text-[12px]" />
            <div className="min-w-0">
              <p className="break-words text-[13.5px] font-semibold leading-tight text-text-primary">
                {name}
              </p>
              {/* Role on its own line, directly under the name: it is the
                  first thing you want after knowing who someone is (Anir,
                  Jul 29: "the role should always show up right under the name
                  of myself"). The offering follows as a proper tag, because it
                  is an ASSET, not a sentence fragment. */}
              {role && (
                <p className="mt-0.5 break-words text-[11.5px] font-medium leading-snug text-text-secondary">
                  {role}
                </p>
              )}
              {context && (
                <span className="mt-1 inline-flex max-w-full items-center gap-1 rounded-md bg-blue-light px-1.5 py-0.5 text-[11px] font-semibold text-blue-primary">
                  <Package size={11} strokeWidth={2.1} className="shrink-0" />
                  <span className="break-words">{context}</span>
                </span>
              )}
            </div>
          </div>
          <div className="mt-2.5 flex items-center gap-1.5">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                target={l.href.startsWith("http") ? "_blank" : undefined}
                rel="noopener noreferrer"
                // The popover portals to <body>, so this never sits inside a
                // card's stretched link; stopPropagation is belt-and-braces so
                // a click here can never double as card navigation.
                onClick={(e) => e.stopPropagation()}
                title={l.label}
                aria-label={l.label}
                className="relative z-10 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border-light text-text-secondary transition-colors hover:border-blue-subtle hover:bg-blue-light/40 hover:text-blue-primary"
              >
                {l.icon}
              </a>
            ))}
          </div>
        </div>
      }
    >
      {children}
    </HoverCard>
  );
}
