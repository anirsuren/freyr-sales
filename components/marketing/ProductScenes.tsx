"use client";

import Image from "next/image";
import { ArrowUpRight, BookOpenText, BriefcaseBusiness, Building2, CalendarDays, Check, CheckCircle2, FileText, Globe2, Link2, Newspaper, Target, UsersRound } from "lucide-react";
import claudiaPhoto from "@/public/avatars/claudia-hofmann.png";
import gracePhoto from "@/public/avatars/grace-liu.png";
import s from "@/app/landing.module.css";

/** Focused, code-built details from illustrative workspace records. */
export function ProductScene({ index }: { index: number }) {
  return <div className={s.featureScene}>
    <div className={s.featureWindow}>
      <div className={s.featureWindowTop}>
        <span className={s.featureWindowMark}>ƒ</span>
        <span>Freyr</span>
        <span className={s.featureWindowPath}>{["Customers / Meridian Pharmaceuticals", "Opportunities / Lifecycle Maintenance", "Market Intel / Takeda", "Goals / Booked Revenue", "Offerings / Freya.Register"][index]}</span>
        <span className={s.featureWindowSample}>SAMPLE WORKSPACE</span>
      </div>

      {index === 0 && <div className={s.featureWindowBody}>
        <div className={s.featureLabel}><Building2 size={16}/> CUSTOMER ACCOUNT</div>
        <h3 className={s.featureTitle}>Meridian Pharmaceuticals</h3>
        <p className={s.featureSub}>Pharmaceutical · Switzerland (Basel)</p>
        <div className={s.featureAccountSplit}>
          <div className={s.featurePerson}>
            <Image src={claudiaPhoto} alt="Claudia Hofmann" width={76} height={76} sizes="76px"/>
            <div><small>ONE OF 5 LINKED CONTACTS</small><strong>Claudia Hofmann</strong><span>Global Head, Reg Submissions</span></div>
          </div>
          <div className={s.featureAccountLink}>
            <small>LINKED OPPORTUNITY</small>
            <strong>Lifecycle Maintenance</strong>
            <span>$140,000 · expected Oct 31, 2026</span>
            <span className={s.featureTextLink}>Follow the deal <ArrowUpRight size={15}/></span>
          </div>
        </div>
        <div className={s.featureBottomLine}><UsersRound size={16}/> The person, account and deal stay connected.</div>
      </div>}

      {index === 1 && <div className={s.featureWindowBody}>
        <div className={s.featureLabel}><BriefcaseBusiness size={16}/> OPPORTUNITY</div>
        <h3 className={s.featureTitle}>Lifecycle Maintenance</h3>
        <p className={s.featureSub}>Meridian Pharmaceuticals</p>
        <div className={s.featureDealHero}><div><small>OPPORTUNITY VALUE</small><strong>$140,000</strong><span>Recorded in USD</span></div><div><small>EXPECTED SIGN</small><strong>Oct 31</strong><span>2026</span></div></div>
        <div className={s.featureDealFooter}><span><Image src={gracePhoto} alt="" width={32} height={32} sizes="32px"/> Grace Liu <small>Owner</small></span><span><CalendarDays size={16}/> Pipeline · 75% confidence</span></div>
      </div>}

      {index === 2 && <div className={s.featureWindowBody}>
        <div className={s.featureLabel}><Globe2 size={16}/> MARKET INTELLIGENCE</div>
        <h3 className={s.featureTitle}>A signal worth reading.</h3>
        <p className={s.featureSub}>Takeda · Regulatory operations</p>
        <div className={s.featureArticle}>
          <div className={s.featureArticleSource}><Newspaper size={18}/> REUTERS <span>COMPANY UPDATE</span></div>
          <strong>Takeda outlines digital overhaul of regulatory operations</strong>
          <p>Leadership named regulatory technology as a priority for operational spending, citing submission growth across emerging markets.</p>
          <div><span>Source and company context together</span><ArrowUpRight size={17}/></div>
        </div>
      </div>}

      {index === 3 && <div className={s.featureWindowBody}>
        <div className={s.featureLabel}><Target size={16}/> GOAL PROGRESS</div>
        <h3 className={s.featureTitle}>Booked Revenue</h3>
        <p className={s.featureSub}>Contract value signed · FY 2026/27</p>
        <div className={s.featureGoalFigure}><div><small>VERIFIED RESULTS</small><strong>$41.8M</strong><span>toward a $100M target</span></div><div className={s.featureGoalTrack}><i/></div><div className={s.featureGoalLegend}><span><CheckCircle2 size={15}/> Verified work counts now</span><span>41.8% of target</span></div></div>
        <div className={s.featureBottomLine}><Check size={16}/> Pending work stays separate until verified.</div>
      </div>}

      {index === 4 && <div className={s.featureWindowBody}>
        <div className={s.featureLabel}><BookOpenText size={16}/> OFFERING & MATERIALS</div>
        <h3 className={s.featureTitle}>Freya.Register</h3>
        <p className={s.featureSub}>Regulatory Information Management</p>
        <div className={s.featureMaterial}>
          <span className={s.featureMaterialIcon}><FileText size={27}/></span>
          <div><small>SALES MATERIAL</small><strong>Freya.Register overview</strong><span>Available from the offering record</span></div>
          <ArrowUpRight size={19}/>
        </div>
        <div className={s.featureBottomLine}><Link2 size={16}/> The capability and its supporting material stay together.</div>
      </div>}
    </div>
  </div>;
}
