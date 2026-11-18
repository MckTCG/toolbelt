#!/usr/bin/env python3
"""Download and audit *source photographs*, never generate or invent card art.

Strict image hosts, timeouts and byte limits. This is a one-off source audit for
unverified November 2026 Flowing Fists leaks; no automatic publication.
"""
from __future__ import annotations
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import re
from urllib.parse import urlparse, urlsplit
import requests
from PIL import Image, ImageOps, ImageDraw
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/"public/assets/flowing-fists-leaks/phase2-source"
OUT.mkdir(parents=True,exist_ok=True)
SOURCES={
    "pika-lucario-ur":"https://pika-collect.fr/img/news-images/articles/23a360bf-3c7b-4bc9-a133-2993165bb48b/2.webp",
    "pika-hawlucha-ir":"https://pika-collect.fr/img/news-images/articles/23a360bf-3c7b-4bc9-a133-2993165bb48b/6.webp",
    "reddit-six-card-sheet":"https://i.redd.it/sxd8glzr2a2i1.jpeg",
    "reddit-wide-gallery":"https://i.redd.it/e6l99idvsb2i1.jpeg"
}
ALLOWED=("pika-collect.fr","i.redd.it","preview.redd.it","www.samuraiswordtokyo.com","samuraiswordtokyo.com")
def fetch_image(label,url):
    host=urlparse(url).hostname
    if host not in ALLOWED:raise ValueError(f"Unapproved image hostname: {host}")
    resp=requests.get(url,timeout=20,headers={"User-Agent":"Mozilla/5.0 (compatible; TCG-Lab-SourceAudit/1.0)"},stream=True)
    resp.raise_for_status()
    raw=bytearray()
    for part in resp.iter_content(65536):
        raw.extend(part)
        if len(raw)>12_000_000:raise ValueError("Image source >12MB")
    im=ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    if im.width<200 or im.height<250:raise ValueError("Source too small")
    slug=re.sub(r"[^a-z0-9-]+","-",label.lower())[:90]
    fn=slug+".jpg"
    path=OUT/fn
    im.save(path,format="JPEG",quality=92,optimize=True)
    return {"label":label,"source_url":url,"file":fn,"dimensions":[im.width,im.height],
            "sha256":hashlib.sha256(path.read_bytes()).hexdigest(),"bytes":path.stat().st_size}

# Resolve Reddit post and comment gallery URLs, including inline img links.
def add_reddit_images():
    posts=["1xz9fgy","1xz307a"]
    for post in posts:
        url=f"https://www.reddit.com/comments/{post}.json?limit=100&raw_json=1"
        try:
            resp=requests.get(url,timeout=18,headers={"User-Agent":"TCGLabLeakResearch/0.1 (personal test proxies)"})
            print("REDDIT JSON",post,resp.status_code,len(resp.content),flush=True)
            if resp.status_code!=200:continue
            data=resp.json()
            def walk(x):
                if isinstance(x,dict):
                    author=x.get("author","")
                    body=x.get("body","")
                    if isinstance(body,str) and re.search(r"buizel|glimmet|these|hatt[e]?rene|persian",body,re.I):
                        print("REDDIT COMMENT",post,author,body[:160],flush=True)
                    for k,v in x.items():
                        if k in ("url","url_overridden_by_dest","u") and isinstance(v,str):
                            v=v.replace("&amp;","&")
                            if re.match(r"https://(?:i|preview)\.redd\.it/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)",v):
                                label=f"reddit-{post}-{hashlib.sha1(v.encode()).hexdigest()[:10]}"
                                SOURCES[label]=v
                        walk(v)
                elif isinstance(x,list):
                    for z in x:walk(z)
            walk(data)
        except Exception as e:print("REDDIT ERROR",post,str(e)[:150],flush=True)
add_reddit_images()
# Supplement blog gallery image sources; preserve exact URL and provenance.
try:
    page=requests.get("https://www.samuraiswordtokyo.com/blogs/news/flowing-fists-leaks-cards-reported-early-mega-lucario-z-ex-blastoise",timeout=20)
    soup=BeautifulSoup(page.text,"html.parser")
    for i,im in enumerate(soup.select("article img, .article__content img, .rte img")):
        src=im.get("src") or im.get("data-src") or ""
        if src.startswith("//"):src="https:"+src
        elif src.startswith("/"):src="https://www.samuraiswordtokyo.com"+src
        if urlparse(src).hostname in ALLOWED and "flowing" in ((im.get("alt") or "").lower()+src.lower()):
            SOURCES[f"samurai-{i}"]=src
except Exception as e:print("BLOG ERROR",str(e)[:180],flush=True)
items=[]
for name,url in SOURCES.items():
    try:
        item=fetch_image(name,url)
        items.append(item)
        print("IMAGE",name,item["dimensions"],item["bytes"],url[:170],flush=True)
    except Exception as exc:
        print("SOURCE FAILURE",name,type(exc).__name__,str(exc)[:200],flush=True)
(OUT/"audit.json").write_text(json.dumps({"schema":"flowing-fists-phase2-source-audit","items":items},indent=2)+"\n")
# Readable diagnostic sheet in logs for visual crop design.
tile_w=280;tile_h=310
sheet=Image.new("RGB",(tile_w*3,tile_h*((len(items)+2)//3)),"#ddd")
draw=ImageDraw.Draw(sheet)
for k,item in enumerate(items):
    im=Image.open(OUT/item["file"]);im.thumbnail((260,275))
    px=(k%3)*tile_w+(tile_w-im.width)//2;py=(k//3)*tile_h+18
    sheet.paste(im,(px,py))
    draw.text(((k%3)*tile_w+5,(k//3)*tile_h+291),item["label"][:36],fill="black")
buf=io.BytesIO();sheet.save(buf,format="JPEG",quality=64,optimize=True)
print("AUDIT_CONTACT_BEGIN",base64.b64encode(buf.getvalue()).decode(),"AUDIT_CONTACT_END",flush=True)
print("AUDIT_COMPLETE",len(items),flush=True)
