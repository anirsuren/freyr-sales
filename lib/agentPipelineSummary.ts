import type { Opportunity } from './opportunitiesShared';
/** Preserve original currencies and closed status; never silently treat raw values as USD. */
export function agentPipelineSummary(rows: Pick<Opportunity,'status'|'value'|'currency'>[]) {
  const open = rows.filter(row => row.status !== 'Won' && row.status !== 'Lost');
  const byCurrency: Record<string,number> = {};
  for (const row of open) {const c=row.currency || 'USD';byCurrency[c]=(byCurrency[c] || 0)+row.value;}
  const entries=Object.entries(byCurrency);
  return {openCount:open.length,byCurrency,openValue:entries.length===1?entries[0][1]:entries.length===0?0:null,
    openValueLabel:entries.length ? entries.map(([currency,value])=>`${currency} ${value.toLocaleString('en-US',{maximumFractionDigits:2})}`).join(' + ') : 'USD 0'};
}
