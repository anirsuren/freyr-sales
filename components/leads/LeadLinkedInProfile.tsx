"use client";

import { useState } from "react";
import { Award, BriefcaseBusiness, Building2, ExternalLink, GraduationCap, MapPin, MessageCircle, RefreshCw, Repeat2, ThumbsUp, Users } from "lucide-react";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";
import { Modal } from "@/components/ui/Modal";
import type { Lead, LeadLinkedInProfile } from "@/lib/leadsShared";

function day(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-border-light bg-white p-4">
    <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">{title}</h3>
    {children}
  </section>;
}

function ProfileDetails({ profile, url }: { profile: LeadLinkedInProfile; url: string }) {
  const [aboutExpanded, setAboutExpanded] = useState(false);
  return <div className="space-y-4">
    <div className="rounded-xl border border-blue-subtle bg-blue-light/40 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[20px] font-semibold text-text-primary">{profile.fullName}</p>
          {profile.headline && <p className="mt-1 text-[14px] leading-relaxed text-text-secondary">{profile.headline}</p>}
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-blue-subtle bg-white px-3 py-2 text-[12px] font-semibold text-blue-primary hover:bg-blue-light">
          Open LinkedIn <ExternalLink size={13} />
        </a>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-text-secondary">
        {profile.location && <span className="inline-flex items-center gap-1"><MapPin size={13} />{profile.location}</span>}
        {profile.currentCompany && <span className="inline-flex items-center gap-1"><Building2 size={13} />{profile.currentCompany}</span>}
        {profile.followerCount !== undefined && <span>{profile.followerCount.toLocaleString()} followers</span>}
        {profile.connectionCount !== undefined && <span>{profile.connectionCount.toLocaleString()} connections</span>}
      </div>
      <p className="mt-3 text-[11px] text-text-tertiary">Public profile snapshot{day(profile.fetchedAt) ? ` · checked ${day(profile.fetchedAt)}` : ""}. Details can change on LinkedIn.</p>
    </div>

    {profile.about && <Section title="About">
      <p className={`whitespace-pre-wrap text-[13px] leading-6 text-text-secondary ${aboutExpanded ? "" : "line-clamp-5"}`}>{profile.about}</p>
      {profile.about.length > 420 && <button type="button" onClick={() => setAboutExpanded((value) => !value)} className="mt-2 text-[12px] font-semibold text-blue-primary hover:underline">{aboutExpanded ? "Show less" : "Read full bio"}</button>}
    </Section>}

    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
      {profile.experience.length > 0 && <Section title={`Experience · ${profile.experience.length}`}>
        <div className="space-y-4">{profile.experience.map((item, index) => <div key={`${item.title}-${item.company}-${index}`} className="flex gap-3 border-b border-border-light pb-4 last:border-0 last:pb-0">
          <BriefcaseBusiness size={16} className="mt-0.5 shrink-0 text-blue-primary" />
          <div className="min-w-0"><p className="text-[13px] font-semibold text-text-primary">{item.title || item.company}</p>
            {item.title && item.company && <p className="text-[12px] text-text-secondary">{item.company}</p>}
            {item.duration && <p className="mt-0.5 text-[11px] text-text-tertiary">{item.duration}</p>}
            {item.description && <p className="mt-2 text-[12px] leading-5 text-text-secondary">{item.description}</p>}
          </div>
        </div>)}</div>
      </Section>}
      <div className="space-y-4">
        {profile.education.length > 0 && <Section title={`Education · ${profile.education.length}`}>
          <div className="space-y-3">{profile.education.map((item, index) => <div key={`${item.school}-${index}`} className="flex gap-3 border-b border-border-light pb-3 last:border-0 last:pb-0">
            <GraduationCap size={16} className="mt-0.5 shrink-0 text-blue-primary" />
            <div><p className="text-[13px] font-semibold text-text-primary">{item.school || item.degree}</p>
              {item.school && item.degree && <p className="text-[12px] text-text-secondary">{item.degree}</p>}
              {item.fieldOfStudy && <p className="text-[12px] text-text-secondary">{item.fieldOfStudy}</p>}
              {item.duration && <p className="text-[11px] text-text-tertiary">{item.duration}</p>}
            </div>
          </div>)}</div>
        </Section>}
        {(profile.honors?.length ?? 0) > 0 && <Section title="Honors"><div className="space-y-3">{profile.honors?.map((item, index) => <div key={`${item.title}-${index}`} className="flex gap-3"><Award size={16} className="mt-0.5 shrink-0 text-blue-primary" /><div><p className="text-[13px] font-semibold text-text-primary">{item.title}</p>{item.subtitle && <p className="text-[12px] text-text-secondary">{item.subtitle}</p>}</div></div>)}</div></Section>}
        {(profile.organizations?.length ?? 0) > 0 && <Section title="Organizations"><div className="space-y-3">{profile.organizations?.map((item, index) => <div key={`${item.title}-${index}`} className="flex gap-3"><Users size={16} className="mt-0.5 shrink-0 text-blue-primary" /><div><p className="text-[13px] font-semibold text-text-primary">{item.title}</p>{item.subtitle && <p className="text-[12px] text-text-secondary">{item.subtitle}</p>}</div></div>)}</div></Section>}
      </div>
    </div>

    {profile.skills.length > 0 && <Section title={`Skills · ${profile.skills.length}`}><div className="flex flex-wrap gap-1.5">{profile.skills.map((skill, index) => <span key={`${skill}-${index}`} className="rounded-full border border-border-light bg-surface px-2.5 py-1 text-[11px] font-medium text-text-secondary">{skill}</span>)}</div></Section>}

    <Section title={`Recent public posts · ${profile.recentPosts.length}`}>
      {profile.recentPosts.length === 0 ? <p className="text-[13px] text-text-secondary">No authored public posts were returned for this profile.</p> :
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{profile.recentPosts.map((post, index) => <article key={`${post.url}-${index}`} className="rounded-lg border border-border-light bg-surface p-3.5">
          {(day(post.date) || post.type) && <div className="flex items-center justify-between gap-2 text-[11px] text-text-tertiary">{day(post.date) && <span>{day(post.date)}</span>}{post.type && <span className="capitalize">{post.type.replace(/_/g, " ")}</span>}</div>}
          <p className="mt-2 whitespace-pre-wrap text-[12.5px] leading-5 text-text-primary">{post.text.length > 280 ? `${post.text.slice(0, 280)}…` : post.text}</p>
          {post.text.length > 280 && <details className="mt-1 text-[12px] text-text-secondary"><summary className="cursor-pointer font-semibold text-blue-primary">Read full post</summary><p className="mt-2 whitespace-pre-wrap leading-5">{post.text}</p></details>}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-text-tertiary">
            {post.reactions !== undefined && <span className="inline-flex items-center gap-1"><ThumbsUp size={12} />{post.reactions.toLocaleString()}</span>}
            {post.comments !== undefined && <span className="inline-flex items-center gap-1"><MessageCircle size={12} />{post.comments.toLocaleString()}</span>}
            {post.reposts !== undefined && <span className="inline-flex items-center gap-1"><Repeat2 size={12} />{post.reposts.toLocaleString()}</span>}
            <a href={post.url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 font-semibold text-blue-primary hover:underline">Original post <ExternalLink size={12} /></a>
          </div>
        </article>)}</div>}
    </Section>
  </div>;
}

export function LeadLinkedInProfile({ lead, refreshing, canWrite, onRefresh }: { lead: Lead; refreshing: boolean; canWrite: boolean; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  if (!lead.linkedinUrl) return null;
  const profile = lead.linkedinProfile;
  return <>
    <div className="mt-4 rounded-xl border border-border-light bg-surface p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-light text-blue-primary"><LinkedInIcon size={17} /></span>
          <div className="min-w-0"><p className="text-[12.5px] font-semibold text-text-primary">LinkedIn profile</p>
            <p role={refreshing ? "status" : undefined} className="text-[11px] text-text-tertiary">{refreshing ? "Getting public profile details. This may take a moment…" : profile ? `Checked ${day(profile.fetchedAt) || "recently"}` : lead.linkedinStatus === "unavailable" ? "Profile details unavailable. You can retry." : "Profile details not loaded yet"}</p>
          </div>
        </div>
        {canWrite && <button type="button" disabled={refreshing} onClick={(event) => { event.stopPropagation(); onRefresh(); }} className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-primary disabled:opacity-50"><RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />{profile ? "Refresh" : "Retry"}</button>}
      </div>
      {profile && <div className="mt-3 border-t border-border-light pt-3">
        {profile.headline && <p className="line-clamp-2 text-[12.5px] font-semibold leading-5 text-text-primary">{profile.headline}</p>}
        {profile.location && <p className="mt-1 truncate text-[11.5px] text-text-secondary">{profile.location}</p>}
        <p className="mt-2 text-[11px] text-text-tertiary">{[profile.experience.length ? `${profile.experience.length} roles` : "", profile.education.length ? `${profile.education.length} schools` : "", profile.recentPosts.length ? `${profile.recentPosts.length} posts` : ""].filter(Boolean).join(" · ")}</p>
        <button type="button" onClick={(event) => { event.stopPropagation(); setOpen(true); }} className="mt-2 text-[12px] font-semibold text-blue-primary hover:underline">View full profile and posts →</button>
      </div>}
    </div>
    <Modal open={open} onClose={() => setOpen(false)} title={`${lead.name} · LinkedIn`} size="workflow">
      {profile && <ProfileDetails profile={profile} url={lead.linkedinUrl} />}
    </Modal>
  </>;
}
