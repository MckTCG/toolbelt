#!/usr/bin/env python3
"""TCG Lab — conservative discovery adapters (stdlib only).

Sources: PokéBeach front-page RSS (third-party relay), directly fetched PokéBeach
card-spoiler blocks, Limitless individual card pages, and Pokémon Proxies
static bundle artwork references. All discoveries remain UNVERIFIED.
No image downloads, user data, catalogue modifications or auto-approval.
"""
import argparse
import datetime as dt
from email.utils import parsedate_to_datetime
import hashlib
import html
from html.parser import HTMLParser
import json
import re
import sys
from urllib.parse import urlparse, urljoin
from urllib.request import Request, build_opener, HTTPRedirectHandler
import xml.etree.ElementTree as ET

SCHEMA = "tcg-lab-card-discovery-feed-v1"
INTAKE = "tcg-lab-card-intake-v1"
RSS = "https://kaprestridge.github.io/pokebeach-news-feed/feed.xml"
PROXIES = "https://www.pokemonproxies.com/"
MAX_BODY = 3_000_000
HEADERS = {"User-Agent": "TCG-Lab-CardDiscovery/0.2 (+https://github.com/MckTCG/toolbelt; personal review, polite rate limits)", "Accept": "text/html,application/xml,text/xml;q=0.9,*/*;q=0.7"}
SYMBOLS = {"G":"Grass","R":"Fire","W":"Water","L":"Lightning","P":"Psychic","F":"Fighting","D":"Darkness","M":"Metal","C":"Colorless","N":"Dragon","Y":"Fairy"}
BLOCK = {"p","div","h1","h2","h3","h4","br","li","section","article","tr"}
VOID = {"br","img","meta","input","link","hr","source","wbr","area","base","embed","param","track","col"}
NEWS = re.compile(r"reveal|spoiler|new cards?|first look|previewed|shown|debut",re.I)

def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00","Z")

def normalized(txt):
    return re.sub(r"\s+"," ",html.unescape(str(txt or ""))).strip()

def stable_id(*values):
    return hashlib.sha256("|".join(map(str,values)).encode("utf-8")).hexdigest()[:22]

def candidate(*, source_url, source_kind, discovery_id, **extra):
    fields = dict(source_url=source_url,source_kind=source_kind,discovery_id=discovery_id,
                  language="unknown",status="provisional",source_verified=False,
                  artwork_verified=False,review_note="",discovered_at=now())
    fields.update(extra)
    fields["source_verified"]=False
    fields["artwork_verified"]=False
    fields["status"]="provisional" if fields.get("language")!="en" else "discovered"
    return fields

class Node:
    __slots__=("tag","attrs","parts")
    def __init__(self,tag,attrs=None):
        self.tag=tag
        self.attrs=dict(attrs or [])
        self.parts=[]
    def classes(self):
        return self.attrs.get("class","").split()
    def find(self, cls):
        for node in self.walk():
            if cls in node.classes():return node
        return None
    def find_all(self,cls):
        return [node for node in self.walk() if cls in node.classes()]
    def walk(self):
        for part in self.parts:
            if isinstance(part,Node):
                yield part
                yield from part.walk()
    def text(self):
        chunks=[]
        for part in self.parts:
            if isinstance(part,str):chunks.append(part)
            else:
                if part.tag in BLOCK:chunks.append("\n")
                chunks.append(part.text())
                if part.tag in BLOCK:chunks.append("\n")
        return "".join(chunks)
    def clean(self):
        return normalized(self.text())
    def first_tag(self,tag):
        return next((n for n in self.walk() if n.tag==tag),None)

class DOM(HTMLParser):
    def __init__(self,src):
        super().__init__(convert_charrefs=True)
        self.root=Node("document")
        self.stack=[self.root]
        self.feed(src)
    def handle_starttag(self,tag,attrs):
        node=Node(tag,attrs)
        self.stack[-1].parts.append(node)
        if tag not in VOID:self.stack.append(node)
    def handle_startendtag(self,tag,attrs):
        self.stack[-1].parts.append(Node(tag,attrs))
    def handle_endtag(self,tag):
        for i in range(len(self.stack)-1,0,-1):
            if self.stack[i].tag==tag:
                del self.stack[i:]
                return
    def handle_data(self,data):
        if self.stack[-1].tag not in ("script","style","noscript"):
            self.stack[-1].parts.append(data)
    def handle_entityref(self,name):
        self.handle_data(html.unescape("&"+name+";"))

def safe_url(value,hosts):
    p=urlparse(str(value))
    if p.scheme!="https" or p.username or p.password or p.hostname not in hosts or p.port not in (None,443):
        raise ValueError("URL host not allowed for discovery: "+str(value)[:140])
    return p.geturl()

class GuardedRedirect(HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        safe_url(newurl,{"www.pokebeach.com","pokebeach.com","kaprestridge.github.io","limitlesstcg.com","www.limitlesstcg.com","www.pokemonproxies.com"})
        return super().redirect_request(req,fp,code,msg,headers,newurl)
OPENER = build_opener(GuardedRedirect)

def get(url,allowed_hosts):
    url=safe_url(url,allowed_hosts)
    with OPENER.open(Request(url,headers=HEADERS),timeout=22) as resp:
        final=safe_url(resp.geturl(),allowed_hosts)
        buf=resp.read(MAX_BODY+1)
        if len(buf)>MAX_BODY:raise ValueError("Response exceeded download budget: "+final)
        typ=(resp.headers.get("Content-Type") or "").lower()
        if not any(t in typ for t in ("html","xml","javascript","text/plain","application/octet-stream")):
            raise ValueError("Unexpected source content type: "+typ)
        return buf.decode("utf-8","replace")

def parse_feed(xml_text):
    root=ET.fromstring(xml_text)
    if root.tag!="rss":raise ValueError("Unexpected PokéBeach relay feed")
    rows=[]
    for item in root.findall("./channel/item"):
        title=normalized(item.findtext("title"))
        url=normalized(item.findtext("link"))
        date=normalized(item.findtext("pubDate"))
        if not title or not NEWS.search(title):continue
        try: safe_url(url,{"www.pokebeach.com","pokebeach.com"})
        except ValueError:continue
        rows.append({"title":title,"url":url,"published":date})
    return rows

def followup_articles(prior, already_seen=None, limit=8, include_older=False, clock=None):
    """Revisit source articles after their first discovery, without a private watchlist.

    For the first 72 hours, check at every 4-hour scheduled run.
    Older items (up to 30 days) recheck in the daily deep pass; older than
    30 days weekly, unless a known release is within 30 days.
    """
    clock=clock or dt.datetime.now(dt.timezone.utc)
    seen=set(already_seen or [])
    by_url={}
    for card in prior.get("candidates",[]):
        url=card.get("source_url","")
        if not card.get("source_kind","").startswith("pokebeach") or url in seen:continue
        try:safe_url(url,{"www.pokebeach.com","pokebeach.com"})
        except ValueError:continue
        stamp=card.get("source_published_at") or card.get("discovered_at") or ""
        date=None
        if stamp:
            try:
                date=parsedate_to_datetime(stamp)
            except (TypeError,ValueError):
                try:date=dt.datetime.fromisoformat(stamp.replace("Z","+00:00"))
                except ValueError:pass
        if date and date.tzinfo is None:date=date.replace(tzinfo=dt.timezone.utc)
        age=max(0,(clock-date).total_seconds()/3600) if date else 99999
        upcoming=False
        for key in ("release_jp","release_en","release_date"):
            val=card.get(key) or ""
            try:
                release=dt.date.fromisoformat(val.replace("/","-"))
                if -30<=(release-clock.date()).days<=30:upcoming=True
            except ValueError:pass
        recent=age<=72
        revisit=recent or (include_older and (age<=24*30 or upcoming or clock.weekday()==0))
        if not revisit:continue
        priority=(0 if upcoming else 1 if recent else 2,age)
        if url not in by_url or priority<by_url[url][0]:
            by_url[url]=(priority,{"title":card.get("name","Previously revealed card"),
              "url":url,"published":stamp})
    return [x[1] for x in sorted(by_url.values(),key=lambda row:row[0])[:limit]]

def convert_symbols(text):
    return [SYMBOLS.get(s,s) for s in re.findall(r"\[([GRWLPFDMCNY])\]",text)]

def number_and_set(img_alt):
    m=re.search(r"(.+?) from (.+?)\s*\(#\s*(\d+)\)",img_alt,re.I)
    return (normalized(m.group(2)),str(int(m.group(3)))) if m else ("","")

def get_child_text(node,cls):
    child=node.find(cls)
    return child.clean() if child else ""

def parse_pokebeach_article(markup, url, published="", title=""):
    safe_url(url,{"www.pokebeach.com","pokebeach.com"})
    dom=DOM(markup).root
    article=dom.find("entry-content")
    if not article:return []
    candidates=[]
    for index,card in enumerate(article.find_all("card-spoiler")[:80]):
        nameblock=card.find("name")
        title_node=nameblock.first_tag("strong") if nameblock else None
        name=title_node.clean() if title_node else ""
        image=card.first_tag("img")
        art=(image.attrs.get("src") or "") if image else ""
        if art:
            try:safe_url(art,{"www.pokebeach.com","pokebeach.com"})
            except ValueError:art=""
        alt=image.attrs.get("alt","") if image else ""
        set_name,number=number_and_set(alt)
        if not number:
            match=re.match(r"^(\d{1,4})-",card.attrs.get("id",""))
            if match:number=str(int(match.group(1)))
        if not name and alt:name=normalized(alt.split(" from ")[0])
        if not name:continue
        classes=card.classes()
        category=next((x for x in ("Pokémon","Trainer","Energy") if x in classes),"")
        ptype=next((x for x in SYMB0L_TYPES if x in classes),"") if category=="Pokémon" else ""
        header=nameblock.clean() if nameblock else ""
        hp_m=re.search(r"\b(\d{2,3})\s*HP\b",header,re.I)
        stage_m=re.search(r"(Basic\s+Pokemon|Stage\s*[12]|Supporter|Item|Stadium|Pokémon\s+Tool|Special\s+Energy|Basic\s+Energy)",header,re.I)
        evolve_m=re.search(r"Evolves?\s+from\s+(.+?)($|Weakness|Ability)",header,re.I)
        abilities=[]
        ability_container=card.find("abilities")
        if ability_container:
            for p in [n for n in ability_container.walk() if n.tag=="p"]:
                strong=p.first_tag("strong")
                ability=normalized(strong.text()) if strong else ""
                effect=p.clean()
                if ability.lower().startswith("ability:"):
                    effect=effect[len(ability):].strip()
                    abilities.append({"name":ability.split(":",1)[1].strip(),"text":effect})
        attacks=[]
        for attack in card.find_all("attack"):
            text=attack.clean()
            strong=attack.first_tag("strong")
            aname=strong.clean() if strong else ""
            symbol_seq=re.findall(r"\[([GRWLPFDMCNY])\]",text.split(aname)[0]) if aname else []
            effect=text.split(aname,1)[-1].lstrip(": ").strip() if aname else ""
            damage_match=re.match(r"(\d+\s*[x×+]?)\s*damage\.?\s*",effect,re.I)
            damage=damage_match.group(1).replace(" ","") if damage_match else ""
            description=effect[damage_match.end():].strip() if damage_match else effect
            if aname:attacks.append({"name":aname,"cost":[SYMBOLS[x] for x in symbol_seq],"damage":damage,"text":description})
        wrr=get_child_text(card,"weakness")
        weakness_match=re.search(r"Weakness:\s*(.*?)(?=Resistance:|$)",wrr,re.I)
        resistance_match=re.search(r"Resistance:\s*(.*?)(?=Retreat:|$)",wrr,re.I)
        retreat_match=re.search(r"Retreat:\s*(.*)$",wrr,re.I)
        def wrr_type(pattern):
            if not pattern:return ""
            val=pattern.group(1).strip()
            if val.lower()=="none":return "none"
            codes=convert_symbols(val)
            mult=re.search(r"(x\d+|×\s*\d+|[-−]\s*\d+)",val)
            return (codes[0] if codes else val.split()[0]) + (" "+mult.group(1) if mult else "")
        details=[]
        for ab in abilities:details.append("Ability: "+ab["name"]+" — "+ab["text"])
        for atk in attacks:details.append("Attack: "+atk["name"]+" — "+atk["damage"]+" "+atk["text"])
        # English on PokéBeach is commonly translated from JP/CN; not official English confirmation.
        proof="PokéBeach structured spoiler; translation is provisional, no English release/regulation verified. Article: "+(title or name)
        if len(abilities)>1:
            proof+=". CAUTION: multiple Ability descriptions in article; these may be alternate translations. Select only the actual printed Ability after verification."

        c=candidate(source_url=url,source_kind="pokebeach-card-spoiler",
          discovery_id=stable_id("pokebeach",url,card.attrs.get("id",""),name,index),
          name=name,category=category,stage=stage_m.group(1).replace("Basic Pokemon","Basic") if stage_m else "",
          pokemon_types=ptype,hp=hp_m.group(1) if hp_m else "",
          evolves_from=normalized(evolve_m.group(1)) if evolve_m else "",
          weakness=wrr_type(weakness_match),resistance=wrr_type(resistance_match),
          retreat_cost=str(len(convert_symbols(retreat_match.group(1)))) if retreat_match else "",
          set_name=set_name,card_number=number,image_url=art,
          abilities=abilities,attacks=attacks,combined_text="\n".join(details),
          source_published_at=published,review_note=proof)
        candidates.append(c)
    return candidates
SYMB0L_TYPES = ("Grass","Fire","Water","Lightning","Psychic","Fighting","Darkness","Metal","Colorless","Dragon","Fairy")

def parse_limitless(markup,url):
    safe_url(url,{"limitlesstcg.com","www.limitlesstcg.com"})
    match=re.search(r"/cards/(en|jp)/([A-Za-z0-9]+)/(\d+)/?$",urlparse(url).path)
    if not match:raise ValueError("Expected a Limitless individual-card URL")
    lang,setcode,number=match.groups()
    dom=DOM(markup).root
    title=dom.first_tag("title")
    titletext=title.clean() if title else ""
    mt=re.match(r"(.+?)\s+-\s+(.+?)\s+\(([A-Za-z0-9]+)\)\s+#(\d+)",titletext)
    if not mt:raise ValueError("Limitless page title missing card/set identity")
    name,set_name,title_set,title_number=mt.groups()
    if title_set.upper()!=setcode.upper() or int(title_number)!=int(number):raise ValueError("Limitless URL/title identity mismatch")
    card=dom.find("card-profile")
    if not card:raise ValueError("Limitless card profile missing")
    cardtype=get_child_text(card,"card-text-type")
    category=next((x for x in ("Pokémon","Trainer","Energy") if x in cardtype),"")
    stage=normalized(cardtype.split(" - ",1)[1]) if " - " in cardtype else ""
    titleline=get_child_text(card,"card-text-title")
    hp=(re.search(r"\b(\d{2,3})\s*HP",titleline) or [None,""])[1]
    pokemon_types=""
    m=re.search(r" -\s*([A-Za-z]+)\s*-\s*\d+\s*HP",titleline)
    if m:pokemon_types=m.group(1)
    image=card.find("card-image")
    src=image.first_tag("img").attrs.get("src","") if image and image.first_tag("img") else ""
    if src:
        try:safe_url(src,{"limitlesstcg.nyc3.cdn.digitaloceanspaces.com","s3.limitlesstcg.com"})
        except ValueError:src=""
    abilities=[]
    for ab in card.find_all("card-text-ability"):
        info=get_child_text(ab,"card-text-ability-info")
        effect=get_child_text(ab,"card-text-ability-effect")
        aname=re.sub(r"^Ability:\s*","",info,flags=re.I)
        if aname:abilities.append({"name":aname,"text":effect})
    attacks=[]
    for atk in card.find_all("card-text-attack"):
        info=atk.find("card-text-attack-info")
        detail=info.clean() if info else ""
        symbol=info.find("ptcg-symbol") if info else None
        letters=symbol.clean() if symbol else ""
        if letters and detail.startswith(letters):detail=detail[len(letters):].strip()
        mm=re.match(r"(.+?)\s+(\d+[x×+]?)$",detail)
        aname=mm.group(1).strip() if mm else detail.strip()
        damage=mm.group(2) if mm else ""
        if aname:attacks.append({"name":aname,"cost":[SYMBOLS.get(c,c) for c in letters if c in SYMBOLS],"damage":damage,"text":get_child_text(atk,"card-text-attack-effect")})
    wrr=get_child_text(card,"card-text-wrr")
    def getval(key):
        m=re.search(key+r":\s*(.+?)(?=Weakness:|Resistance:|Retreat:|$)",wrr,re.I)
        return normalized(m.group(1)) if m else ""
    reg=get_child_text(card,"regulation-mark")
    reg_match=re.search(r"\b([A-Z])\s+Regulation Mark",reg)
    extra=[]
    for a in abilities:extra.append("Ability: "+a["name"]+" — "+a["text"])
    for a in attacks:extra.append("Attack: "+" ".join(a["cost"])+" "+a["name"]+" "+a["damage"]+" — "+a["text"])
    if not extra:
        textblock=card.find("card-text")
        if textblock:extra.append(textblock.clean())
    note="Limitless structured catalogue record; review all fields, printing image, and source language before approval."
    return [candidate(source_url=url,source_kind="limitless-card",discovery_id=stable_id("limitless",lang,setcode,number),
        language=lang,set_code=setcode.upper(),set_name=set_name,card_number=str(int(number)),name=name,
        category=category,stage=stage,pokemon_types=pokemon_types,hp=hp,
        ability_names=" | ".join(a["name"] for a in abilities),
        attack_names=" | ".join(a["name"] for a in attacks),
        attacks=attacks,abilities=abilities,combined_text="\n".join(extra),
        weakness=getval("Weakness"),resistance=getval("Resistance"),retreat_cost=getval("Retreat"),
        regulation_mark=reg_match.group(1) if reg_match else "",image_url=src,review_note=note)]

def extract_proxy_images(js):
    """Only asset references, not inferred rules, translation or legality."""
    pattern=re.compile(r"/assets/([a-z0-9]{1,3})-(\d{3})-([A-Za-z0-9_'-]+)-([A-Za-z0-9_-]{7,12})\.(png|webp)",re.I)
    rows={}
    for match in pattern.finditer(js):
        group,num,cardname,checksum,ext=match.groups()
        asset=match.group(0)
        if asset not in rows:
            name=cardname.replace("_"," ").replace("  "," ")
            rows[asset]={"group":group,"num":str(int(num)),"name":name,"image":urljoin(PROXIES,asset)}
    return list(rows.values())

def proxy_candidates(html_page,js_bundle,max_cards=25):
    script=re.search(r'<script[^>]*src=["\'](/assets/index-[A-Za-z0-9_-]+\.js)["\']',html_page)
    if not script:raise ValueError("Pokémon Proxies JS bundle URL missing")
    cards=extract_proxy_images(js_bundle)
    if not cards:raise ValueError("Pokémon Proxies asset paths absent from JS")
    latest=sorted(set(x["group"] for x in cards),reverse=True)[0]
    current=[x for x in cards if x["group"]==latest]
    out=[]
    for c in current[:max_cards]:
        out.append(candidate(source_url=PROXIES,source_kind="pokemonproxies-artwork",
            discovery_id=stable_id("pokemonproxies",c["image"]),
            name=c["name"],card_number=c["num"],image_url=c["image"],
            review_note="Unverified translated proxy artwork (group "+latest+"). Set identity, language and gameplay text MUST be reviewed."))
    return out,script.group(1)

def build_feed(cards,catalog_keys,prior=None,max_items=500):
    prior=prior or {}
    previous={x["discovery_id"]:x for x in prior.get("candidates",[]) if x.get("discovery_id")}
    seen=set(prior.get("seen_ids",[]))
    new=0
    for candidate_card in cards:
        did=candidate_card.get("discovery_id")
        if not did:continue
        key=(candidate_card.get("set_code","").upper(),str(candidate_card.get("card_number","")).lstrip("0"))
        if key[0] and key in catalog_keys:continue
        if did not in seen:new+=1
        seen.add(did)
        previous[did]=candidate_card
    # All items in the public review feed remain UNVERIFIED, even when retrieved again.
    for x in previous.values():
        x["source_verified"]=False
        x["artwork_verified"]=False
        x["status"]="discovered" if x.get("language")=="en" else "provisional"
    items=sorted(previous.values(),key=lambda x:(x.get("source_published_at") or x.get("discovered_at") or ""),reverse=True)[:max_items]
    # Cross-provider similarity is a REVIEW HINT, not proof of printing/translation identity.
    groups={}
    for x in items:
        name=normalized(x.get("name","")).casefold()
        number=str(x.get("card_number","")).lstrip("0")
        if name and number:groups.setdefault((name,number),[]).append(x)
    for group in groups.values():
        if len(group)<2:continue
        for x in group:
            others=[y.get("source_kind","unknown") for y in group if y["discovery_id"]!=x["discovery_id"]]
            if others and "Possible cross-source overlap" not in x.get("review_note",""):
                x["review_note"]=(x.get("review_note","")+". Possible cross-source overlap ("+
                                  ", ".join(sorted(set(others)))+
                                  "); confirm the actual set and printing before combining.").strip()
    # Keep the public browser feed small even if sources reveal hundreds of cards.
    while items and len(json.dumps({"candidates":items,"seen_ids":sorted(seen)[-12000:]},ensure_ascii=False))>1_500_000:
        items.pop()
    return {"schema":SCHEMA,"generated_at":now(),"source_note":"Unverified staged discoveries only. The authoritative Card DB is separate.",
            "candidates":items,"seen_ids":sorted(seen)[-12000:],"new_count":new}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--out",required=True)
    ap.add_argument("--prior")
    ap.add_argument("--catalog",default="public/card-db.html")
    ap.add_argument("--max-articles",type=int,default=8)
    ap.add_argument("--max-proxies",type=int,default=25)
    ap.add_argument("--card-url",action="append",default=[])
    ap.add_argument("--fixture-dir")
    ap.add_argument("--recheck-budget",type=int,default=8)
    ap.add_argument("--recheck-older",action="store_true")
    ap.add_argument("--central-temp",default="public/data/temp-catalog-v1.json")
    args=ap.parse_args()
    import pathlib
    if args.max_articles<0 or args.max_articles>30:raise ValueError("max-articles must be 0..30")
    if args.max_proxies<0 or args.max_proxies>100:raise ValueError("max-proxies must be 0..100")
    if args.recheck_budget<0 or args.recheck_budget>20:raise ValueError("recheck-budget must be 0..20")
    def read_fixture(name,live):
        p=pathlib.Path(args.fixture_dir or "")/name
        if args.fixture_dir and p.exists():return p.read_text(encoding="utf8")
        if args.fixture_dir:raise FileNotFoundError(p)
        return get(*live)
    db=pathlib.Path(args.catalog).read_text("utf8")
    match=re.search(r'<script id="catalog" type="application/json">([\s\S]*?)</script>',db)
    if not match:raise ValueError("Master DB JSON missing")
    master=json.loads(match.group(1))
    catalog_keys={(p["set_code"].upper(),str(p["card_number"]).lstrip("0")) for e in master["entities"] for p in e.get("printings",[])}
    prior={}
    if args.prior and pathlib.Path(args.prior).is_file() and pathlib.Path(args.prior).stat().st_size>0:
        prior=json.loads(pathlib.Path(args.prior).read_text("utf8"))
        if prior.get("schema")!=SCHEMA:raise ValueError("Unsupported prior feed format")
    # Scheduled checks can now see centrally accepted TEMP records. Browser-only
    # notes/tags remain private and are never read by this bot.
    watch_prior={**prior,"candidates":list(prior.get("candidates",[]))}
    try:
        central_file=pathlib.Path(args.central_temp)
        if central_file.is_file():
            central=json.loads(central_file.read_text("utf8"))
            if central.get("schema")!="tcg-lab-central-temp-v1":raise ValueError("Unexpected central TEMP schema")
            for card in central.get("cards",[])[:5000]:
                source=card.get("source","")
                if not source.startswith("https://www.pokebeach.com/"):continue
                watch_prior["candidates"].append({
                    "source_kind":"pokebeach-card-spoiler",
                    "source_url":source,
                    "name":card.get("name",""),
                    "source_published_at":card.get("updatedAt") or card.get("addedAt",""),
                    "release_jp":card.get("releaseJP",""),
                    "release_en":card.get("releaseEN","")
                })
    except Exception as exc:
        raise ValueError("Cannot read central TEMP watchlist: "+str(exc)[:150])
    candidates=[];errors=[];stats={"central_temp_watchlist":len(watch_prior["candidates"])-len(prior.get("candidates",[]))}
    try:
        feed=read_fixture("rss.xml",(RSS,{"kaprestridge.github.io"}))
        articles=parse_feed(feed)[:args.max_articles]
        recent_urls={x["url"] for x in articles}
        followups=followup_articles(watch_prior,recent_urls,args.recheck_budget,args.recheck_older)
        articles.extend(followups)
        stats["rss_articles"]=len(articles)-len(followups)
        stats["followup_articles"]=len(followups)
        for index,article in enumerate(articles):
            if not args.fixture_dir and index:__import__("time").sleep(0.8)
            try:
                slug=article["url"].split("/")[-1]
                page=read_fixture("pokebeach-"+slug+".html",(article["url"],{"www.pokebeach.com","pokebeach.com"}))
                found=parse_pokebeach_article(page,article["url"],article["published"],article["title"])
                if found:candidates.extend(found)
                else:
                    candidates.append(candidate(source_url=article["url"],source_kind="pokebeach-article-unparsed",
                        discovery_id=stable_id("article",article["url"]),review_note="Article identified but no structured card-spoiler blocks: "+article["title"],source_published_at=article["published"]))
                stats["pokebeach_cards"]=stats.get("pokebeach_cards",0)+len(found)
            except Exception as e:errors.append("PokéBeach article "+str(index)+": "+str(e)[:150])
    except Exception as e:errors.append("PokéBeach RSS: "+str(e)[:150])
    if args.max_proxies:
        try:
            homepage=read_fixture("pokemonproxies.html",(PROXIES,{"www.pokemonproxies.com"}))
            m=re.search(r'<script[^>]*src=["\'](/assets/index-[A-Za-z0-9_-]+\.js)["\']',homepage)
            if not m:raise ValueError("Missing Pokémon Proxies JS asset")
            js=read_fixture("pokemonproxies-bundle.js",(urljoin(PROXIES,m.group(1)),{"www.pokemonproxies.com"}))
            found,_=proxy_candidates(homepage,js,args.max_proxies)
            candidates.extend(found);stats["pokemonproxies_artworks"]=len(found)
        except Exception as e:errors.append("Pokémon Proxies: "+str(e)[:160])
    for url in args.card_url[:20]:
        try:
            safe_url(url,{"limitlesstcg.com","www.limitlesstcg.com"})
            slug=re.sub(r"[^A-Za-z0-9-]+","_",urlparse(url).path.strip("/"))
            page=read_fixture("limitless-"+slug+".html",(url,{"limitlesstcg.com","www.limitlesstcg.com"}))
            candidates.extend(parse_limitless(page,url))
            stats["limitless_cards"]=stats.get("limitless_cards",0)+1
        except Exception as e:errors.append("Limitless URL: "+str(e)[:160])
    out=build_feed(candidates,catalog_keys,prior)
    out["sources"]={"rss":RSS,"pokemonproxies":PROXIES,"limitless":"individual card URLs"}
    out["stats"]=stats;out["errors"]=errors
    out_path=pathlib.Path(args.out);out_path.parent.mkdir(parents=True,exist_ok=True)
    out_path.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    print(json.dumps({"candidates":len(out["candidates"]),"new":out["new_count"],"stats":stats,"errors":errors},ensure_ascii=False))
    if not candidates and errors:sys.exit(2)

if __name__=="__main__":main()
