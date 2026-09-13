const normalized = (name: string) => name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g,"and").replace(/[^a-z0-9]/g, "");
/** Accept spelling, corporate suffix and acronym variants; never a shared generic industry word. */
export function compatibleCompanyNames(a: string, b: string): boolean {
  const words = (name: string) => name.toLowerCase().split(/[^a-z0-9]+/).filter(w => w && !/^(inc|plc|llc|ltd|limited|corporation|corp|company|group|global|the|and|solutions|services|pharmaceuticals|sciences)$/.test(w));
  const left = normalized(words(a).join(" ")), right = normalized(words(b).join(" "));
  if (!left || !right) return false;
  if (left === right || (Math.min(left.length,right.length)>=4 && (left.startsWith(right)||right.startsWith(left)))) return true;
  const acronym = (name:string) => name.split(/\s+/).filter(w=>!/^(and|&)$/i.test(w)).map(w=>w[0]).join("").toLowerCase();
  return (left.length>=3 && left===acronym(b)) || (right.length>=3 && right===acronym(a));
}
