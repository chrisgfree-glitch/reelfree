import re,json,urllib.request as U,concurrent.futures as cf
UA={'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36','Accept-Language':'en-US'}
def get(u):
    try:
        with U.urlopen(U.Request(u,headers=UA),timeout=12) as r: return r.geturl(),r.read().decode('utf8','ignore')
    except Exception as e: return None,''
S={
 'Football':['@NFL','@NFLFilms','@NCAA'],'Baseball':['@MLB','@MLBVault'],'Basketball':['@NBA','@WNBA','@NBAHistory'],
 'Hockey':['@NHL'],'Soccer':['@MLS','@NWSL','@FIFA','@premierleague'],'Racing (F1, NASCAR, IndyCar)':['@Formula1','@NASCAR','@INDYCAR','@NHRA'],
 'Pool & Billiards':['@MatchroomPool','@AccuStats'],'Boxing & MMA':['@UFC','@MatchroomBoxing','@toprank','@PFL'],'Tennis':['@TennisTV','@WTA','@usopen'],
 'Golf':['@PGATOUR','@LPGA'],'Bowling':['@PBA','@PBABowling'],'Esports':['@lolesports','@valorantesports'],
 'Olympics & Track':['@Olympics','@WorldAthletics'],'Wrestling':['@WWE','@AEW','@FloWrestling'],'Rugby':['@WorldRugby','@SixNationsRugby'],
 'Cricket':['@ICC','@MajorLeagueCricket'],'Rodeo':['@PBR','@PRCA','@prorodeo','@TheCowboyChannel','@WranglerNFR'],
 'Volleyball':['@volleyballworld'],'Cycling':['@tourdefrance'],'Action sports':['@redbull','@XGames','@streetleague'],
}
def chan(h):
    url,html=get(f'https://www.youtube.com/{h}')
    m=re.search(r'"externalId":"(UC[\w-]{22})"',html) or re.search(r'<link rel="canonical" href="https://www.youtube.com/channel/(UC[\w-]{22})"',html)
    if not m: return h,None
    name=re.search(r'<meta property="og:title" content="([^"]+)"',html)
    pl='UU'+m.group(1)[2:]
    _,oe=get(f'https://www.youtube.com/oembed?url=https://www.youtube.com/playlist?list={pl}&format=json')
    try: oe=json.loads(oe)
    except Exception: oe=None
    return h,{'channelId':m.group(1),'name':name.group(1) if name else h,'uploads':pl,'embedOk':bool(oe)}
hs=[h for v in S.values() for h in v]
with cf.ThreadPoolExecutor(8) as ex: R=dict(ex.map(chan,hs))
PL={}
slugs=['nfl-channel','pbr-ridepass','pga-tour','nhra-tv','billiard-tv','matchroom-pool','red-bull-tv','glory-kickboxing','fubo-sports-network','pluto-tv-sports','mlb','nhl','the-cowboy-channel','cowboy-way','fight','pba-tv','wpt','sportsgrid','fox-sports','cbs-sports-hq','stadium','nascar-channel','pbr-bull-riding','women-sports-network','outside-tv','surfer-tv','top-rank-classics','dazn-ringside','ufc','wwe','tna-wrestling','impact-wrestling','tennis-channel','espn8-the-ocho','billiards-tv','rodeo-tv','the-rodeo-channel']
def pluto(s):
    url,html=get(f'https://pluto.tv/us/live-tv/{s}')
    t=re.search(r'<title>([^<]*)',html); t=t.group(1) if t else ''
    return s,(t if url and '/live-tv/' in url and not url.rstrip('/').endswith('live-tv') and 'Live TV Channel' in t else None)
with cf.ThreadPoolExecutor(8) as ex: P=dict(ex.map(pluto,slugs))
json.dump({'yt':R,'pluto':P,'S':S},open('/tmp/sports.json','w'),indent=1)
for k,v in S.items(): print(k,[ (h,(R[h] or {}).get('name'),(R[h] or {}).get('embedOk')) for h in v])
print({k:v for k,v in P.items() if v})
