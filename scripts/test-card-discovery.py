#!/usr/bin/env python3
"""Offline source fixtures based on observed November 2026 page structure."""
import unittest,importlib.util,pathlib,sys
ROOT=pathlib.Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location("card_discovery",ROOT/"scripts/discover-card-reveals.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

ARTICLE="""<html><main><div class="entry-content">
<h1>Meowth and Persian Revealed from Aura Seeker!</h1>
<div class="spoilers">
<div id="069-meowth" class="card card-spoiler Pokémon Colorless">
<div class="thumbnail"><img src="https://www.pokebeach.com/news/2026/11/Meowth-m7.jpg"
 alt="Meowth from Aura Seeker (#069)"></div>
<p class="name"><strong>Meowth</strong> - <strong>80 HP</strong> - <span class="invisible">[</span><span class="ptcg-font C">C</span><span class="invisible">]</span><br>
<span class="evonote">Basic Pokemon</span></p>
<span class="attacks"><p class="attack">[C] <strong>Pay Day</strong>: 10 damage. Draw a card.</p></span>
<p class="weakness">Weakness: [F] x2<br>Resistance: none<br>Retreat: [C][C]</p></div>
<div id="070-persian" class="card card-spoiler Pokémon Colorless">
<img src="https://www.pokebeach.com/news/2026/11/Persian-m7.jpg" alt="Persian from Aura Seeker (#070)">
<p class="name"><strong>Persian</strong> - <strong>100 HP</strong> - [C]<br>
<span class="evonote">Stage 1 - Evolves from Meowth</span></p>
<span class="abilities"><p><strong>Ability: Large Coin</strong><br>Once during your turn, you may draw two cards.</p><p><strong>Ability: Large Koban</strong><br>If you have two Pokémon with Pay Day, draw two cards.</p></span>
<span class="attacks"><p class="attack">[C][C][C] <strong>Greedy Slash</strong>: 20x damage. For each card in hand.</p></span>
<p class="weakness">Weakness: [F] x2<br>Resistance: none<br>Retreat: [C]</p></div></div></div>
<div class="bbWrapper">User comments are not card source text.</div></main></html>"""
LIMITLESS="""<html><head><title>Mega Rayquaza ex - Delta Reign (DLR) #84 – Limitless</title></head>
<body><section class="card-page-main"><div class="card-profile"><div class="card-image">
<img src="https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/DLR/DLR_084_R_EN_LG.png"></div>
<div class="card-text"><div class="card-text-section">
<p class="card-text-title"><span class="card-text-name">Mega Rayquaza ex</span> - Colorless - 280 HP</p>
<p class="card-text-type">Pokémon - Basic</p></div>
<div class="card-text-ability"><p class="card-text-ability-info">Ability: Ruler's Roar</p>
<p class="card-text-ability-effect">Once during your turn, when this enters play, attach an Energy.</p></div>
<div class="card-text-attack"><p class="card-text-attack-info"><span class="ptcg-symbol">RLC</span>
Storm Emerald 50×</p><p class="card-text-attack-effect">This attack does damage per Energy.</p></div>
<p class="card-text-wrr">Weakness: Lightning<br>Resistance: Fighting<br>Retreat: 2</p></div>
<div class="regulation-mark">J Regulation Mark</div></div></section></body></html>"""
RSS="""<?xml version="1.0"?><rss version="2.0"><channel><title>PokéBeach News</title>
<item><title>Meowth and Persian Revealed from Aura Seeker!</title>
<link>https://www.pokebeach.com/2026/11/meowth-and-persian-revealed-from-aura-seeker</link>
<pubDate>Sat, 07 Nov 2026 02:08:00 GMT</pubDate></item>
<item><title>Random competitive deck strategy</title><link>https://www.pokebeach.com/2026/11/test</link></item>
</channel></rss>"""
PROXY="""const S='/assets/7a-023-Pawmi-BBlZV-Qs.png',G='/assets/7a-030-Mega_Absol_Z_ex-B_5mRk4W.png',
old='/assets/6a-058-Mega_Rayquaza_ex-DOgPY5gG.png';"""
PROXY_HTML="""<html><head><script type="module" crossorigin src="/assets/index-f9VVZKKs.js"></script></head></html>"""

class DiscoveryTest(unittest.TestCase):
 def test_feed_article_filter(self):
  rows=m.parse_feed(RSS)
  self.assertEqual(len(rows),1);self.assertIn("Meowth",rows[0]["title"])
 def test_pokebeach_multiple_cards_and_provenance(self):
  url="https://www.pokebeach.com/2026/11/meowth-and-persian-revealed-from-aura-seeker"
  cards=m.parse_pokebeach_article(ARTICLE,url,"Sat, 07 Nov 2026 02:08:00 GMT","Meowth and Persian")
  self.assertEqual(len(cards),2)
  meowth,persian=cards
  self.assertEqual((meowth["name"],meowth["card_number"],meowth["set_name"]),("Meowth","69","Aura Seeker"))
  self.assertEqual(meowth["attack_names"] if "attack_names" in meowth else meowth["attacks"][0]["name"],"Pay Day")
  self.assertEqual(meowth["attacks"][0]["cost"],["Colorless"])
  self.assertEqual(meowth["weakness"],"Fighting x2")
  self.assertEqual(meowth["retreat_cost"],"2")
  self.assertEqual(persian["stage"],"Stage 1")
  self.assertEqual(persian["evolves_from"],"Meowth")
  self.assertEqual(persian["abilities"][0]["name"],"Large Coin")
  self.assertIn("multiple Ability descriptions",persian["review_note"])
  self.assertNotEqual(meowth["discovery_id"],persian["discovery_id"])
  self.assertTrue(all(not c["source_verified"] and not c["artwork_verified"] for c in cards))
 def test_limitless_card_and_jp_provisional(self):
  c=m.parse_limitless(LIMITLESS,"https://limitlesstcg.com/cards/en/DLR/84")[0]
  self.assertEqual((c["name"],c["set_code"],c["card_number"]),("Mega Rayquaza ex","DLR","84"))
  self.assertEqual((c["hp"],c["pokemon_types"],c["stage"]),("280","Colorless","Basic"))
  self.assertEqual(c["attacks"][0]["cost"],["Fire","Lightning","Colorless"])
  self.assertEqual(c["abilities"][0]["name"],"Ruler's Roar")
  self.assertEqual(c["regulation_mark"],"J")
  self.assertEqual(c["status"],"discovered")
  self.assertFalse(c["source_verified"])
  jp=LIMITLESS.replace("Delta Reign (DLR) #84","Storm Emeralda (M6) #58")
  jj=m.parse_limitless(jp,"https://limitlesstcg.com/cards/jp/M6/58")[0]
  self.assertEqual(jj["language"],"jp")
  self.assertEqual(jj["status"],"provisional")
 def test_proxy_references_only(self):
  cards,script=m.proxy_candidates(PROXY_HTML,PROXY,max_cards=5)
  self.assertEqual(len(cards),2)
  self.assertEqual({c["name"] for c in cards},{"Pawmi","Mega Absol Z ex"})
  self.assertTrue(all(not c["source_verified"] and not c["artwork_verified"] for c in cards))
  self.assertTrue(all(not c.get("combined_text") for c in cards))
  self.assertEqual(script,"/assets/index-f9VVZKKs.js")
 def test_feed_dedupe_and_catalogue_exclusion(self):
  url="https://www.pokebeach.com/2026/11/meowth-and-persian-revealed-from-aura-seeker"
  cards=m.parse_pokebeach_article(ARTICLE,url)
  cards.append(m.parse_limitless(LIMITLESS,"https://limitlesstcg.com/cards/en/DLR/84")[0])
  feed=m.build_feed(cards,{("DLR","84")})
  self.assertEqual(len(feed["candidates"]),2)
  self.assertEqual(feed["new_count"],2)
  again=m.build_feed(cards,{("DLR","84")},feed)
  self.assertEqual(again["new_count"],0)
  self.assertEqual(len(again["candidates"]),2)
  proxy=m.candidate(source_url="https://www.pokemonproxies.com/",source_kind="pokemonproxies-artwork",
    discovery_id="c"*22,name="Meowth",card_number="69")
  flagged=m.build_feed([cards[0],proxy],set())
  self.assertEqual(len(flagged["candidates"]),2)
  self.assertTrue(all("Possible cross-source overlap" in c.get("review_note","") for c in flagged["candidates"]))

 def test_recheck_schedule(self):
  import datetime as dt
  now=dt.datetime(2026,11,10,8,15,tzinfo=dt.timezone.utc)
  recent="https://www.pokebeach.com/2026/11/recent-reveal"
  old="https://www.pokebeach.com/2026/10/older-reveal"
  soon="https://www.pokebeach.com/2026/09/near-release"
  rows={"candidates":[
    {"discovery_id":"a"*22,"source_url":recent,"source_kind":"pokebeach-card-spoiler",
     "source_published_at":"Sun, 08 Nov 2026 10:00:00 GMT","name":"Recent"},
    {"discovery_id":"b"*22,"source_url":old,"source_kind":"pokebeach-card-spoiler",
     "source_published_at":"Thu, 01 Oct 2026 10:00:00 GMT","name":"Old"},
    {"discovery_id":"c"*22,"source_url":soon,"source_kind":"pokebeach-card-spoiler",
     "source_published_at":"Mon, 01 Sep 2026 10:00:00 GMT","release_jp":"2026/11/20","name":"Near release"},
    {"discovery_id":"d"*22,"source_url":recent,"source_kind":"pokebeach-card-spoiler",
     "source_published_at":"Sun, 08 Nov 2026 10:00:00 GMT","name":"Other card same article"}]}
  four_hour=m.followup_articles(rows,set(),8,False,now)
  self.assertEqual([x["url"] for x in four_hour],[recent])
  daily=m.followup_articles(rows,set(),8,True,now)
  self.assertEqual({x["url"] for x in daily},{recent,soon})
  self.assertEqual(len(m.followup_articles(rows,{recent},8,False,now)),0)
  self.assertEqual(len(m.followup_articles(rows,set(),0,True,now)),0)
 def test_untrusted_url_rejection(self):
  for url in ["http://www.pokebeach.com/","https://www.pokebeach.com@127.0.0.1/","https://127.0.0.1/","https://www.pokebeach.com.evil.org/"]:
   with self.assertRaises(ValueError):m.safe_url(url,{"www.pokebeach.com"})
 def test_source_drift_reports_empty(self):
  self.assertEqual(m.parse_pokebeach_article('<div>Nothing structured</div>','https://www.pokebeach.com/2026/11/foo'),[])
  with self.assertRaises(ValueError):m.parse_limitless('<title>Bad</title>','https://limitlesstcg.com/cards/en/DLR/84')

if __name__=="__main__":unittest.main(verbosity=2)
