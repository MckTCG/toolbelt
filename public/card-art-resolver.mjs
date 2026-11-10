// Same-origin artwork registry. Entries are keyed by exact printing, not card name.
export function indexedArt(manifest){
 if(manifest?.schema!=='tcg-lab-card-art-manifest-v1'||!Array.isArray(manifest.entries))return new Map();
 const index=new Map();
 for(const entry of manifest.entries){
  if(entry?.status!=='verified'||!entry.printingId||!entry.path||!entry.sha256)continue;
  const url=String(entry.path);
  if(!/^\.\/assets\/card-art\/[a-z0-9/_-]+\.(png|jpe?g|webp)$/i.test(url))continue;
  index.set(String(entry.printingId),url);
 }
 return index;
}
export function localArtworkFor(index,printingId){return index.get(String(printingId))||null}
