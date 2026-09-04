"use client";

import { Crown, Mail, Package, Phone } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { HoverCard } from "@/components/ui/HoverCard";
import { TeamsIcon } from "@/components/ui/TeamsIcon";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";
import { ROLE_META, RoleTag, type WorkspaceRoleKey } from "@/components/ui/RoleTag";
import { repEmail, teamsChatUrl } from "@/lib/team";

/**
 * THE ROLE IS A TAG, NOT A WORD (Anir, Aug 30: "it says admin, shouldn't it be
 * like the color tag thing?"). He is right and it is the app's oldest standing
 * rule: a role or a category always carries its colour and its icon, never
 * plain grey text.
 *
 * Callers hand this card a SENTENCE — "Group owner · Admin" — because the line
 * is built where the person is listed. So it is taken apart here: the parts
 * that name a workspace role become the same RoleTag the account menu and the
 * directory draw, "Group owner" becomes the crown it wears everywhere else, and
 * anything else (a job title, "In this group") stays the descriptive text it
 * is.
 */
const ROLE_BY_LABEL = new Map<string, WorkspaceRoleKey>(
  (Object.keys(ROLE_META) as WorkspaceRoleKey[]).map((k) => [
    ROLE_META[k].label.toLowerCase(),
    k,
  ])
);

/**
 * THE ROLE'S CHIPS, WITHOUT A ROW OF THEIR OWN.
 *
 * This used to be its own flex row with its own top margin, so the context tag
 * beside it was forced onto a second line: "In this group" and then the group
 * name under it (Anir, Aug 31: "why is it on the next line? It should be in
 * line with it"). The caller owns one wrapping row now and drops both into it,
 * so they sit together and only wrap when there is genuinely no room.
 */
function RoleLine({ role }: { role: string }) {
  const parts = role
    .split("·")
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <>
      {parts.map((part, i) => {
        const key = ROLE_BY_LABEL.get(part.toLowerCase());
        if (key) return <RoleTag key={i} role={key} size="sm" />;
        if (part.toLowerCase() === "group owner")
          return (
            <span
              key={i}
              style={{ color: "var(--ink-violet-soft)", background: "rgba(124,58,237,0.10)" }}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-[3px] text-[11px] font-semibold"
            >
              <Crown size={11} strokeWidth={2.4} aria-hidden="true" />
              Group owner
            </span>
          );
        return (
          <span
            key={i}
            className="text-[11.5px] font-medium leading-snug text-text-secondary"
          >
            {part}
          </span>
        );
      })}
    </>
  );
}

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
    // WHO OWNS THIS IS AN IDENTITY LOOKUP, NOT A PREVIEW. A full second is
    // right for a rich content popup you deliberately hover; it is wrong for
    // reading a name off a face, which you do while scanning (Anir, Aug 9:
    // "I need to see, in 0.25 seconds, who the fucking owner is").
    <HoverCard
      delayMs={0}
      side="top"
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
              {/* ROLE AND CONTEXT SHARE ONE ROW (Anir, Aug 31: "why is it on
                  the next line? It should be in line with it"). Each used to
                  bring its own margin and its own row, so "In this group" and
                  the group tag always stacked even with half the card empty
                  beside them. One wrapping flex row: they sit together, and a
                  genuinely long pair still wraps rather than overflowing.

                  The tag still truncates and carries the full string on hover,
                  because a long one — "Booked Revenue (Contract Value Signed)"
                  — otherwise wrapped into a block that dwarfed the person it
                  was describing (Anir, Aug 29). */}
              {(role || context) && (
                <span className="mt-1 flex flex-wrap items-center gap-1.5">
                  {role && <RoleLine role={role} />}
                  {context && (
                    <span
                      title={context}
                      className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-md bg-blue-light px-1.5 py-0.5 text-[11px] font-semibold text-blue-primary"
                    >
                      <Package size={11} strokeWidth={2.1} className="shrink-0" />
                      <span className="truncate">{context}</span>
                    </span>
                  )}
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
