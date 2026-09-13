import { collectionKey, readCollectionRow, writeCollectionRow } from './marketIntelCollectionStore';

type Evidence = {url:string; title:string; text:string; published:string|null; partial?:boolean; articleLinks:{url:string;title:string}[]};
type Store = {read:typeof readCollectionRow; write:typeof writeCollectionRow};

/** Reuse verified article bodies across discovery, classification and retries.
 * A failed cache must never turn a successfully read article into a failure. */
export async function cachedArticleEvidence(url:string, read:()=>Promise<Evidence|null>, store:Store={read:readCollectionRow,write:writeCollectionRow}, now=Date.now):Promise<Evidence|null> {
  const id=`market-intel:article-evidence:${collectionKey({version:1,url:url.split('#')[0]})}`;
  try {
    const saved=(await store.read(id))?.catalog;
    if(saved?.until>now() && saved.evidence?.text && saved.evidence?.url)return saved.evidence;
  } catch { /* Reading the publisher remains available when caching is unavailable. */ }
  const evidence=await read();
  if(evidence)try {
    await store.write(id,{evidence,until:now()+(evidence.partial?300_000:86400_000)});
  } catch { /* Keep the successfully collected evidence. */ }
  return evidence;
}
