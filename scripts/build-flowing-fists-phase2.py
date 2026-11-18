#!/usr/bin/env python3
"""Build authentic-photo *provisional* Flowing Fists TEMP proxy printings.

Read-only source originals live in phase2-source; no artwork is generated or
substituted. One identity per physical printing (number), not per gameplay name.
All card texts remain incomplete. Re-run safely; existing four untouched.
"""
from __future__ import annotations
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageOps

ROOT=Path(__file__).resolve().parent.parent
ASSETS=ROOT/"public/assets/flowing-fists-leaks"
SRC=ASSETS/"phase2-source"
DST=ASSETS/"cards"
DST.mkdir(parents=True,exist_ok=True)
catalog_path=ROOT/"public/data/temp-catalog-v1.json"
intake_path=ROOT/"public/data/flowing-fists-leak-intake-20261118.json"
manifest_path=ASSETS/"manifest-v1.json"
sources=json.loads((SRC/"audit.json").read_text())
source_by_name={r["label"]:r for r in sources["items"]}
site="https://mute-dust-0d50.forcoin99.workers.dev/assets/flowing-fists-leaks/cards/"
now="2026-11-18T10:55:00Z"

# Pixels are coordinates in the previously inspected 2048x1039 Reddit
# composite. Do not infer unseen artwork or collector numbers.
SPEC=[
 # name, no, suffix, source, [left, top, right, bottom], type, stage, HP, rarity, language
 ("Hawlucha","087","hawlucha-ir-087","pika-hawlucha-ir",(3,3,731,1014),"Fighting","Basic","80","Illustration Rare","en"),
 ("Mega Lucario Z ex","097","mega-lucario-z-ex-ur-097","pika-lucario-ur",(6,6,729,1024),"Metal","Stage 1","330","Ultra Rare","en"),
 ("Regigigas","091","regigigas-ir-091","reddit-six-card-sheet",(46,621,420,1167),"Colorless","Basic","160","Illustration Rare","en"),
 ("Mega Absol Z ex","094","mega-absol-z-ex-ur-094","reddit-wide-gallery",(11,726,198,988),"Psychic","Basic","270","Ultra Rare","en"),
 ("Mega Absol Z ex","110","mega-absol-z-ex-sir-110","reddit-wide-gallery",(626,727,815,990),"Psychic","Basic","270","Special Illustration Rare","en"),
 ("Korrina's Seriousness","103","korrinas-seriousness-ur-103","reddit-wide-gallery",(423,729,613,992),"","Trainer","", "Ultra Rare","en"),
 ("Korrina's Seriousness","113","korrinas-seriousness-sir-113","reddit-wide-gallery",(1240,729,1441,995),"","Trainer","","Special Illustration Rare","en"),
 ("Mega Glimmora ex","055","mega-glimmora-ex-055","reddit-wide-gallery",(629,412,813,676),"Darkness","Stage 1","320","Double Rare","en"),
 ("Mega Tatsugiri ex","022","mega-tatsugiri-ex-022","reddit-wide-gallery",(11,412,201,675),"Water","Basic","260","Double Rare","en"),
 ("Sigilyph ex","032","sigilyph-ex-032","reddit-wide-gallery",(214,412,405,677),"Psychic","Basic","210","Double Rare","en"),
 ("Riolu","045","riolu-045","reddit-wide-gallery",(421,412,608,676),"Fighting","Basic","80","Common","en"),
 ("Mega Lucario Z ex","058","mega-lucario-z-ex-058","reddit-wide-gallery",(838,412,1024,677),"Metal","Stage 1","330","Double Rare","en"),
 ("Togedemaru ex","060","togedemaru-ex-060","reddit-wide-gallery",(1041,412,1229,678),"Metal","Basic","170","Double Rare","en"),
 ("Mega Lucario Z ex","115","mega-lucario-z-ex-gold-115","reddit-wide-gallery",(1455,731,1654,992),"Metal","Stage 1","330","Gold (unverified)","other")
]

def hashid(name,num):
    return hashlib.sha256(f"FLO:{name}:{num}".encode()).hexdigest()[:22]

def build_crop(spec):
    name,num,slug,source,box,typ,stage,hp,rarity,language=spec
    audit=source_by_name.get(source)
    if audit is None:raise ValueError("Missing audited source: "+source)
    raw=(SRC/audit["file"]).read_bytes()
    assert hashlib.sha256(raw).hexdigest()==audit["sha256"],"source changed "+source
    img=Image.open(SRC/audit["file"]).convert("RGB")
    l,t,r,b=box
    assert 0<=l<r<=img.width and 0<=t<b<=img.height,(slug,img.size,box)
    crop=img.crop(box)
    # Keep the entire photograph; pad only if photo frame differs in aspect.
    dst=ImageOps.pad(crop,(744,1040),method=Image.Resampling.LANCZOS,color="#dedede",centering=(.5,.5))
    outfile=DST/(slug+".jpg")
    dst.save(outfile,format="JPEG",quality=92,subsampling=0,optimize=True)
    imeta={"name":name,"set_code":"FLO","number":num,"file":"cards/"+outfile.name,
        "sha256":hashlib.sha256(outfile.read_bytes()).hexdigest(),"size_bytes":outfile.stat().st_size,
        "image_dimensions":[744,1040],"native_crop_dimensions":[crop.width,crop.height],
        "source_file":"phase2-source/"+audit["file"],"source_image_url":audit["source_url"],
        "crop_rectangle":list(box),"status":"unconfirmed-leak",
        "print_quality":"provisional leaked photo (very low resolution); source retained"}
    return imeta

manifest=json.loads(manifest_path.read_text())
catalog=json.loads(catalog_path.read_text())
intake=json.loads(intake_path.read_text())
assert catalog["schema"]=="tcg-lab-central-temp-v1"
assert intake["schema"]=="tcg-lab-card-intake-v1"
ids={c["id"] for c in catalog["cards"]}
printings={(c["setCode"],str(int(c["number"]))) for c in catalog["cards"] if c.get("number","").isdigit()}
existing_images={p["file"] for p in manifest["cards"]}
intake_ids={c["discovery_id"] for c in intake["cards"]}
for spec in SPEC:
    name,num,slug,source,box,typ,stage,hp,rarity,language=spec
    sid=hashid(name,num); cid="temp:reveal:"+sid
    image=site+slug+".jpg"
    meta=build_crop(spec)
    if meta["file"] not in existing_images:
        manifest["cards"].append(meta);existing_images.add(meta["file"])
    else:
        # A corrected crop must update its manifest checksum and native pixels.
        index=next(i for i,item in enumerate(manifest["cards"]) if item["file"]==meta["file"])
        manifest["cards"][index]=meta
    if cid in ids:continue
    if ("TMPFLO",str(int(num))) in printings:
        raise ValueError("Printing collision "+name+" "+num)
    row={"id":cid,"setCode":"TMPFLO","number":num,"name":name,"nameJP":"","category":"Trainer" if stage=="Trainer" else "Pokémon",
         "stage":"Supporter" if stage=="Trainer" else stage,"pokemonType":typ,"hp":hp,"evolvesFrom":"",
         "image":image,"source":source_by_name[source]["source_url"],"textEN":"",
         "language":language,"translationStatus":"unofficial","translationSource":"",
         "weakness":"","resistance":"","retreatCost":"","releaseJP":"","releaseEN":"",
         "sourceSetCode":"FLO","sourceSetName":"Flowing Fists","discoveryId":sid,
         "addedAt":now,"updatedAt":now,"status":"provisional","reviewState":"accepted-temp",
         "lastCheckedAt":now,"translationHistory":[],"revisionHistory":[],"discoveryIds":[sid]}
    catalog["cards"].append(row);ids.add(cid);printings.add(("TMPFLO",str(int(num))))
    if sid not in intake_ids:
        intake["cards"].append({
            "discovery_id":sid,"source_url":row["source"],"source_kind":"community-leak-photo",
            "source_published_at":"2026-11-18","extraction_method":"source-photo-crop",
            "extraction_confidence":"provisional","language":language,"set_code":"FLO","set_name":"Flowing Fists",
            "card_number":num,"name":name,"category":row["category"],"rarity":rarity,
            "status":"provisional","source_verified":False,"artwork_verified":False,
            "translation_status":"","image_url":image,"review_note":
            f"Unverified leak, {rarity}. Locally hosted low-resolution photo proxy. "
            f"Original: {row['source']}. Replace as higher-quality originals appear; no verified gameplay text.",
            "discovered_at":now,"temp_entity_id":cid,"temp_accepted_at":now,
            "stage":row["stage"],"pokemon_types":typ,"hp":hp
        });intake_ids.add(sid)
# Reported in discussion but not independently retrieved as card images;
# keep intake-only and do not mislabel unrelated art.
for name in ("Buizel","Glimmet","Persian","Hatterene","Tatsugiri"):
    if any(c["name"]==name for c in intake["cards"]):continue
    sid=hashid(name,"unverified")
    intake["cards"].append({
        "discovery_id":sid,"source_url":"https://www.reddit.com/r/PokemonTCG/comments/1xz9fgy/flowing_fists_leaked_cards_so_far/",
        "source_kind":"reddit-comment-report","source_published_at":"2026-11-18",
        "extraction_method":"human-report-no-verifiable-individual-image","extraction_confidence":"provisional",
        "language":"unknown","set_code":"FLO","set_name":"Flowing Fists","card_number":"",
        "name":name,"category":"Pokémon","rarity":"","status":"provisional",
        "source_verified":False,"artwork_verified":False,"translation_status":"",
        "image_url":"","review_note":"Unconfirmed Reddit comment mention. No exact photograph recovered; NOT in central TEMP or Proxy Workshop.",
        "discovered_at":now
    })
catalog["updated_at"]=now
intake["batch_status"]="Phase 2: 14 additional provisional locally hosted image printings, initial four retained; unverified image-free comment reports remain intake only"
intake["source_note"]="Images originate from Pika-collect and leaked Reddit photographs; all unconfirmed; original source hashes and crop rectangles retained."
manifest["source_note"]="Provisional leaked photographs and gallery crops. 744x1040 output does not imply native 300 DPI quality."
for p,d in [(manifest_path,manifest),(catalog_path,catalog),(intake_path,intake)]:
    p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+"\n")
print("PHASE2_GENERATED",len(SPEC),"new image cards; central=",len(catalog["cards"]),"total intake=",len(intake["cards"]))
