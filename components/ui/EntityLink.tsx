"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { cn } from "@/lib/utils";
import { contactHref, customerHref, teammateHref } from "@/lib/entityHref";

/**
 * A FACE OR A LOGO YOU CAN CLICK.
 *
 * Anir, Sep 28: "Throughout the entire app, I should be able to click on these
 * guys and any other assets." This is the one wrapper every person and every
 * company in a list, a band, a table cell or a card goes through, so the
 * behaviour is the same everywhere: the pointer says it is a door, the name
 * turns blue on hover, and the click goes to the record and NOT to whatever
 * row or card it happens to sit in (stopPropagation, so a name inside a
 * clickable row opens the person, not the row).
 *
 * `nested` is for a name that already sits inside an <a> or a <button>, where
 * a second anchor is invalid HTML and React warns at hydration. It renders a
 * span that navigates instead, which the browser accepts anywhere.
 *
 * No door (a placeholder like "Unassigned", or a record with no page) renders
 * the same wrapper as a plain span, so a list never shifts by a pixel between
 * a row that links and a row that cannot.
 */
export const ENTITY_LINK =
  "group/entity cursor-pointer rounded-sm outline-none transition-colors " +
  "hover:text-blue-primary focus-visible:ring-2 focus-visible:ring-blue-primary/40";

/** For the name element when it carries its own text colour class, which would
 *  otherwise beat the wrapper's hover colour. */
export const ENTITY_NAME = "transition-colors group-hover/entity:text-blue-primary";

/**
 * cn() is a plain joiner, so a caller's `flex` or `gap-1.5` would sit beside
 * the defaults rather than replace them, and Tailwind's own order would pick
 * the winner. The defaults therefore only apply when the caller set nothing
 * of that kind.
 */
function rowClasses(className: string | undefined, extra?: string): string {
  const given = className ?? "";
  const display = /\b(?:inline-)?(?:flex|block|grid)\b|\binline\b|\bcontents\b/.test(given) ? "" : "inline-flex";
  const gap = /\bgap-/.test(given) ? "" : "gap-2";
  return cn(display, "min-w-0 max-w-full items-center", gap, extra, given);
}

export function EntityLink({
  href,
  nested = false,
  newTab = false,
  className,
  title,
  children,
}: {
  href: string | null | undefined;
  /** Already inside an <a> or <button>: navigate from a span instead. */
  nested?: boolean;
  newTab?: boolean;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  if (!href) return <span className={className}>{children}</span>;
  if (nested) {
    const go = (e: MouseEvent | KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (newTab) window.open(href, "_blank", "noopener,noreferrer");
      else router.push(href);
    };
    return (
      <span
        role="link"
        tabIndex={0}
        title={title}
        onClick={go}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") go(e);
        }}
        className={cn(ENTITY_LINK, className)}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      title={title}
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noopener noreferrer" : undefined}
      onClick={(e) => e.stopPropagation()}
      className={cn(ENTITY_LINK, className)}
    >
      {children}
    </Link>
  );
}

/**
 * A PERSON WITH THEIR FACE ON, AS A DOOR. A teammate by default (owners,
 * assignees, group heads, the "by" on a note); `kind="contact"` for somebody
 * on the customer's side, who opens their contact page when the id is known.
 * Pass `children` to keep a site's own name markup (a title line, a chip),
 * and give the name element ENTITY_NAME so it still turns blue.
 */
export function PersonLink({
  name,
  kind = "teammate",
  contactId,
  href,
  src,
  initialsOnly,
  avatarClassName = "h-6 w-6 shrink-0 text-[9px]",
  className,
  nameClassName,
  nested,
  newTab,
  title,
  children,
}: {
  name: string;
  kind?: "teammate" | "contact";
  contactId?: string | null;
  /** An explicit door beats the kind. */
  href?: string | null;
  src?: string | null;
  initialsOnly?: boolean;
  avatarClassName?: string;
  className?: string;
  nameClassName?: string;
  nested?: boolean;
  newTab?: boolean;
  title?: string;
  children?: ReactNode;
}) {
  const to =
    href !== undefined
      ? href
      : kind === "contact"
        ? contactHref(contactId, name)
        : teammateHref(name);
  return (
    <EntityLink
      href={to}
      nested={nested}
      newTab={newTab}
      title={title}
      className={rowClasses(className)}
    >
      <Avatar name={name} src={src} initialsOnly={initialsOnly} className={avatarClassName} />
      {children ?? (
        <span className={cn("min-w-0 truncate", ENTITY_NAME, nameClassName)}>{name}</span>
      )}
    </EntityLink>
  );
}

/**
 * A COMPANY WITH ITS LOGO, AS A DOOR. By id when the caller has the account,
 * by name through /companies/<name> when it only has the customer's name.
 * Give `href` for a company that is not an account (a Market Intel company,
 * a competitor) or `href={null}` to draw it with no door at all.
 */
export function CompanyLink({
  name,
  customerId,
  href,
  src,
  logoClassName = "h-6 w-6 shrink-0 text-[8px]",
  className,
  nameClassName,
  nested,
  newTab,
  title,
  children,
}: {
  name: string;
  customerId?: string | null;
  href?: string | null;
  src?: string | null;
  logoClassName?: string;
  className?: string;
  nameClassName?: string;
  nested?: boolean;
  newTab?: boolean;
  title?: string;
  children?: ReactNode;
}) {
  const to = href !== undefined ? href : customerHref(customerId, name);
  return (
    <EntityLink
      href={to}
      nested={nested}
      newTab={newTab}
      title={title}
      className={rowClasses(className)}
    >
      <CompanyLogo name={name} src={src} className={logoClassName} />
      {children ?? (
        <span className={cn("min-w-0 truncate", ENTITY_NAME, nameClassName)}>{name}</span>
      )}
    </EntityLink>
  );
}
