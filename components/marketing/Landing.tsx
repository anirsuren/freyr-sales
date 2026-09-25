"use client";

import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, MotionConfig, motion, useInView, useReducedMotion } from "motion/react";
import { CountUp, Reveal, ease, reveal } from "./Motion";
import { ArrowDown, ArrowLeft, ArrowRight, BookOpenText, BriefcaseBusiness, CalendarDays, Check, CheckCircle2, ChevronRight, CircleDot, FileText, Globe2, Layers, Link2, LockKeyhole, Menu, Pause, Play, Plus, Sparkles, Target, UsersRound, X } from "lucide-react";
import mark from "@/public/freyr-mark.png";
import hero from "@/public/landing/heroes/10-profile.jpg";
import s from "@/app/landing.module.css";
import { ProductScene } from "./ProductScenes";

function Brand() { return <Link href="/" className={s.brand} aria-label="Freyr Sales Intelligence home"><Image src={mark} width={30} height={30} alt="" /><span><strong>Freyr</strong><small>Sales Intelligence</small></span></Link>; }
function Head({ eyebrow, title, text, centered = false, id }: { eyebrow: string; title: ReactNode; text?: string; centered?: boolean; id?: string }) {
  return <Reveal className={`${s.head} ${centered ? s.centered : ""}`}><p className={s.eyebrow}>{eyebrow}</p><h2 id={id}>{title}</h2>{text && <p className={s.lede}>{text}</p>}</Reveal>;
}
function Tag({ children, tone = "blue" }: { children: ReactNode; tone?: "blue" | "green" | "amber" | "purple" }) { return <span className={`${s.tag} ${s[tone]}`}>{children}</span>; }
function Chrome({ label }: { label: string }) { return <div className={s.chrome}><span aria-hidden="true"><i /><i /><i /></span><small>{label}</small><span className={s.sample}>Sample workspace</span></div>; }
function Avatar({ initials }: { initials: string }) { return <span className={s.avatar}>{initials}</span>; }

const AREAS = [ ["Leads", "people & follow-up"], ["Opportunities", "deals & commitments"], ["Market Intel", "customers & competitors"], ["Offerings", "knowledge & materials"], ["Goals", "targets & results"] ];
const RECORDS = [
  { title: "Regulatory submission", type: "Opportunity", detail: "Scope review with the customer", stage: "Qualified", icon: BriefcaseBusiness, tone: "blue" },
  { title: "Customer intelligence", type: "Market Intel", detail: "A new signal for the account", stage: "Following", icon: Globe2, tone: "purple" },
  { title: "Labeling capabilities", type: "Offering", detail: "Brief, materials and related services", stage: "Available", icon: BookOpenText, tone: "blue" },
  { title: "Quarterly sales goal", type: "Performance", detail: "Verified work and pending results", stage: "In progress", icon: Target, tone: "purple" },
  { title: "Product introduction", type: "Lead", detail: "The request, the person, the owner", stage: "Qualifying", icon: UsersRound, tone: "blue" },
  { title: "Technical workshop", type: "Solutioning", detail: "Customer need and agreed scope", stage: "Requested", icon: Layers, tone: "purple" },
] as const;
function RecordCard({ record }: { record: (typeof RECORDS)[number] }) {
  const Icon = record.icon;
  return <article className={s.record}><div className={s.recordTitle}><span className={s.iconBox}><Icon size={18} /></span><div><strong>{record.title}</strong><small>{record.type}</small></div></div><p>{record.detail}</p><div className={s.recordMeta}><Tag tone={record.tone}><CircleDot size={11} />{record.stage}</Tag><span><Link2 size={12} /> Linked context</span></div></article>;
}
function Widget({ kind }: { kind: number }) {
  return <article className={s.widget}><p className={s.widgetTitle}>{["Opportunity stages", "Goal progress", "Next customer step", "People in the account", "Connected materials", "Latest intelligence"][kind]}</p>
    {kind === 0 && <div className={s.donutRow}><div className={s.donut}><span>Deals</span></div><div className={s.legend}><span><i style={{ background: "#1b5fd6" }} />Qualified</span><span><i style={{ background: "#6b4bc4" }} />Proposal</span><span><i style={{ background: "#0891b2" }} />Negotiation</span></div></div>}
    {kind === 1 && <><div className={s.progressLabel}><strong>Verified</strong><span>Pending review</span></div><div className={s.progress}><i /><i /><i /></div><div className={s.miniLegend}><span><CheckCircle2 size={12} />Counts now</span><span><CircleDot size={12} />Waiting</span></div></>}
    {kind === 2 && <div className={s.nextStep}><CalendarDays size={28} /><div><strong>Confirm the project scope</strong><span>Customer commitment</span><Tag><Check size={11} />Next step recorded</Tag></div></div>}
    {kind === 3 && <><div className={s.avatars}>{["AL","SK","MJ","RB","TN"].map(n=><Avatar key={n} initials={n} />)}</div><p className={s.widgetNote}>Owner, stakeholders and contacts.<br />The people behind the work.</p></>}
    {kind === 4 && <div className={s.fileList}>{["Offering overview","Capabilities presentation","Customer scope"].map(t=><span key={t}><FileText size={14} />{t}<ChevronRight size={12} /></span>)}</div>}
    {kind === 5 && <><Tag tone="purple"><Globe2 size={12} />Customer signal</Tag><p className={s.widgetNote}>A company update, with its source and account context close by.</p></>}
  </article>;
}
function RecordRows() {
  const [paused,setPaused]=useState(false);
  return <section className={s.section} aria-labelledby="one-place-title"><div className={s.container}><Head centered eyebrow="One place" id="one-place-title" title={<>Every relationship, every opportunity, <em>in one place.</em></>} text="The people you know, the deals you are working on, and the information that helps you move them forward." /></div><div className={s.marquees} data-paused={paused}>
    <div className={s.marqueeMask}><div className={s.marqueeTrack}>{[0,1].map(copy=><div className={s.marqueeGroup} key={copy} aria-hidden={copy===1}>{RECORDS.map(r=><RecordCard key={r.title} record={r} />)}</div>)}</div></div>
    <div className={s.marqueeMask}><div className={`${s.marqueeTrack} ${s.reverse}`}>{[0,1].map(copy=><div className={s.marqueeGroup} key={copy} aria-hidden={copy===1}>{[0,1,2,3,4,5].map(k=><Widget key={k} kind={k} />)}</div>)}</div></div>
  </div><div className={s.marqueeFoot}><span>Illustrative records and views</span><button type="button" onClick={()=>setPaused(!paused)} aria-label={paused?"Play product examples":"Pause product examples"}>{paused?<Play size={13}/>:<Pause size={13}/>}</button></div></section>;
}

const SCENES = [
  { question: "What needs my attention before the account review?", answer: "The regulatory submission is at the proposal stage. The next commitment is to confirm scope with the customer. Review the opportunity and the latest account update before the call.", links: ["Regulatory submission", "Customer account", "Latest intelligence"] },
  { question: "How are we doing against our sales goals?", answer: "Start with verified results for the selected period. Keep work awaiting review separate, then follow the goal into the group and person breakdown.", links: ["Goal progress", "Group results", "People results"] },
  { question: "Which materials should I use for this conversation?", answer: "The offering overview explains the scope. The capabilities presentation supports the discussion. Check the latest materials on the offering before sharing them.", links: ["Offering overview", "Sales materials", "Related offerings"] },
];
function AgentDemo() {
  const [scene, setScene] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, { amount: 0.3 });
  const reduce = useReducedMotion();
  const item = SCENES[scene];
  const typingDuration = item.question.length * 24;
  const answerAt = typingDuration + 650;
  const linksAt = answerAt + 850;
  const sceneDuration = linksAt + 4200;

  // Pause off screen and when the reader pauses. Only this small demo rerenders.
  useEffect(() => {
    if (!playing || !visible || reduce) return;
    let previous = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const delta = Math.min(now - previous, 100);
      previous = now;
      setElapsed(time => time + delta);
    }, 32);
    return () => clearInterval(timer);
  }, [playing, visible, reduce]);
  useEffect(() => {
    if (elapsed < sceneDuration) return;
    setScene(value => (value + 1) % SCENES.length);
    setElapsed(0);
  }, [elapsed, sceneDuration]);
  const typed = reduce ? item.question.length : Math.min(item.question.length, Math.floor(elapsed / 24));
  const showAnswer = reduce || elapsed >= answerAt;
  const showLinks = reduce || elapsed >= linksAt;

  return <section className={`${s.section} ${s.tint}`} aria-labelledby="demo-title"><div className={s.container}>
    <Head centered eyebrow="Watch it work" id="demo-title" title={<>Question in. <em>Context</em> out.</>} text="Ask about the work. Get an answer you can follow into the people, records and materials behind it." />
    <Reveal className={s.demoWrap}><div className={s.demoCard} ref={ref}><Chrome label="Freyr AI"/>
      <div className={s.demoBody} data-demo-phase={showLinks ? "linked" : showAnswer ? "answer" : "typing"}>
        <AnimatePresence mode="wait" initial={false}><motion.div key={scene} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:.25}}>
          <p className={s.eyebrow}>Your question</p>
          <p className={s.demoPrompt}><span className={s.srOnly}>{item.question}</span><span aria-hidden="true">{item.question.slice(0,typed)}{typed<item.question.length&&<span className={s.typingCursor}/>}</span></p>
          <div className={s.demoStatus}>
            {showAnswer ? <motion.div initial={{opacity:0,scale:.92,y:4}} animate={{opacity:1,scale:1,y:0}} transition={{type:"spring",stiffness:420,damping:26}}><Tag><Sparkles size={12}/>Workspace context</Tag></motion.div> : <span className={s.thinking}><i/><i/><i/>Thinking…</span>}
          </div>
          <div className={s.answerSlot}>
            {showAnswer&&<motion.p className={s.demoAnswer} initial={{opacity:0,x:16}} animate={{opacity:1,x:0}} transition={{duration:.45,ease}}>{item.answer}</motion.p>}
            {showLinks&&<div className={s.linkPills}>{item.links.map((text,i)=><motion.span key={text} initial={{opacity:0,y:6,scale:.96}} animate={{opacity:1,y:0,scale:1}} transition={{duration:.35,delay:i*.1,ease}}><Link2 size={12}/>{text}<ChevronRight size={12}/></motion.span>)}</div>}
          </div>
        </motion.div></AnimatePresence>
      </div>
      <div className={s.demoFooter}><span>Example conversation · no live request</span><div className={s.dots}>{SCENES.map((_,i)=><button key={i} type="button" aria-label={`Show example ${i+1}`} aria-current={i===scene?"true":undefined} onClick={()=>{setScene(i);setElapsed(0);setPlaying(true);}}/>)}<button className={s.pause} type="button" aria-label={playing?"Pause AI demonstration":"Play AI demonstration"} onClick={()=>setPlaying(!playing)}>{playing?<Pause size={13}/>:<Play size={13}/>}</button></div></div>
    </div></Reveal>
  </div></section>;
}

const TABS=["The account picture","Opportunities in view","Signals worth reading","Goals you can explain","Knowledge in reach"];
const PREVIEW_NOTES=["A customer, their people and the linked opportunity in one picture.","The value and expected date stay beside each deal.","Read company signals with their sources and activity mix.","See verified work against the target, with pending work kept separate.","Find a capability and the materials that support it."];
function Showcase(){
  const [index,setIndex]=useState(0);
  const [direction,setDirection]=useState(1);
  const dragStart=useRef<number|null>(null);
  const reduce=useReducedMotion();
  const go=(n:number)=>{setDirection(n>index?1:-1);setIndex((n+TABS.length)%TABS.length);};
  return <section id="features" className={`${s.section} ${s.tint} ${s.ruled}`} aria-labelledby="features-title"><div className={s.container}>
    <Head eyebrow="The product" id="features-title" title={<>The full sales picture. <strong>One workspace.</strong></>} text="Move between the account, the deal, the market and the goal. The details belong together."/>
    <div className={s.tabs} role="tablist" aria-label="Product views">{TABS.map((t,i)=><button type="button" role="tab" key={t} id={`view-tab-${i}`} tabIndex={i===index?0:-1} aria-selected={i===index} aria-controls="product-view" onClick={()=>go(i)} onKeyDown={e=>{let next=i;if(e.key==="ArrowRight")next=(i+1)%TABS.length;else if(e.key==="ArrowLeft")next=(i+TABS.length-1)%TABS.length;else if(e.key==="Home")next=0;else if(e.key==="End")next=TABS.length-1;else return;e.preventDefault();go(next);document.getElementById(`view-tab-${next}`)?.focus();}}>{t}</button>)}</div>
    <Reveal><div className={s.productFrame} id="product-view" role="tabpanel" aria-labelledby={`view-tab-${index}`} onPointerDown={e=>{dragStart.current=e.clientX;}} onPointerUp={e=>{if(dragStart.current===null)return;const delta=e.clientX-dragStart.current;dragStart.current=null;if(Math.abs(delta)>60)go(index+(delta<0?1:-1));}} onPointerCancel={()=>{dragStart.current=null;}}>
      <div className={s.previewSlides}><AnimatePresence initial={false} custom={direction} mode="popLayout"><motion.div key={index} custom={direction} variants={{enter:(d:number)=>({opacity:0,x:reduce?0:40*d}),center:{opacity:1,x:0},exit:(d:number)=>({opacity:0,x:reduce?0:-40*d})}} initial="enter" animate="center" exit="exit" transition={{duration:.4,ease}}><ProductScene index={index}/></motion.div></AnimatePresence></div>
    </div></Reveal>
    <div className={s.carouselFoot}><p><strong>{TABS[index]}.</strong> {PREVIEW_NOTES[index]}</p><div><small>{index+1} / 5</small><button type="button" onClick={()=>go(index-1)} aria-label="Previous product view"><ArrowLeft size={16}/></button><button type="button" onClick={()=>go(index+1)} aria-label="Next product view"><ArrowRight size={16}/></button></div></div>
  </div></section>;
}

const FAQS=[
 {cat:"Workspace",q:"What does Freyr Sales Intelligence bring together?",a:"Customer and contact records, leads, opportunities, solutioning, contracts, market intelligence, offerings and goals. The pages available to you depend on your workspace access."},
 {cat:"Freyr AI",q:"What can I ask Freyr AI?",a:"Ask about the records and materials available to you: who owns a deal, the next customer commitment, an offering’s capabilities, recent intelligence or goal progress. Follow the linked source when you need the full detail."},
 {cat:"Freyr AI",q:"Can I use the chat while looking at a record?",a:"Yes. Open the side chat while reviewing a page, or continue in the full Agent workspace. The conversation can move with you between the two views."},
 {cat:"Workspace",q:"Where can I find customer and competitor updates?",a:"Market Intel brings together the companies you follow, their people and available updates. Open an item to see its source and the company context."},
 {cat:"Goals",q:"What is the difference between verified and pending progress?",a:"Verified results count toward a goal. Submitted results awaiting review stay separate, so you can distinguish completed progress from work that still needs a decision."},
 {cat:"Goals",q:"Can I explore progress by month, group and person?",a:"Goal views let you explore the periods and contributions available for that goal. A target that has not been set is shown as unset rather than assumed."},
 {cat:"Workspace",q:"Where are offering documents and sales materials?",a:"Open an offering to review its details and the supporting materials available to your account. Keep the offering in view when preparing a customer conversation."},
 {cat:"Workspace",q:"How do I get into the workspace?",a:"Use your Freyr work account to sign in. Your workspace role and access determine which pages and records you can use."},
];
function Faq(){const [cat,setCat]=useState("All");const [open,setOpen]=useState<string|null>(null);return <section id="faq" className={`${s.section} ${s.ruled}`} aria-labelledby="faq-title"><div className={`${s.container} ${s.split}`}><div><Head eyebrow="Questions" id="faq-title" title={<>A little more <em>clarity.</em></>}/><div className={s.faqTabs} aria-label="Question categories">{["All","Workspace","Freyr AI","Goals"].map(c=><button type="button" key={c} aria-pressed={cat===c} onClick={()=>{setCat(c);setOpen(null);}}>{c}</button>)}</div></div><motion.div key={cat} className={s.faqList} {...reveal} transition={{duration:.4,ease}}>{FAQS.filter(f=>cat==="All"||f.cat===cat).map((f)=>{const id=`faq-${FAQS.indexOf(f)}`;return <div key={f.q}><h3><button type="button" aria-expanded={open===f.q} aria-controls={id} onClick={()=>setOpen(open===f.q?null:f.q)}>{f.q}<span><Plus size={14}/></span></button></h3><div className={s.faqAnswer} id={id} data-open={open===f.q} inert={open!==f.q}><div><p>{f.a}</p></div></div></div>;})}</motion.div></div></section>;}

export function Landing({entry,signedIn,heroImage}:{entry:string;signedIn:boolean;heroImage?:StaticImageData}) {
 const [menu,setMenu]=useState(false);const [scrolled,setScrolled]=useState(false);
 useEffect(()=>{const update=()=>setScrolled(window.scrollY>8);update();window.addEventListener("scroll",update,{passive:true});return()=>window.removeEventListener("scroll",update);},[]);
 const entryLabel=signedIn?"Open workspace":"Sign in";
 return <MotionConfig reducedMotion="user" transition={{duration:.6,ease}}><header className={s.header} data-scrolled={scrolled||menu}><div className={s.navInner}><Brand/><nav aria-label="Primary">{[["#product","Product"],["#faq","FAQ"]].map(([href,t])=><a key={href} href={href}>{t}</a>)}</nav><Link className={s.navSignIn} href={entry}>{entryLabel}</Link><a href="#features" className={s.button}>Explore Freyr</a><button className={s.menuToggle} type="button" aria-label={menu?"Close menu":"Open menu"} aria-expanded={menu} aria-controls="landing-menu" onClick={()=>setMenu(!menu)}>{menu?<X size={20}/>:<Menu size={20}/>}</button></div>{menu&&<nav id="landing-menu" className={s.mobileMenu} aria-label="Mobile navigation">{[["#product","Product"],["#faq","FAQ"]].map(([href,t])=><a key={href} href={href} onClick={()=>setMenu(false)}>{t}</a>)}<Link href={entry} className={s.button}>{entryLabel}</Link></nav>}</header>
 <main>
 <section className={s.hero} aria-labelledby="hero-title"><motion.div className={s.heroVisual} initial={{opacity:0,scale:1.04}} animate={{opacity:1,scale:1}} transition={{duration:1.6,ease}}><Image src={heroImage ?? hero} alt="" fill priority sizes="100vw"/><div/></motion.div><div className={s.heroInner}><div className={s.heroCopy}><motion.h1 initial={{opacity:0,y:18}} animate={{opacity:1,y:0}} transition={{duration:.8,ease,delay:.15}} id="hero-title">Every account, a <em>clearer</em> next move.</motion.h1><motion.p initial={{opacity:0,y:18}} animate={{opacity:1,y:0}} transition={{duration:.8,ease,delay:.24}}>Know the customer. Follow the opportunity. Bring the right knowledge to every conversation, with Freyr AI beside you.</motion.p><motion.ul initial={{opacity:0,y:18}} animate={{opacity:1,y:0}} transition={{duration:.8,ease,delay:.33}}><li><UsersRound size={16}/>People and deals, connected</li><li><Globe2 size={16}/>Customer and market context</li><li><Sparkles size={16}/>Answers from your workspace</li></motion.ul><motion.div initial={{opacity:0,y:18}} animate={{opacity:1,y:0}} transition={{duration:.8,ease,delay:.42}} className={s.heroActions}><Link href={entry} className={s.button}>{entryLabel}<ArrowRight size={17}/></Link><p>Built for Freyr teams. <a href="#features">Take a look inside <ArrowDown size={12}/></a></p></motion.div></div></div></section>
 <section className={s.standards}><Reveal className={s.container}><h2>One workspace for the full sales picture</h2><ul>{AREAS.map(([name,note])=><li key={name}><strong>{name}</strong><span>{note}</span></li>)}</ul></Reveal></section>
 <RecordRows/><AgentDemo/>
 <section id="product" className={s.section} aria-labelledby="product-title"><div className={`${s.container} ${s.productSplit}`}><div><Head eyebrow="What is Freyr Sales Intelligence?" id="product-title" title={<>A sales workspace built around one question: <em>what should happen next?</em></>}/><div className={s.productText}><p>The customer history is in one place. The offering is in another. The next step is buried in a conversation. Preparing for a meeting becomes a search.</p><p>Freyr connects the account, its people, opportunities, market intelligence and materials. Freyr AI helps you ask about that work and follow the answer back to its records.</p><p>Less time finding the context. More time using it.</p></div></div><Reveal delay={100}><div className={s.productFact}><p className={s.eyebrow}>The same customer story</p><strong className={s.bigNumber}><CountUp from={9999} to={1} duration={0.7}/></strong><h3>connected workspace</h3><p>From the first lead to the opportunity, the solutioning request and the contract. Keep the people and the commitments in the picture.</p><div className={s.factDetails}><div><span>Ask about the work</span><strong>Freyr AI</strong></div><div><span>Follow the detail</span><strong>Linked records</strong></div></div></div></Reveal></div></section>
 <Showcase/>
 <section className={`${s.section} ${s.ruled}`} aria-labelledby="value-title"><div className={s.container}><Head eyebrow="What changes" id="value-title" title={<>Prepare with <strong>context.</strong> Follow through with confidence.</>}/><div className={s.valueGrid}>{[[UsersRound,"Know the people","Keep the owner, stakeholders and customer contacts beside the work."],[Link2,"Follow the record","Move from an answer to the account, opportunity or material it describes."],[Globe2,"Read the signals","Bring customer and competitor activity into your preparation."],[Target,"See what counts","Distinguish verified progress from work still awaiting review."]].map(([Icon,title,body],i)=>{const I=Icon as typeof Sparkles;return <Reveal key={String(title)} delay={i*60}><article className={s.card}><span className={s.iconBox}><I size={18}/></span><h3>{String(title)}</h3><p>{String(body)}</p></article></Reveal>;})}</div></div></section>
 <section id="teams" className={`${s.section} ${s.tint} ${s.ruled}`} aria-labelledby="teams-title"><div className={s.container}><Head eyebrow="Who uses it" id="teams-title" title={<>Built for the teams that <strong>move the customer forward.</strong></>} text="The same account looks different from each seat. Keep the work connected across the team."/><div className={s.roleGrid}>{[[BriefcaseBusiness,"Account owners","CUSTOMER RELATIONSHIPS","Prepare for the next call with the account, open deals, people and commitments in view."],[UsersRound,"Sales leaders","OWNERSHIP & FOLLOW-THROUGH","Review the work, see where attention is needed and find the person responsible for the next step."],[Layers,"Solutioning teams","SCOPE & CUSTOMER NEED","Start from the linked request and offering context when shaping a response."],[BookOpenText,"Offering teams","CAPABILITIES & MATERIALS","Keep the offering and its supporting knowledge close to the sales conversation."],[Globe2,"Market intelligence teams","CUSTOMERS & COMPETITORS","Follow company activity and sources that matter to the accounts your team works with."],[Target,"Performance owners","TARGETS & VERIFIED RESULTS","Review goal contributions with clear periods, ownership and verification status."]].map(([Icon,title,who,body],i)=>{const I=Icon as typeof Sparkles;return <Reveal key={String(title)} delay={i*50}><article className={s.card}><div className={s.roleTitle}><span className={s.iconBox}><I size={17}/></span><h3>{String(title)}</h3></div><p className={s.roleWho}>{String(who)}</p><p>{String(body)}</p></article></Reveal>;})}</div></div></section>
 <section className={`${s.trust} ${s.ruled}`} aria-label="Workspace access and source context"><div className={`${s.container} ${s.trustGrid}`}>{[[Link2,"Keep the source in sight","Open the underlying record when you need the full detail. Ownership, dates, linked work and supporting materials stay available in the workspace.",["Linked records","Named owners","Source context"]],[LockKeyhole,"Access follows the workspace","Use your Freyr account to sign in. Available modules and records follow your workspace role and permissions.",["Work account","Role-based access","Workspace permissions"]]].map(([Icon,title,body,chips])=>{const I=Icon as typeof Sparkles;return <Reveal key={String(title)}><article className={s.trustCard}><div><span className={s.iconBox}><I size={20}/></span><h3>{String(title)}</h3></div><p>{String(body)}</p><ul>{(chips as string[]).map(c=><li key={c}>{c}</li>)}</ul></article></Reveal>;})}</div></section>
 <Faq/>
 <section className={`${s.cta} ${s.ruled}`} aria-labelledby="cta-title"><div className={s.container}><Reveal className={s.centered}><h2 id="cta-title">Know the account.<br/><strong>See the opportunity.</strong> <em>Make the next move.</em></h2><p>Bring your customer work into one connected workspace.<br/>Start your next conversation with the full picture.</p><div><Link href={entry} className={s.button}>{entryLabel}<ArrowRight size={16}/></Link><a href="#features" className={s.secondary}>Explore the workspace</a></div></Reveal></div></section>
 </main><footer className={`${s.footer} ${s.ruled}`}><div className={`${s.container} ${s.footerGrid}`}><div><Brand/><p>Customer relationships, opportunities, knowledge and market context. Connected for Freyr teams.</p></div>{[["Workspace",[["The product","#product"],["Explore the views","#features"],["Teams","#teams"]]],["Learn",[["Freyr AI","#demo-title"],["Questions","#faq"]]],["Your account",[[entryLabel,entry],["Back to top","#hero-title"]]]].map(([title,links])=><div key={String(title)}><h3>{String(title)}</h3><ul>{(links as string[][]).map(([t,href])=><li key={t}><Link href={href}>{t}</Link></li>)}</ul></div>)}</div><div className={s.footerBottom}><div className={s.container}><span>© {new Date().getFullYear()} Freyr Sales Intelligence</span><span>Built for Freyr teams</span></div></div></footer></MotionConfig>;
}
