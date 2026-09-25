import { cookies } from "next/headers";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import { APP_SESSION_COOKIE, verifyAppSession } from "@/lib/appSession";
import { appHomePath } from "@/lib/appHome";
import { Landing } from "@/components/marketing/Landing";
import { heroOptions } from "@/components/marketing/hero-options";
import styles from "./landing.module.css";

export const dynamic = "force-dynamic";
const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--landing-sans" });
const serif = Newsreader({ subsets: ["latin"], weight: ["400", "500", "600"], style: ["normal", "italic"], variable: "--landing-serif" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--landing-mono" });

export default async function Home({ searchParams }: { searchParams: Promise<{ hero?: string }> }) {
  const key = (await searchParams).hero;
  const previewHero = process.env.NODE_ENV === "development" && key && Object.hasOwn(heroOptions, key) ? heroOptions[key as keyof typeof heroOptions] : undefined;
  const session = await verifyAppSession((await cookies()).get(APP_SESSION_COOKIE)?.value);
  return <div className={`${styles.page} ${sans.variable} ${serif.variable} ${mono.variable}`}><Landing heroImage={previewHero} entry={session ? appHomePath() : "/login"} signedIn={Boolean(session)} /></div>;
}
