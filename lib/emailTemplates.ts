/**
 * EMAIL TEMPLATES AN ADMIN CAN SEND IN TWO CLICKS.
 *
 * Anir, Aug 26: "instead of drafts we should have templates, and create like
 * 5-6 different templates for admin to send, so they can click someone and
 * boom the draft/template is autoloaded. So they choose template, choose the
 * people to send it to, and boom, it's that easy."
 *
 * So each one arrives complete: a subject and a message already written in the
 * app's voice, with nothing left to fill in but who it goes to. Everything
 * stays editable, and nothing sends until Send is pressed twice, like any
 * other mail from here.
 *
 * The bodies are BODY FRAGMENTS, not documents. The send route wraps whatever
 * the composer holds in emailShell(), so a template that carried its own
 * <html> would be nested inside another one — which is exactly the bug the
 * owner reminder had before this existed.
 */

import type { LucideIcon } from "lucide-react";
import {
  CalendarClock,
  FolderOpen,
  Megaphone,
  Sparkles,
  TrendingUp,
  UserPlus,
} from "lucide-react";

export type EmailTemplate = {
  id: string;
  /** What it is, on the row you click. */
  name: string;
  /** One line under the name, so the list can be read without opening each. */
  hint: string;
  icon: LucideIcon;
  color: string;
  subject: string;
  /** A body fragment. See the note above about shells. */
  body: string;
  /**
   * This one is written FOR a particular offering owner, so choosing it opens
   * the list of owners and fills the recipient too. The rest leave the To
   * field to the sender.
   */
  perOwner?: boolean;
};

/* The app's own link style, so a template's links look like every other link
   the platform sends. */
const link = (href: string, label: string) =>
  `<a href="${href}" style="color:#0071e3;font-weight:600;">${label}</a>`;

/* The hrefs are placeholders the sender replaces, like the [square brackets]
   in the copy — a template cannot know which offering or which month. */
export function emailTemplates(): EmailTemplate[] {
  return [
    {
      id: "owner-refresh",
      name: "Remind an offering owner",
      hint: "Their offering's shelf, folder by folder, and what has gone stale.",
      icon: FolderOpen,
      color: "var(--ink-amber)",
      perOwner: true,
      subject: "Your offering needs a refresh",
      body: "",
    },
    {
      id: "new-offering",
      name: "Announce a new offering",
      hint: "Tell the team something new is in the catalogue and ready to sell.",
      icon: Megaphone,
      color: "var(--ink-bright-blue)",
      subject: "New in the catalogue: [offering name]",
      body: `<p>Hi all,</p>
<p><b>[Offering name]</b> is now in the catalogue and ready to take to customers.</p>
<p><b>What it is.</b> [One or two lines on what the offering does and who it is for.]</p>
<p><b>Who it suits.</b> [The customer types and markets it applies to.]</p>
<p>The overview, the components and every piece of sales material are on its page.</p>
<p>${link("[offering link]", "Open the offering")}</p>
<p>Any questions, come to me.</p>`,
    },
    {
      id: "pipeline-nudge",
      name: "Ask for a pipeline update",
      hint: "A nudge to bring deals up to date before a review.",
      icon: TrendingUp,
      color: "var(--ink-violet-soft)",
      subject: "Bring your pipeline up to date before [day]",
      body: `<p>Hi,</p>
<p>We are reviewing the pipeline on <b>[day]</b>. Before then, please make sure your
opportunities say what is actually true:</p>
<ul>
  <li>the value and the confidence on each open deal</li>
  <li>the expected sign date, if it has moved</li>
  <li>the next step, so the review is about decisions and not status</li>
</ul>
<p>${link("[opportunities link]", "Open your opportunities")}</p>
<p>Thank you.</p>`,
    },
    {
      id: "share-material",
      name: "Share material with a customer",
      hint: "A short client-facing note to go with an attachment or a link.",
      icon: Sparkles,
      color: "#0891B2",
      subject: "The material we discussed",
      body: `<p>Hi [name],</p>
<p>Thank you for your time today. As promised, here is the material we talked
through:</p>
<ul>
  <li>[document name] — [one line on what it covers]</li>
  <li>[document name] — [one line on what it covers]</li>
</ul>
<p>[One line on the next step you agreed, and when.]</p>
<p>Any questions in the meantime, reply here and I will pick it up.</p>
<p>Best regards,<br>[your name]</p>`,
    },
    {
      id: "welcome",
      name: "Welcome a new joiner",
      hint: "What to open first, for somebody who just got access.",
      icon: UserPlus,
      color: "#16A34A",
      subject: "Welcome to Freyr Sales Intelligence",
      body: `<p>Hi [name],</p>
<p>Your access is set up. A few places worth opening first:</p>
<ul>
  <li><b>Offerings</b> — everything we sell, what each one is, and who it suits.</li>
  <li><b>Sales Materials</b> — decks, one-pagers and product sheets, by offering.</li>
  <li><b>Opportunities</b> — your deals, their value and where each one stands.</li>
  <li><b>Performance</b> — your goals and what has been logged against them.</li>
</ul>
<p>${link("[app link]", "Open the platform")}</p>
<p>If anything looks wrong or missing, tell me and I will sort it.</p>`,
    },
    {
      id: "month-end",
      name: "Month-end reminder",
      hint: "Log what closed before the month is counted.",
      icon: CalendarClock,
      color: "#4338CA",
      subject: "Log your results before the month closes",
      body: `<p>Hi,</p>
<p>The month closes on <b>[date]</b>. Anything not logged by then will not be in
the numbers we report.</p>
<ul>
  <li>Log every activity you have completed against its goal.</li>
  <li>Update any deal that signed, and its value.</li>
  <li>Check your accrual months still match when the money actually lands.</li>
</ul>
<p>${link("[performance link]", "Open Performance")}</p>
<p>Thank you.</p>`,
    },
  ];
}
