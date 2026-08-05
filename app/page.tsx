import Link from "next/link";
import {
  ArrowRight,
  BookOpenText,
  Bot,
  Check,
  FileStack,
  LockKeyhole,
  Route,
  Sparkles,
} from "lucide-react";
import styles from "./landing.module.css";

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

export default function Home() {
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
            The internal source of truth for every offering
          </div>
          <h1>
            Know what Freyr can sell.
            <span>Know how to sell it.</span>
          </h1>
          <p className={styles.lede}>
            Sales Intelligence brings offering briefs, current roadmaps,
            approved sales materials and Freyr AI into one governed workspace.
          </p>

          <div className={styles.actions}>
            <Link href="/login" className={styles.primaryAction}>
              Sign in to Sales Intelligence
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <span className={styles.actionNote}>For Freyr teams</span>
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
