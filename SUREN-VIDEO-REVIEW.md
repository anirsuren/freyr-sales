# Suren Video Review — Offerings Repository (requirement #1)

**Source:** `MicrosoftTeams-video.mp4` (received Jun 24). Duration **4:35.12**
(275.12 s), 1280×720, h264, AAC audio 48 kHz stereo.

**Extraction (done):**
- Decoded frame count: **6,599** (24 fps × 275 s — the math checks out).
- Extracted **6,602** frames at 24 fps (`/tmp/suren-review/frames_all`) = complete coverage.
- **275** one-per-second frames (`/tmp/suren-review/frames_1fps`) — the review set.
- Audio → `audio16k.wav` + `audio.mp3`; transcribed locally with faster-whisper
  (no API credits), word/segment timestamps → `transcript.txt` / `.json`.

**Method:** the transcript was synced second-by-second to the on-screen frames.
Suren talks while showing **two Excel sheets**. Relying on audio alone would have
missed the exact field names, the 9 customer-type definitions, and the China/Korea
markets — all of which are only fully legible **in the video frames** (Sheet 2,
~01:40, was never described in words). Both were used.

---

## Synced transcript ↔ screen

| Time | What Suren says (audio) | What's on screen (frames) |
|---|---|---|
| 00:04–00:14 | "Let's do the following. I'm going to open a sheet… look at the sheet." | Opens Excel "Digital Sales and Marketing" → **Sheet 1: Offerings** |
| 00:15–00:34 | "First thing: I need a **menu option**… you have agent, pipeline, customers on the left… I need something called **Offerings**." | Offerings sheet; left-nav reference is to *our* app |
| 00:35–00:46 | "Offerings will have **offering type, offering name, offering description, is the offering currently available**." | Sheet 1 columns A–E visible: Offering Type, Offering Name, Offering Description, Offering Current Availability, Offering Future Availability |
| 00:46–01:04 | "version one is available now… version three is available in **July 2026**." | Cell D5 = "V1 is available now", E5 = "V3 is available in Ju[ly]" |
| 01:06–01:30 | "this offering belongs to which **customer type** — pharmaceutical small, mid, large, biologics small/mid/large…" | Sheet 1 column group **Applicable Customer Types** with Y marks |
| 01:30–01:46 | "all these customer types — I have a **definition**… product, revenue, employees, focus. Not a final list, add more." | **Sheet 2: Customer Type definitions** (Customer type / Product Type / Revenue / Employees / Operational Focus) |
| 02:00–02:12 | "offering applicable to which **customer markets** — US, Europe, China, Korea…" | Sheet 1 group **Applicable Customer Markets**: USA, Europe, Japan, China, Korea |
| 02:12–02:41 | "add **YouTube video links**… **sales presentations**… **white papers / thought leadership**… **pricing documents**." | Sheet 1 group **Sales Materials**: Videos, Sales Presentations, Whitepaper and Thought Leadership, Pricing |
| 02:41–02:59 | "this becomes a **repository of all Freyr's offerings**." | Sheet 1 full |
| 02:59–03:21 | "a **user-entry screen** to enter offerings, **visually see** them, **filter** — e.g. pharmaceutical large + Europe." | Sheet 1 |
| 03:21–03:40 | "click a **video link**, add sales presentations / white papers / pricing — sales material artifacts." | Sheet 1 |
| 03:40–04:12 | "offerings entry + offerings visualization + **definition for customer types** (add + connect to offerings, one or more) + the **markets** I provide." | Sheets 1 & 2 |
| 04:13–04:35 | "first requirement, I want to **roll this out** — someone enters data, someone maintains it. Then the next function." | — |

---

## Exact schema (read from the frames)

### Sheet 1 — Offerings
1. **Offering Type** (e.g. "Freyr Module", "Freyr – Module + Agent", "Freyr Platform", "Freyr AI Native Service")
2. **Offering Name** (e.g. "Freyr Register", "Freyr GRR – MPR-PAC + Via Agent", "Agentic Workbench", "Omni Object")
3. **Offering Description**
4. **Offering Current Availability** (e.g. "V1 is available now")
5. **Offering Future Availability** (e.g. "V3 is available in July 2026")
6. **Applicable Customer Types** (Y per type — 9 types below)
7. **Applicable Customer Markets** (Y per market): **USA, Europe, Japan, China, Korea**
8. **Sales Materials**: **Videos** (YouTube links), **Sales Presentations**, **Whitepaper and Thought Leadership**, **Pricing**

### Sheet 2 — Customer Types (9), each with a definition
Columns: **Customer type · Product Type · Revenue · Employees · Operational Focus**

| Customer type | Product Type | Revenue | Employees | Operational Focus |
|---|---|---|---|---|
| Pharmaceutical – Small | Small-molecule drugs from chemical synthesis (e.g. aspirin, ibuprofen) | Under $500M | < 500 | R&D/discovery; often single-asset / niche-pipeline |
| Pharmaceutical – Mid size | " | $500M – $5B | 500 – 5,000 | Growing pipeline; 1–2 commercial products; mid-market |
| Pharmaceutical – Large | " | $5B+ | 5,000+ | Global footprint; massive R&D; complex manufacturing |
| Biologics – Small | Large-molecule products from living organisms (vaccines, antibodies, cell & gene) | Under $500M | < 500 | R&D/discovery; single-asset / niche |
| Biologics – Mid size | " | $500M – $5B | 500 – 5,000 | Growing pipeline; 1–2 commercial; mid-market |
| Biologics – Large | " | $5B+ | 5,000+ | Global footprint; massive R&D; complex manufacturing |
| Bio Pharmaceutical – Small | Hybrid: both chemical synthesis and biotech platforms | Under $500M | < 500 | R&D/discovery; single-asset / niche |
| Biopharmaceutical – Mid size | " | $500M – $5B | 500 – 5,000 | Growing pipeline; 1–2 commercial; mid-market |
| Biopharmaceutical – Large | " | $5B+ | 5,000+ | Global footprint; massive R&D; complex manufacturing |

### Markets (5)
USA · Europe · Japan · China · Korea

---

## The changes to make (complete list)

1. **New left-nav item "Offerings"** (with Agent, Pipeline, Customers, …).
2. **Offerings visualization** — view all offerings as cards, with the key fields visible.
3. **Filtering** — filter the offerings view by **customer type** and by **market** (e.g. "Pharmaceutical – Large" + "Europe").
4. **Offering detail** — open an offering to see everything, including clickable **sales material artifacts** (video/YouTube links, sales presentations, white papers / thought leadership, pricing).
5. **Offerings entry screen** — a form to create an offering: type, name, description, current availability, future availability, applicable customer types (multi-select), applicable markets (multi-select), and sales materials (add video/presentation/whitepaper/pricing links).
6. **Customer Types management** — list the customer types **with their definitions** (product type, revenue, employees, operational focus); **add more** types; types are then selectable on offerings (one or more).
7. **Markets** — the set of markets is provided/manageable and selectable on offerings.
8. Seed everything with the **real data from the sheets** (9 customer types + definitions, 5 markets, the sample offerings) so it's a working repository on day one.
9. Built so it can be **rolled out**: clean entry + maintenance screens.

> Scope note: this is requirement #1. Suren said the next function comes after this one is approved.

---

## Reconciliation with the downloaded Excel (`Digital Sales and Marketing.xlsx`)

After building from the (low-quality) video frames, Suren shared the actual file.
Corrections applied to the seed so it matches his data verbatim:

- **Brand is "Freya", not "Freyr"** on the offerings (Freya Register, Freya GRI,
  Freya Label, Freya Platform, …). One row is literally "Freyr AI Native Service".
  ⚠️ **Open question for Suren:** is "Freya" intended, or a typo for "Freyr"
  (the company)? Seeded exactly as written; say the word and I'll switch them.
- Misreads fixed: **Pia** (not Pic), **GRI** (not GRR) on the Freya GRI + chat
  rows, **MDV-PAC** (not MEM-PAC), "Via **Agents**" (plural).
- Descriptions for of-004 / of-011 / of-012 now match his wording exactly.
- **Customer-type Y-matrix** now mirrors the file: only 3 offerings are mapped
  (Freya Register + Pia, Mia and Via Agents; Freya GRI + Freya chat; Freya GRI +
  Freya chat + RIA agent + Workflow) — all 9 types each. The other 11 are blank
  in his sheet (to be filled via the entry screen).

Differences kept on purpose (file is an earlier trim; video + audio are richer):
- **Availability** kept as two fields (Current + Future) — the video showed two
  columns and Suren's audio explicitly said "available now" vs "available July
  2026". The downloaded file has a single "Offering Availability" column.
  ⚠️ Tell me if you want it collapsed to one.
- **Markets** (USA/Europe/Japan/China/Korea) and **Sales Materials**
  (Videos / Presentations / Whitepapers / Pricing) are kept — they're in the
  video frames and the audio, but not in this downloaded snapshot. Per-offering
  market/material values on the 3 mapped rows are sample data.

The **Definition** sheet (9 customer types + product type / revenue / employees /
operational focus) matched the build exactly — no changes needed.
