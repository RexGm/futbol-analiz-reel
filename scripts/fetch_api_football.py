#!/usr/bin/env python3
"""API-Football (api-sports.io) ile maç verisi çeker -> match_data.json

Ücretsiz plan: günde 100 istek. Anahtar: https://dashboard.api-football.com  ->  export APIFOOTBALL_KEY=...
Bu script opsiyoneldir; anahtar yoksa SKILL.md'deki web araması yolu kullanılır.

Kullanım:
  python3 fetch_api_football.py --team "Fenerbahce" --opponent "Galatasaray" --date 2025-12-01 -o match_data.json
  python3 fetch_api_football.py --fixture 1234567 -o match_data.json

Çıktı (story.json yazarken kullanılır):
  fixture{id,date,venue,league,round,score,halftime}, teams{home,away}, stats{home{...},away{...}},
  events[{minute,extra,team,player,type,detail}], lineups{home{formation,startXI,subs},away{...}}
  stats anahtarları: shots, on_target, possession, corners, fouls, yellow, red, saves, xg (ligde varsa), passes, pass_pct
"""
import argparse
import json
import os
import sys
import urllib.parse
import urllib.request

BASE = "https://v3.football.api-sports.io"


def get(path, **params):
    key = os.environ.get("APIFOOTBALL_KEY")
    if not key:
        sys.exit("APIFOOTBALL_KEY yok. Web araması yoluna geç veya anahtarı kullanıcıdan iste.")
    url = f"{BASE}/{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"x-apisports-key": key})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read())
    if data.get("errors"):
        sys.exit(f"API hatası: {data['errors']}")
    return data.get("response", [])


def team_id(name):
    res = get("teams", search=name)
    if not res:
        sys.exit(f"Takım bulunamadı: {name}")
    return res[0]["team"]["id"], res[0]["team"]["name"]


STAT_MAP = {
    "Total Shots": "shots", "Shots on Goal": "on_target", "Ball Possession": "possession",
    "Corner Kicks": "corners", "Fouls": "fouls", "Yellow Cards": "yellow", "Red Cards": "red",
    "Goalkeeper Saves": "saves", "expected_goals": "xg", "Total passes": "passes", "Passes %": "pass_pct",
    "Shots off Goal": "off_target", "Blocked Shots": "blocked", "Shots insidebox": "inside_box",
}


def num(v):
    if v is None:
        return 0
    if isinstance(v, str):
        v = v.replace("%", "").strip()
        try:
            return float(v) if "." in v else int(v)
        except ValueError:
            return v
    return v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fixture", type=int)
    ap.add_argument("--team")
    ap.add_argument("--opponent")
    ap.add_argument("--date", help="YYYY-MM-DD")
    ap.add_argument("--season", type=int)
    ap.add_argument("-o", "--out", default="match_data.json")
    a = ap.parse_args()

    fid = a.fixture
    if not fid:
        if not (a.team and a.date):
            sys.exit("--fixture veya (--team ve --date) gerekli")
        tid, _ = team_id(a.team)
        fx = get("fixtures", team=tid, date=a.date)
        if a.opponent:
            o = a.opponent.lower()
            fx = [f for f in fx if o in (f["teams"]["home"]["name"] + f["teams"]["away"]["name"]).lower()]
        if not fx:
            sys.exit("Bu tarihte maç bulunamadı (tarih yerel saat farkıyla bir gün kaymış olabilir).")
        fid = fx[0]["fixture"]["id"]

    f = get("fixtures", id=fid)[0]
    home_id = f["teams"]["home"]["id"]
    out = {
        "fixture": {"id": fid, "date": f["fixture"]["date"], "venue": (f["fixture"].get("venue") or {}).get("name"),
                    "league": f["league"]["name"], "round": f["league"].get("round"),
                    "score": f"{f['goals']['home']}-{f['goals']['away']}",
                    "halftime": f"{f['score']['halftime']['home']}-{f['score']['halftime']['away']}"},
        "teams": {"home": f["teams"]["home"]["name"], "away": f["teams"]["away"]["name"]},
        "stats": {}, "events": [], "lineups": {},
        "source": f"API-Football fixture {fid}",
    }
    for blk in get("fixtures/statistics", fixture=fid):
        side = "home" if blk["team"]["id"] == home_id else "away"
        out["stats"][side] = {STAT_MAP.get(s["type"], s["type"]): num(s["value"]) for s in blk["statistics"]}
    for e in get("fixtures/events", fixture=fid):
        out["events"].append({"minute": e["time"]["elapsed"], "extra": e["time"].get("extra"),
                              "team": "home" if e["team"]["id"] == home_id else "away",
                              "player": (e.get("player") or {}).get("name"), "assist": (e.get("assist") or {}).get("name"),
                              "type": e["type"], "detail": e.get("detail")})
    for lu in get("fixtures/lineups", fixture=fid):
        side = "home" if lu["team"]["id"] == home_id else "away"
        out["lineups"][side] = {"formation": lu.get("formation"), "coach": (lu.get("coach") or {}).get("name"),
                                "startXI": [{"name": p["player"]["name"], "pos": p["player"].get("pos"), "grid": p["player"].get("grid")} for p in lu["startXI"]],
                                "subs": [p["player"]["name"] for p in lu.get("substitutes", [])]}
    with open(a.out, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    print(f"{out['teams']['home']} {out['fixture']['score']} {out['teams']['away']}  ->  {a.out}")


if __name__ == "__main__":
    main()
