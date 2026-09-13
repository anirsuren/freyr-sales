# Market Intel — full catalogue audit, September 11, 2026

## Result and scope

Audited all **193 companies: 34 customers and 159 competitors**. This is a source-availability and flow audit, not a claim that every article or every LinkedIn post has been collected. Historical feed contents were not bulk replaced with audit results. Code changes are local, not deployed. Verified catalogue link corrections were applied to the shared database.

- Live free-source sweep: all 193 entries, using configured domains and news searches.
- Paid fallback sweep: all 193 evaluated; only eligible unresolved/sparse websites called Perplexity. Recorded cost **$0.68828**; 63 companies returned fallback website updates.
- Rechecked 102 catalogue sites after improvements, plus Sitero and Veranex outside the catalogue.
- Chrome: all 68 originally configured LinkedIn pages, replacement candidates, and 65 additional official-footer candidates were inspected. One candidate (Maven) was not attached because the business identity needs further resolution.
- Applied 64 missing LinkedIn links, corrected 14 existing LinkedIn links, corrected CuraTeQ's website, and corrected Gideon to Gedeon Richter. **132** now have a LinkedIn link; **61** do not.
- Existing people and catalogue metadata/selections were checked unchanged against the initial snapshot. No audit companies were added to the real catalogue.

## What changed

1. Manage pages remain full pages with Save/Discard; Track remains a modal. Header alignment, single-line source labels and rep/admin visibility follow the prior handoff.
2. Adding a company displays real streamed stages: identify → collect sources → prepare briefing → save. There is no fabricated percentage. Duplicate checks disable Start Tracking before collection and reject duplicates on the server.
3. Website identity handles structured organization metadata and acronym domains. Website/LinkedIn/name conflicts are rejected. A no-post LinkedIn page can be accepted only when the official website explicitly links to it.
4. Official-site discovery follows another level of newsroom links and additional explicit publication-date markup. Articles require real dates and source URLs. Matching headlines at different publishers are retained.
5. LinkedIn collection pages beyond the first response, stops at existing coverage/retention/exhaustion, flags limits or repeated pages, and preserves prior pages on a later-page failure. Routine checks start with five posts to limit spending; new collections use 20 per page.
6. Removed global feed-timestamp gating: each company's news/site/LinkedIn timestamp controls freshness. News and website work have separate time budgets so they cannot consume an entire run before LinkedIn begins. Sources without an Apify token can still use free website/news collection.
7. If initial briefing persistence fails, the unchanged newly inserted catalogue record is removed with a conditional write so retry is possible. If the briefing did save but metadata failed, it is reported as saved with a warning. Uncertain writes are reported explicitly.

## Validation and its limits

- TypeScript check and focused lint passed.
- 21 isolated checks cover duplicates, persistence/retry, selection merging, cadence, source/date filtering, spend reservations/cache, identity conflicts, streaming errors, pagination, partial failures and pinned old posts.
- Replayed all 193 existing entries through add validation against an isolated in-memory store: duplicates/absent sources triggered no collection and no writes. This is not 193 real paid onboarding runs.
- Desktop/mobile UI test intercepted all writes: loading, duplicate-disabled button, success, warning, error and field preservation passed. Screenshots are in the local audit folder.
- Actual LinkedIn actor: GSK pages 1/2 returned 20/20; Rimsys returned 20/9. Page two had zero URLs repeated from page one. 69 returned items, estimated cost **$0.345** at $0.005/item. Some are older than the app's 90-day retention and correctly would not be retained.
- Direct website results after recheck: **88** companies with dated updates (initially 82). Direct plus paid fallback: **135** with at least one official update. Initial external-news queries returned qualifying results for **102** companies. Zero is not proof that no news exists.
- Sitero: six official updates and four external-news results; Veranex: 13 official updates and zero qualifying results in that external-news query. Neither was added. Both representative article URLs were opened in Chrome. Sitero has an inconsistency on its own event page: the headline says SCDM, while the URL/title/structured article metadata say SCOPE Europe; the collector preserved the source metadata rather than inventing a correction.

## Open coverage limitations

- **Amplexor, Sparta Systems and DDi**: original LinkedIn pages unavailable; DDi's alternative also unavailable. Do not silently substitute an acquirer's/general parent feed.
- 61 entries still have no LinkedIn link, including deliberately scoped product/parent-company entries. An official website alone does not establish a matching LinkedIn identity.
- Some official websites return 403, redirects to a different corporate domain, JavaScript shells or nonstandard/PDF releases. General discovery is bounded; it is not an exhaustive archive crawler. Zydus's dated PDF news archive is one known format gap.
- LinkedIn is bounded to 90 days and up to 100 items per collection. Public visibility, deleted/restricted posts and provider availability prevent a universal all-posts guarantee.
- News search is English/US oriented and provider result-limited. It cannot prove coverage of every outlet, paywall or language.
- Shared Perplexity cap defaults to $1/day; cache is 24 hours. Apify's existing run/day caps can delay companies in the oldest-first queue. Local safeguards are not active in deployed old code until deployment.
- Prior image audit: 189/193 company logos and 90/133 stored people photos; unavailable/ambiguous images are not invented. This turn did not claim to recover the remaining images.

## Unverified imported identities

Following the user's direction, keep unresolved records without invented domains or logos.

| Import | Finding | Action |
|---|---|---|
| Integras | Historical pharma-labeling company appears in a [2014 organizer announcement](https://www.prweb.com/releases/trends_best_practices_in_global_drug_product_labeling_management_taking_control_of_the_end_to_end_labeling_process_new_webinar_hosted_by_xtalks/prweb11892203.htm). A current official identity/domain was not established. | Unverified current source. |
| Cure Media | [CURE Media Group](https://www.curetoday.com/faq) fits US healthcare communications, while [Cure Media](https://www.curemedia.com/) is a different agency. Imported US/MPR context favors the former, but does not conclusively identify it. | Candidate documented; no automatic attachment. |
| Lavida Consultancy | Cosmetics import; similarly named pharma, finance and consumer-brand businesses do not establish this consultancy's identity. | Unverified. |
| FDS Basics | No verified exact company. [FDA Basics](https://www.fdabasics.com/responsibilities-of-an-fda-us-agent/) is a plausible spelling candidate in regulatory services, but the import does not establish equivalence. | Unverified; no silent rename. |

## Per-company findings

Counts are audit results, not the current number of saved feed cards. D = direct official updates after recheck; F = paid fallback official updates; N = initial filtered external-news results. Unavailable/missing differs from a successful read with no qualifying updates.

| Company | Group | Website | D | F | N | LinkedIn |
|---|---|---|---:|---:|---:|---|
| Accenture | competitor | [accenture.com](https://accenture.com) | 2 | 8 | 82 | [Configured](https://www.linkedin.com/company/accenture) |
| Amplexor | competitor | [amplexor.com](https://amplexor.com) | Blocked/unreadable | 0 | 0 | Unavailable page |
| Andaman Medical | competitor | [andamanmed.com](https://andamanmed.com) | 10 | — | 1 | [Configured](https://www.linkedin.com/company/andaman-medical) |
| APCER Life Sciences | competitor | [apcerls.com](https://apcerls.com) | 0 | 0 | 2 | Not verified/configured |
| Arazy Group | competitor | [arazygroup.com](https://arazygroup.com) | Blocked/unreadable | 1 | 0 | [Configured](https://www.linkedin.com/company/arazy-group) |
| Arbor Scientia | competitor | [arborscientiagroup.com](https://arborscientiagroup.com) | 0 | 0 | 0 | Not verified/configured |
| ArisGlobal | competitor | [arisglobal.com](https://arisglobal.com) | 15 | — | 29 | [Configured](https://www.linkedin.com/company/aris-global) |
| Asia Actual | competitor | [asiaactual.com](https://asiaactual.com) | 18 | — | 0 | Not verified/configured |
| Averitas Pharma | competitor | [averitaspharma.com](https://averitaspharma.com) | 0 | 0 | 0 | Not verified/configured |
| Biorius | competitor | [biorius.com](https://biorius.com) | 2 | 0 | 0 | Not verified/configured |
| Cactus | competitor | [cactusglobal.com](https://cactusglobal.com) | 1 | 8 | 62 | [Configured](https://www.linkedin.com/company/cactus-communications) |
| Calyx | competitor | [calyx.ai](https://calyx.ai) | Blocked/unreadable | 0 | 0 | [Configured](https://www.linkedin.com/company/calyx) |
| Capgemini | competitor | [capgemini.com](https://capgemini.com) | 24 | — | 73 | [Configured](https://www.linkedin.com/company/capgemini) |
| CAST Pharma | competitor | [cast-pharma.com](https://cast-pharma.com) | 1 | 0 | 0 | Not verified/configured |
| Catalent | competitor | [catalent.com](https://catalent.com) | 7 | — | 25 | [Configured](https://www.linkedin.com/company/162912) |
| CEHTRA | competitor | [cehtra.com](https://cehtra.com) | 20 | — | 0 | [Configured](https://www.linkedin.com/company/cehtra) |
| Cekindo | competitor | [cekindo.com](https://cekindo.com) | 16 | — | 0 | [Configured](https://www.linkedin.com/company/incorp-idvn) |
| Celegence | competitor | [celegence.com](https://celegence.com) | 11 | — | 0 | [Configured](https://www.linkedin.com/company/celegence) |
| Certara | competitor | [certara.com](https://certara.com) | 16 | — | 24 | [Configured](https://www.linkedin.com/company/certara) |
| Charter Global | competitor | [charterglobal.com](https://charterglobal.com) | 0 | 3 | 1 | [Configured](https://www.linkedin.com/company/charterglobalcg) |
| ChemLinked | competitor | [chemlinked.com](https://chemlinked.com) | 0 | 1 | 0 | Not verified/configured |
| ChemReach | competitor | [www.chemreachreg.com](https://www.chemreachreg.com) | 0 | 0 | 0 | Not verified/configured |
| China Med Device | competitor | [chinameddevice.com](https://chinameddevice.com) | 10 | — | 0 | [Configured](https://www.linkedin.com/company/5098507) |
| CIRS | competitor | [cirs-group.com](https://cirs-group.com) | 8 | — | 1 | [Configured](https://www.linkedin.com/company/chemical-inspection-and-regulation-service-limited) |
| ClinChoice | competitor | [clinchoice.com](https://clinchoice.com) | 0 | 0 | 0 | Not verified/configured |
| CliniExperts | competitor | [cliniexperts.com](https://cliniexperts.com) | 0 | 8 | 0 | Not verified/configured |
| Cognizant Life Sciences | competitor | [cognizant.com](https://cognizant.com) | 0 | 1 | 0 | Not verified/configured |
| Confinis | competitor | [confinis.com](https://confinis.com) | 0 | 0 | 0 | [Configured](https://www.linkedin.com/company/confinis) |
| Cortellis | competitor | Unverified | — | — | 2 | Not verified/configured |
| Criterion Edge | competitor | [criterionedge.com](https://criterionedge.com) | 3 | — | 0 | [Configured](https://www.linkedin.com/company/criterion-edge) |
| Cure Media | competitor | Unverified | — | — | 0 | Not verified/configured |
| DDi | competitor | Unverified | — | — | 2 | Unavailable page |
| Deloitte | competitor | [deloitte.com](https://deloitte.com) | 5 | — | 48 | [Configured](https://www.linkedin.com/company/deloitte) |
| Di Renzo Regulatory Affairs | competitor | [direnzo.biz](https://direnzo.biz) | 5 | — | 0 | [Configured](https://www.linkedin.com/company/di-renzo-regulatory-affairs) |
| Dita Exchange | competitor | [ditaexchange.com](https://ditaexchange.com) | 3 | — | 1 | [Configured](https://www.linkedin.com/company/dita-exchange-aps) |
| Dr. Evidence | competitor | [drevidence.com](https://drevidence.com) | 0 | 0 | 0 | Not verified/configured |
| DXC Technology | competitor | [dxc.com](https://dxc.com) | 0 | 2 | 4 | [Configured](https://www.linkedin.com/company/dxctechnology) |
| E-mergeTech | competitor | [e-mergeglobal.com](https://e-mergeglobal.com) | 0 | 0 | 0 | Not verified/configured |
| EAS Consulting Group | competitor | [easconsultinggroup.com](https://easconsultinggroup.com) | 11 | — | 0 | Not verified/configured |
| Easy Medical Device | competitor | [easymedicaldevice.com](https://easymedicaldevice.com) | 0 | 8 | 0 | [Configured](https://www.linkedin.com/company/easymedicaldevice) |
| EcoMundo | competitor | [ecomundo.eu](https://ecomundo.eu) | 0 | 0 | 0 | Not verified/configured |
| Element | competitor | [element.com](https://element.com) | 7 | — | 83 | [Configured](https://www.linkedin.com/company/element-materials-technology) |
| Elexes | competitor | [elexes.com](https://elexes.com) | 8 | — | 0 | [Configured](https://www.linkedin.com/company/elexes) |
| Emergo by UL | competitor | [emergobyul.com](https://emergobyul.com) | 15 | 4 | 0 | [Configured](https://www.linkedin.com/company/emergobyul) |
| Enago Life Sciences | competitor | [lifesciences.enago.com](https://lifesciences.enago.com) | 4 | — | 0 | Not verified/configured |
| Ennov | competitor | [ennov.com](https://ennov.com) | 12 | — | 1 | [Configured](https://www.linkedin.com/company/ennov) |
| ERM | competitor | [erm.com](https://erm.com) | 0 | 2 | 6 | [Configured](https://www.linkedin.com/company/erm) |
| Esko | competitor | [esko.com](https://esko.com) | 0 | 1 | 4 | [Configured](https://www.linkedin.com/company/esko) |
| Evalueserve | competitor | [evalueserve.com](https://evalueserve.com) | 10 | — | 6 | Not verified/configured |
| Evoke Group | competitor | [inizioevoke.com](https://inizioevoke.com) | 0 | 0 | 1 | [Configured](https://www.linkedin.com/company/inizioevoke) |
| EXTEDO | competitor | [extedo.com](https://extedo.com) | 7 | — | 0 | [Configured](https://www.linkedin.com/company/extedo) |
| FDS Basics | competitor | Unverified | — | — | 0 | Not verified/configured |
| Fortrea | competitor | [fortrea.com](https://fortrea.com) | 6 | — | 58 | [Configured](https://www.linkedin.com/company/92920359) |
| Generis | competitor | [generiscorp.com](https://generiscorp.com) | 0 | 1 | 0 | [Configured](https://www.linkedin.com/company/generis-enterprise-technology) |
| Genpact | competitor | [genpact.com](https://genpact.com) | 6 | 6 | 81 | [Configured](https://www.linkedin.com/company/210064) |
| Glemser Technologies | competitor | [glemser.com](https://glemser.com) | 1 | 1 | 0 | [Configured](https://www.linkedin.com/company/glemser-technologies) |
| Global Product Compliance | competitor | [gpcregulatory.com](https://gpcregulatory.com) | 0 | 0 | 2 | [Configured](https://www.linkedin.com/company/2738539) |
| Global Regulatory Partners | competitor | [globalregulatorypartners.com](https://globalregulatorypartners.com) | 10 | — | 3 | [Configured](https://www.linkedin.com/company/global-regulatory-partners-llc) |
| Greenlight Guru | competitor | [greenlight.guru](https://greenlight.guru) | 33 | — | 1 | [Configured](https://www.linkedin.com/company/greenlight-guru) |
| Havas Health & You | competitor | [havashealthandyou.com](https://havashealthandyou.com) | 0 | 0 | 2 | [Configured](https://www.linkedin.com/company/havashealthandyou) |
| HCL | competitor | [hcltech.com](https://hcltech.com) | 13 | 8 | 90 | [Configured](https://www.linkedin.com/company/hcl-technologies) |
| Hylobates Consulting | competitor | [hylobates.it](https://hylobates.it) | Blocked/unreadable | 0 | 0 | [Configured](https://www.linkedin.com/company/hylobates-consulting-srl) |
| I3C Global | competitor | [i3cglobal.com](https://i3cglobal.com) | 0 | 0 | 0 | [Configured](https://www.linkedin.com/company/i3cglobal) |
| i4i | competitor | Unverified | — | — | 0 | [Configured](https://www.linkedin.com/company/i4i) |
| ICON plc | competitor | [iconplc.com](https://iconplc.com) | 0 | 1 | 44 | [Configured](https://www.linkedin.com/company/icon-plc-2) |
| Indegene | competitor | [indegene.com](https://indegene.com) | 0 | 2 | 40 | Not verified/configured |
| Instem | competitor | [instem.com](https://instem.com) | 10 | — | 2 | [Configured](https://www.linkedin.com/company/instem) |
| Integras | competitor | Unverified | — | — | 0 | Not verified/configured |
| Intertek | competitor | [intertek.com](https://intertek.com) | 19 | — | 46 | [Configured](https://www.linkedin.com/company/intertek) |
| IQVIA | competitor | [iqvia.com](https://iqvia.com) | 0 | 2 | 61 | [Configured](https://www.linkedin.com/company/iqvia) |
| ISS AG | competitor | [iss-ag.ch](https://iss-ag.ch) | 0 | 0 | 0 | [Configured](https://www.linkedin.com/company/1012376) |
| Johner | competitor | [johner-institute.com](https://johner-institute.com) | 0 | 0 | 3 | [Configured](https://www.linkedin.com/company/johner-institut-gmbh) |
| Kallik | competitor | [kallik.com](https://kallik.com) | 0 | 0 | 1 | [Configured](https://www.linkedin.com/company/kallik-limited) |
| Kalypso | competitor | [kalypso.com](https://kalypso.com) | 1 | 0 | 0 | [Configured](https://www.linkedin.com/company/kalypso) |
| KPMG Life Sciences | competitor | [kpmg.com](https://kpmg.com) | 4 | — | 0 | Not verified/configured |
| Lachman Consultants | competitor | [lachmanconsultants.com](https://lachmanconsultants.com) | 23 | — | 0 | [Configured](https://www.linkedin.com/company/lachman-consulting-services-inc-) |
| Lavida Consultancy | competitor | Unverified | — | — | 0 | Not verified/configured |
| LFH Regulatory | competitor | [lfhregulatory.co.uk](https://lfhregulatory.co.uk) | 5 | — | 0 | [Configured](https://www.linkedin.com/company/lfh-regulatory-limited) |
| Linneus Consulting | competitor | [linneus.it](https://linneus.it) | 0 | 0 | 0 | [Configured](https://www.linkedin.com/company/linneus-consulting) |
| LMG Group | competitor | [fdahelp.us](https://fdahelp.us) | 0 | 3 | 0 | [Configured](https://www.linkedin.com/company/liberty-management-group-ltd) |
| LORENZ | competitor | [lorenz.cc](https://lorenz.cc) | 0 | 0 | 0 | [Configured](https://www.linkedin.com/company/478461) |
| Makrocare | competitor | [makrocare.com](https://makrocare.com) | 2 | 0 | 0 | Not verified/configured |
| ManageArtworks | competitor | [manageartworks.com](https://manageartworks.com) | 21 | — | 0 | [Configured](https://www.linkedin.com/company/manageartworks) |
| Mantra Systems | competitor | [mantrasystems.co.uk](https://mantrasystems.co.uk) | Blocked/unreadable | 0 | 2 | [Configured](https://www.linkedin.com/company/mantrasystems) |
| Maven Regulatory Solutions | competitor | [mavenrs.com](https://mavenrs.com) | 22 | — | 0 | Not verified/configured |
| MCRA | competitor | [mcra.com](https://mcra.com) | 0 | 0 | 1 | [Configured](https://www.linkedin.com/company/mcra) |
| MDSS | competitor | [mdss.com](https://mdss.com) | 8 | — | 1 | [Configured](https://www.linkedin.com/company/medicaldevicesafetyservice) |
| MEDIcept | competitor | [medicept.com](https://medicept.com) | 4 | — | 0 | [Configured](https://www.linkedin.com/company/medicept) |
| Medidee Services | competitor | [medidee.com](https://medidee.com) | 0 | 0 | 0 | Not verified/configured |
| Meditec Consulting | competitor | [www.meditec-consulting.de](https://www.meditec-consulting.de) | 0 | 0 | 0 | Not verified/configured |
| MedNet EC REP | competitor | [mednet-ecrep.com](https://mednet-ecrep.com) | 10 | — | 0 | [Configured](https://www.linkedin.com/company/mednet-ecrep) |
| Medpace | competitor | [medpace.com](https://medpace.com) | 8 | — | 57 | Not verified/configured |
| Medqtech | competitor | [medqtech.com](https://medqtech.com) | 0 | 0 | 0 | Not verified/configured |
| MedThink Communications | competitor | [medthink.com](https://medthink.com) | Blocked/unreadable | 0 | 0 | Not verified/configured |
| Michor Consulting | competitor | [michor-consulting.ch](https://michor-consulting.ch) | 0 | 0 | 0 | Not verified/configured |
| Morulaa Health | competitor | [morulaa.com](https://morulaa.com) | 0 | 3 | 0 | [Configured](https://www.linkedin.com/company/morulaa) |
| NAMSA | competitor | [namsa.com](https://namsa.com) | Blocked/unreadable | 1 | 0 | Not verified/configured |
| Navitas Life Sciences | competitor | [navitaslifesciences.com](https://navitaslifesciences.com) | 10 | 1 | 3 | [Configured](https://www.linkedin.com/company/navitas-life-sciences) |
| NSF | competitor | [nsf.org](https://nsf.org) | Blocked/unreadable | 3 | 8 | [Configured](https://www.linkedin.com/company/nsf-international) |
| Nutrasource | competitor | [nutrasource.ca](https://nutrasource.ca) | Blocked/unreadable | 2 | 0 | Not verified/configured |
| Obelis | competitor | [obelis.net](https://obelis.net) | 15 | — | 0 | [Configured](https://www.linkedin.com/company/obelis-s-a-) |
| OpenText | competitor | [opentext.com](https://opentext.com) | 20 | — | 0 | [Configured](https://www.linkedin.com/company/opentext) |
| Operon Strategist | competitor | [operonstrategist.com](https://operonstrategist.com) | 12 | — | 0 | Not verified/configured |
| Oracle | competitor | [oracle.com](https://oracle.com) | 0 | 4 | 25 | Not verified/configured |
| Orion Innovation | competitor | [orioninnovation.com](https://orioninnovation.com) | Blocked/unreadable | 0 | 3 | [Configured](https://www.linkedin.com/company/orioninnovation) |
| Pacific Bridge | competitor | [pacificbridgemedical.com](https://pacificbridgemedical.com) | 23 | — | 4 | [Configured](https://www.linkedin.com/company/pacific-bridge-medical) |
| Parexel | competitor | [parexel.com](https://parexel.com) | 2 | 8 | 13 | [Configured](https://www.linkedin.com/company/parexel) |
| Pearl Partners | competitor | [pearlpathways.com](https://pearlpathways.com) | 0 | 0 | 0 | Not verified/configured |
| Perigord | competitor | [perigord-as.com](https://perigord-as.com) | Blocked/unreadable | 0 | 0 | Not verified/configured |
| PharmaLex | competitor | [pharmalex.com](https://pharmalex.com) | 0 | 0 | 0 | [Configured](https://www.linkedin.com/company/5364074) |
| PharmaPendium | competitor | [pharmapendium.com](https://pharmapendium.com) | Blocked/unreadable | 0 | 0 | Not verified/configured |
| PharmEng | competitor | [pharmeng.com](https://pharmeng.com) | Blocked/unreadable | 0 | 0 | Not verified/configured |
| Phlexglobal | competitor | [phlexglobal.com](https://phlexglobal.com) | Blocked/unreadable | 4 | 0 | [Configured](https://www.linkedin.com/company/phlexglobaltmf) |
| PRA Consultancy | competitor | [pra-me.com](https://pra-me.com) | 2 | 4 | 0 | [Configured](https://www.linkedin.com/company/professionals-regulatory-affairs) |
| ProductLife Group | competitor | [productlifegroup.com](https://productlifegroup.com) | 0 | 2 | 0 | [Configured](https://www.linkedin.com/company/productlifegroup) |
| ProPharma Group | competitor | [propharmagroup.com](https://propharmagroup.com) | 2 | 1 | 1 | [Configured](https://www.linkedin.com/company/propharma-group) |
| QARA Consulting Group | competitor | [qaraconsultinggroup.com](https://qaraconsultinggroup.com) | 0 | 0 | 0 | Not verified/configured |
| Qserve | competitor | [qservegroup.com](https://qservegroup.com) | 11 | — | 0 | [Configured](https://www.linkedin.com/company/qserve-group) |
| Qtec Group | competitor | [qtec-group.com](https://qtec-group.com) | 5 | — | 0 | [Configured](https://www.linkedin.com/company/qtec-services-gmbh) |
| Qualio | competitor | [qualio.com](https://qualio.com) | 12 | — | 0 | [Configured](https://www.linkedin.com/company/qualiohq) |
| RACS | competitor | [racs-me.com](https://racs-me.com) | 0 | 0 | 6 | Not verified/configured |
| RAQAM | competitor | [raqam.com](https://raqam.com) | 2 | 0 | 0 | [Configured](https://www.linkedin.com/company/raqam-consultancy) |
| REACH24H | competitor | [en.reach24h.com](https://en.reach24h.com) | 0 | 2 | 0 | Not verified/configured |
| REACHLAW | competitor | [reachlaw.fi](https://reachlaw.fi) | 1 | 1 | 0 | [Configured](https://www.linkedin.com/company/reachlawltd) |
| Redica Systems | competitor | [redica.com](https://redica.com) | 2 | 1 | 0 | [Configured](https://www.linkedin.com/company/redicasystems) |
| Reed Tech | competitor | [reedtech.com](https://reedtech.com) | 0 | 0 | 4 | [Configured](https://www.linkedin.com/company/reed-tech) |
| RegASK | competitor | [regask.com](https://regask.com) | 0 | 4 | 3 | [Configured](https://www.linkedin.com/company/regask) |
| RegDesk | competitor | [regdesk.co](https://regdesk.co) | 20 | — | 0 | Not verified/configured |
| RegDocs365 | competitor | [regdocs365.com](https://regdocs365.com) | Blocked/unreadable | 0 | 0 | [Configured](https://www.linkedin.com/company/regdocs365) |
| Registrar Corp | competitor | [registrarcorp.com](https://registrarcorp.com) | 0 | 3 | 0 | Not verified/configured |
| Regulatory Compliance Associates | competitor | [rcainc.com](https://rcainc.com) | 0 | 1 | 0 | Not verified/configured |
| Rimsys | competitor | [rimsys.io](https://rimsys.io) | 4 | — | 1 | [Configured](https://www.linkedin.com/company/rimsys) |
| SAP | competitor | [sap.com](https://sap.com) | 32 | — | 17 | Not verified/configured |
| Schlafender Hase | competitor | [schlafender-hase.com](https://schlafender-hase.com) | Blocked/unreadable | 0 | 0 | [Configured](https://www.linkedin.com/company/schlafender-hase) |
| Select Hub | competitor | [selecthub.com](https://selecthub.com) | 0 | 0 | 1 | Not verified/configured |
| SGK | competitor | [sgkinc.com](https://sgkinc.com) | 0 | 0 | 3 | [Configured](https://www.linkedin.com/company/sgk) |
| SGS | competitor | [sgs.com](https://sgs.com) | 7 | — | 94 | Not verified/configured |
| SharePoint | competitor | Unverified | — | — | 68 | Not verified/configured |
| Siemens | competitor | [siemens.com](https://siemens.com) | 0 | 6 | 21 | Not verified/configured |
| Soterius | competitor | [soterius.com](https://soterius.com) | 0 | 0 | 0 | [Configured](https://www.linkedin.com/company/soterius) |
| Sparta Systems | competitor | [spartasystems.com](https://spartasystems.com) | 0 | 0 | 0 | Unavailable page |
| Steptoe & Johnson | competitor | [steptoe.com](https://steptoe.com) | Blocked/unreadable | 5 | 3 | Not verified/configured |
| SunFlare | competitor | [md.sunflare.com](https://md.sunflare.com) | 29 | — | 0 | Not verified/configured |
| Syneos Health | competitor | [syneoshealth.com](https://syneoshealth.com) | 0 | 6 | 12 | [Configured](https://www.linkedin.com/company/11408925) |
| Tata Elxsi | competitor | [tataelxsi.com](https://tataelxsi.com) | 2 | 2 | 93 | [Configured](https://www.linkedin.com/company/tataelxsi) |
| TCS | competitor | [tcs.com](https://tcs.com) | 13 | — | 5 | [Configured](https://www.linkedin.com/company/tata-consultancy-services) |
| The FDA Group | competitor | [thefdagroup.com](https://thefdagroup.com) | 23 | — | 1 | Not verified/configured |
| Thema | competitor | [thema-med.com](https://thema-med.com) | Blocked/unreadable | 1 | 10 | Not verified/configured |
| Thermo Fisher Scientific (PPD) | competitor | [ppd.com](https://ppd.com) | 0 | 1 | 1 | Not verified/configured |
| Trace One | competitor | [traceone.com](https://traceone.com) | 15 | — | 2 | [Configured](https://www.linkedin.com/company/trace-one) |
| Trilogy Writing and Consulting | competitor | [trilogywriting.com](https://trilogywriting.com) | 0 | 1 | 0 | Not verified/configured |
| TSG Group | competitor | [tsgconsulting.com](https://tsgconsulting.com) | 0 | 0 | 2 | Not verified/configured |
| TUV SUD | competitor | [tuvsud.com](https://tuvsud.com) | Blocked/unreadable | 7 | 0 | Not verified/configured |
| UL Solutions | competitor | [ul.com](https://ul.com) | 13 | 4 | 69 | [Configured](https://www.linkedin.com/company/ulsolutions) |
| Veeva | competitor | [veeva.com](https://veeva.com) | 6 | — | 83 | [Configured](https://www.linkedin.com/company/veeva-systems) |
| Voisin Consulting | competitor | [voisinconsulting.com](https://voisinconsulting.com) | 0 | 1 | 0 | [Configured](https://www.linkedin.com/company/voisin-consulting-life-sciences) |
| Windchill | competitor | Unverified | — | — | 20 | Not verified/configured |
| Yordas Group | competitor | [yordasgroup.com](https://yordasgroup.com) | 12 | — | 4 | [Configured](https://www.linkedin.com/company/761147) |
| Zenovel Pharma | competitor | [zenovel.com](https://zenovel.com) | 0 | 1 | 0 | [Configured](https://www.linkedin.com/company/zenovel) |
| Alkem | customer | [alkemlabs.com](https://alkemlabs.com) | Blocked/unreadable | 1 | 92 | [Configured](https://www.linkedin.com/company/alkem-laboratories-ltd) |
| Amgen | customer | [amgen.com](https://amgen.com) | 4 | — | 85 | [Configured](https://www.linkedin.com/company/amgen) |
| AstraZeneca | customer | [astrazeneca.com](https://astrazeneca.com) | 4 | — | 89 | [Configured](https://www.linkedin.com/company/astrazeneca) |
| Bayer | customer | [bayer.com](https://bayer.com) | 5 | — | 89 | [Configured](https://www.linkedin.com/company/bayer) |
| Biocon | customer | [biocon.com](https://biocon.com) | Blocked/unreadable | 4 | 82 | [Configured](https://www.linkedin.com/company/biocon) |
| Boehringer Ingelheim | customer | [boehringer-ingelheim.com](https://boehringer-ingelheim.com) | 0 | 1 | 52 | [Configured](https://www.linkedin.com/company/boehringer-ingelheim) |
| Cipla | customer | [cipla.com](https://cipla.com) | 0 | 5 | 85 | [Configured](https://www.linkedin.com/company/cipla) |
| CuraTeQ | customer | [curateqbio.com](https://curateqbio.com) | 0 | 0 | 4 | [Configured](https://www.linkedin.com/company/curateq) |
| Daiichi Sankyo | customer | [daiichisankyo.com](https://daiichisankyo.com) | 0 | 2 | 65 | [Configured](https://www.linkedin.com/company/daiichi-sankyo) |
| Dr. Reddy's | customer | [drreddys.com](https://drreddys.com) | 0 | 0 | 91 | [Configured](https://www.linkedin.com/company/dr--reddys-laboratories) |
| Eisai | customer | [eisai.com](https://eisai.com) | Blocked/unreadable | 5 | 36 | [Configured](https://www.linkedin.com/company/eisai) |
| Galderma | customer | [galderma.com](https://galderma.com) | 1 | 2 | 30 | [Configured](https://www.linkedin.com/company/galderma-) |
| Gedeon Richter | customer | [gedeonrichter.com](https://gedeonrichter.com) | Blocked/unreadable | 7 | 0 | [Configured](https://www.linkedin.com/company/gedeonrichter) |
| Gilead | customer | [gilead.com](https://gilead.com) | 0 | 7 | 58 | [Configured](https://www.linkedin.com/company/gilead-sciences) |
| GSK | customer | [gsk.com](https://gsk.com) | 8 | — | 87 | [Configured](https://www.linkedin.com/company/gsk) |
| Incyte | customer | [incyte.com](https://incyte.com) | 9 | — | 84 | [Configured](https://www.linkedin.com/company/incyte) |
| J&J Medtech | customer | [jnjmedtech.com](https://jnjmedtech.com) | Blocked/unreadable | 1 | 18 | [Configured](https://www.linkedin.com/company/johnson-%26-johnson-medtech) |
| Kenvue | customer | [kenvue.com](https://kenvue.com) | 10 | — | 80 | [Configured](https://www.linkedin.com/company/kenvue) |
| Lupin | customer | [lupin.com](https://lupin.com) | 19 | — | 69 | [Configured](https://www.linkedin.com/company/lupin) |
| Merck KGaA | customer | [merckgroup.com](https://merckgroup.com) | Blocked/unreadable | 1 | 66 | [Configured](https://www.linkedin.com/company/merck-group) |
| Moderna | customer | [modernatx.com](https://modernatx.com) | 0 | 1 | 81 | [Configured](https://www.linkedin.com/company/modernatx) |
| Novartis | customer | [novartis.com](https://novartis.com) | 10 | — | 94 | [Configured](https://www.linkedin.com/company/novartis) |
| Novartis + Cognizant | customer | [novartis.com](https://novartis.com) | 10 | — | 8 | Not verified/configured |
| Opella | customer | [opella.com](https://opella.com) | Blocked/unreadable | 0 | 9 | [Configured](https://www.linkedin.com/company/opella) |
| Otsuka | customer | [otsuka.co.jp](https://otsuka.co.jp) | 11 | — | 45 | [Configured](https://www.linkedin.com/company/otsuka-pharmaceutical-companies) |
| Pierre Fabre | customer | [pierre-fabre.com](https://pierre-fabre.com) | 3 | — | 5 | [Configured](https://www.linkedin.com/company/pierre-fabre) |
| Roche | customer | [roche.com](https://roche.com) | 1 | 8 | 87 | [Configured](https://www.linkedin.com/company/roche) |
| Sanofi | customer | [sanofi.com](https://sanofi.com) | 0 | 0 | 85 | [Configured](https://www.linkedin.com/company/sanofi) |
| Sun Pharma | customer | [sunpharma.com](https://sunpharma.com) | 0 | 1 | 91 | [Configured](https://www.linkedin.com/company/sun-pharma) |
| Takeda | customer | [takeda.com](https://takeda.com) | 3 | — | 80 | [Configured](https://www.linkedin.com/company/takeda-pharmaceuticals) |
| Teva | customer | [tevapharm.com](https://tevapharm.com) | 0 | 8 | 91 | [Configured](https://www.linkedin.com/company/teva-pharmaceuticals) |
| Vertex | customer | [vrtx.com](https://vrtx.com) | 7 | — | 86 | [Configured](https://www.linkedin.com/company/vertex-pharmaceuticals) |
| Viatris | customer | [viatris.com](https://viatris.com) | 5 | — | 66 | [Configured](https://www.linkedin.com/company/viatris) |
| Zydus | customer | [zyduslife.com](https://zyduslife.com) | 0 | 0 | 94 | [Configured](https://www.linkedin.com/company/zydusuniverse) |

## Evidence

Raw source URLs, dated articles, browser findings, before/after catalogue backups and per-company results are retained in `.local-backups/full-company-audit/` (ignored; do not commit database snapshots).

Provider pagination contract: [Apify company-posts input schema](https://apify.com/apimaestro/linkedin-company-posts/input-schema). Additional-site references: [Sitero](https://sitero.com/), [Veranex](https://veranex.com/).
