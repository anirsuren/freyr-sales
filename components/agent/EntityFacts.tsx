"use client";
import { CalendarDays, MapPin, Mail, Folder, Link2, HardDrive, Hash, Coins, CircleDot, GitBranch, Briefcase, Building2, Layers, Target, Flag, Newspaper, ShieldCheck, Tag, FileText, File, Presentation, Video, Music, Sheet, Image as ImageIcon, FileArchive, Package, Swords } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import type { EntityFact, EntityFactKind } from "@/lib/agentEntityVisuals";
import { DIVISIONS, DIVISION_META, DOCUMENT_TYPE_META, type Division } from "@/lib/offeringMaterials";
import { tint } from "@/lib/tint";
import { AttributeTag } from "@/components/ui/AttributeTag";
import { IndustryTag } from "@/components/ui/IndustryTag";

export function fileFormatIcon(fileType?: string) {
  const type = fileType?.toUpperCase();
  if (type === "ARTICLE") return Newspaper;
  if (type === "LINK") return Link2;
  if (["PDF", "DOC", "DOCX", "TXT", "RTF", "ODT"].includes(type || "")) return FileText;
  if (["PPT", "PPTX", "ODP", "KEY"].includes(type || "")) return Presentation;
  if (["MP4", "MOV", "WEBM", "AVI", "M4V"].includes(type || "")) return Video;
  if (["MP3", "WAV", "M4A", "OGG", "FLAC"].includes(type || "")) return Music;
  if (["XLS", "XLSX", "CSV", "ODS"].includes(type || "")) return Sheet;
  if (["PNG", "JPG", "JPEG", "WEBP", "GIF", "SVG"].includes(type || "")) return ImageIcon;
  if (["ZIP", "RAR", "7Z", "TAR", "GZ"].includes(type || "")) return FileArchive;
  return File;
}
const icons = {
  offering: Package, location: MapPin, date: CalendarDays, email: Mail, folder: Folder, link: Link2,
  size: HardDrive, value: Coins, reference: Hash, status: CircleDot, version: GitBranch,
  type: Layers, role: Briefcase, industry: Building2, features: Layers, target: Target,
  priority: Flag, source: Newspaper, verification: ShieldCheck, text: Tag,
} as const;
const fieldLabels: Partial<Record<EntityFactKind, string>> = {
  owner: "Owner", uploader: "Added by", location: "Location", date: "Date", email: "Email", size: "File size",
  format: "Format", folder: "Folder", link: "Website", value: "Value", reference: "Reference",
  role: "Role", industry: "Industry", source: "Source", status: "Status",
};
/** Supporting identities use the same uploaded portraits and logos as primary rows.
 * Spans only: these live inside an option button, never nested controls. */
export function EntityFactView({ fact, badge = false }: { fact: EntityFact; badge?: boolean }) {
  if (fact.kind === "division" && DIVISIONS.includes(fact.text as Division)) {
    const meta = DIVISION_META[fact.text as Division];
    const DivisionIcon = meta.icon;
    return <span data-fact-kind="division" title={meta.label} className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em]" style={{ color: meta.color, background: tint(meta.color, 10) }}><DivisionIcon size={10} strokeWidth={2.4} />{meta.short}</span>;
  }
  if (fact.kind === "industry") return <span data-fact-kind={fact.kind}><IndustryTag industry={fact.text} size="sm" /></span>;
  if (badge && ["type", "role"].includes(fact.kind)) {
    const documentType = fact.kind === "type" ? Object.values(DOCUMENT_TYPE_META).find((meta) => meta.label === fact.text) : undefined;
    const Icon = fact.text === "Competitor" ? Swords : fact.text === "Customer" ? Building2 : icons[fact.kind as keyof typeof icons] || Tag;
    return <span data-fact-kind={fact.kind}><AttributeTag value={fact.text} icon={Icon} color={documentType?.color} label={fieldLabels[fact.kind]} className="px-1.5 py-0.5 text-[10px]" /></span>;
  }
  const Icon = fact.kind === "format" ? fileFormatIcon(fact.text) : icons[fact.kind as keyof typeof icons] || Tag;
  const identity = ["person", "owner", "uploader", "company"].includes(fact.kind);
  return <span data-fact-kind={fact.kind} title={`${fieldLabels[fact.kind] ? `${fieldLabels[fact.kind]}: ` : ""}${fact.text}`} className={`inline-flex max-w-full items-center gap-1 ${badge ? "rounded px-1.5 py-0.5 bg-[var(--white)] border border-border" : ""} ${fact.kind === "format" ? "font-semibold text-text-primary" : ""}`}>
    {fact.kind === "company" ? <CompanyLogo name={fact.text} src={fact.logoUrl} className="w-4 h-4 text-[7px] shrink-0" /> :
      identity ? <Avatar name={fact.text} src={fact.logoUrl} className="w-4 h-4 text-[7px] shrink-0" /> :
        <Icon size={12} strokeWidth={1.8} className="shrink-0 text-text-tertiary" aria-hidden="true" />}
    <span className="min-w-0 break-words">{["owner", "uploader"].includes(fact.kind) && <span className="text-text-tertiary">{fieldLabels[fact.kind]}: </span>}{fact.text}</span>
  </span>;
}
