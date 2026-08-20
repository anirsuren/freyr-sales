import { cookies } from "next/headers";
import Link from "next/link";
import {
  ArrowRight,
  LogOut,
  BookOpenText,
  Bot,
  Check,
  FileStack,
  LockKeyhole,
  Route,
  Sparkles,
} from "lucide-react";
import styles from "./landing.module.css";
import { APP_SESSION_COOKIE, verifyAppSession } from "@/lib/appSession";
import { appHomePath } from "@/lib/appHome";

export const dynamic = "force-dynamic";

const capabilities = [
  {
    icon: BookOpenText,
    title: "Offering briefs",
    text: "Clear positioning, ownership and availability in one place.",
  },
  {
    icon: FileStack,
    title: "Approved materials",
    text: "The right customer asset, organized for the right sales moment.",
  },
  {
    icon: Bot,
    title: "Freyr AI",
    text: "Answers grounded in the offering content your teams maintain.",
  },
];

export default async function Home() {
  // THE LANDING PAGE ASKS WHO YOU ARE. It never did, so it offered "Sign in"
  // to people already holding a valid session while /dashboard let them
  // straight through — the same browser looked signed out on one URL and
  // signed in on the next (Anir, Aug 7). The cookie is verified here, not
  // merely read, so a tampered or expired one still shows the signed-out page.
  const session = await verifyAppSession(
    (await cookies()).get(APP_SESSION_COOKIE)?.value
  );
  const home = appHomePath();
  return (
    <main className={styles.page}>
      <div className={styles.ambient} aria-hidden="true" />

      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="Freyr Sales Intelligence home">
          <span className={styles.brandMark}>f</span>
          <span className={styles.brandWords}>
            <strong>Freyr</strong>
            <span>Sales Intelligence</span>
          </span>
        </Link>
        <div className={styles.secureLabel}>
          <LockKeyhole size={14} aria-hidden="true" />
          Freyr company access
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.copy}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowDot} />
            Sales Intelligence
          </div>
          <h1>
            The all-in-one sales platform
            <span>for Freyr.</span>
          </h1>
          <p className={styles.lede}>
            Offering briefs, roadmaps, sales materials and Freyr AI, in one
            place.
          </p>

          <div className={styles.actions}>
            {session ? (
              <>
                <Link href={home} className={styles.primaryAction}>
                  Open Sales Intelligence
                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
                {/* A SAVED SESSION MUST NOT BE A TRAP (Anir, Aug 13: "there's
                    literally no way for me to switch my account"). Coming back
                    to this page while signed in only ever offered the way
                    forward, so testing the app as a rep meant clearing cookies
                    by hand. This signs out and drops you straight on the form. */}
                <span className={styles.actionNote}>
                  Signed in as {session.name || session.email}
                  <a
                    href="/api/auth/logout?next=/login"
                    className={styles.switchAccount}
                  >
                    <LogOut size={13} aria-hidden="true" />
                    Use a different account
                  </a>
                </span>
              </>
            ) : (
              <>
                <Link href="/login" className={styles.primaryAction}>
                  Sign in to Sales Intelligence
                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
                <span className={styles.actionNote}>For Freyr teams</span>
              </>
            )}
          </div>
        </div>

        <div className={styles.productStage} aria-label="Sales Intelligence product preview">
          <div className={styles.stageGlow} aria-hidden="true" />
          <div className={styles.catalogCard}>
            <div className={styles.windowBar}>
              <div className={styles.windowBrand}>
                <span className={styles.miniMark}>f</span>
                <span>Sales Intelligence</span>
              </div>
              <div className={styles.windowUser}>FS</div>
            </div>

            <div className={styles.windowBody}>
              <div className={styles.windowNav} aria-hidden="true">
                <span />
                <span className={styles.navActive} />
                <span />
                <span />
              </div>

              <div className={styles.offeringPanel}>
                <div className={styles.panelTopline}>
                  <div>
                    <span className={styles.panelLabel}>OFFERING</span>
                    <h2>Freya.Register</h2>
                  </div>
                  <span className={styles.available}>
                    <Check size={12} aria-hidden="true" /> Available now
                  </span>
                </div>

                <div className={styles.tabs}>
                  <span className={styles.tabActive}>Overview</span>
                  <span>Sales materials</span>
                  <span>Roadmap</span>
                </div>

                <div className={styles.signalGrid}>
                  <div className={styles.signalColumn}>
                    <div className={styles.signalItem}>
                      <span className={styles.signalIcon}><BookOpenText size={16} /></span>
                      <span><strong>Offering brief</strong><small>Positioning &amp; scope</small></span>
                      <Check size={15} className={styles.signalCheck} />
                    </div>
                    <div className={styles.signalItem}>
                      <span className={styles.signalIcon}><FileStack size={16} /></span>
                      <span><strong>Sales materials</strong><small>Approved &amp; organized</small></span>
                      <Check size={15} className={styles.signalCheck} />
                    </div>
                    <div className={styles.signalItem}>
                      <span className={styles.signalIcon}><Route size={16} /></span>
                      <span><strong>Product roadmap</strong><small>Current &amp; next</small></span>
                      <Check size={15} className={styles.signalCheck} />
                    </div>
                  </div>

                  {/* The REAL assistant: the light dock panel that floats
                      bottom-right in the app, not an invented dark widget. */}
                  <div className={styles.aiDockWrap}>
                    <div className={styles.aiDock}>
                      <div className={styles.aiDockHead}>
                        <span className={styles.aiDockIcon}><Sparkles size={13} /></span>
                        <span className={styles.aiDockTitle}>
                          <strong>Freyr AI</strong>
                          <small>Grounded in this offering</small>
                        </span>
                      </div>
                      <div className={styles.aiChat}>
                        <p className={styles.aiUserMsg}>What does Freya.Register do?</p>
                        <div className={styles.aiAnswerMsg}>
                          <p>
                            Freya.Register gives regulatory teams a governed
                            source of truth across products, applications and
                            registrations.
                          </p>
                          <div className={styles.aiSourceRow}>
                            <span>Offering brief</span>
                            <span>Roadmap</span>
                          </div>
                        </div>
                      </div>
                      <div className={styles.aiInputBar}>
                        <span>Ask about this offering…</span>
                        <i className={styles.aiSend}><ArrowRight size={11} /></i>
                      </div>
                    </div>
                    <span className={styles.dockFab} aria-hidden="true">
                      <Sparkles size={15} />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.capabilities} aria-label="What Sales Intelligence provides">
        {capabilities.map(({ icon: Icon, title, text }) => (
          <article key={title}>
            <span className={styles.capabilityIcon}><Icon size={18} aria-hidden="true" /></span>
            <div>
              <h2>{title}</h2>
              <p>{text}</p>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
