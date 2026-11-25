import os,json,urllib.request,urllib.parse
tok=os.environ.get('TMDB_READ_TOKEN'); key=os.environ.get('TMDB_API_KEY')
def tm(p,q):
    q=dict(q)
    if not tok: q['api_key']=key
    req=urllib.request.Request('https://api.themoviedb.org/3'+p+'?'+urllib.parse.urlencode(q),headers={'Authorization':f'Bearer {tok}','accept':'application/json'} if tok else {'accept':'application/json'})
    for i in range(3):
        try: return json.load(urllib.request.urlopen(req,timeout=20))
        except Exception as e:
            if i==2: raise
            import time; time.sleep(1.5)
OK={'tubi tv','tubi','pluto tv','plex','plex channel','fandango at home free','vudu free','youtube free','youtube'}
seen={}
for sort in ['primary_release_date.desc','popularity.desc']:
    for page in (1,2,3):
        r=tm('/discover/movie',{'primary_release_date.gte':'2024-08-01','primary_release_date.lte':'2026-11-24','watch_region':'US','with_watch_monetization_types':'free|ads','sort_by':sort,'page':page,'include_adult':'false','vote_count.gte':5 if sort.startswith('pop') else 1})
        for m in r['results']: seen[m['id']]=m
print('discover candidates',len(seen))
out=[]
import concurrent.futures as cf
def prov(mid):
    try: return mid,tm(f'/movie/{mid}/watch/providers',{}).get('results',{}).get('US',{})
    except Exception: return mid,None
with cf.ThreadPoolExecutor(8) as ex: P=dict(ex.map(prov,list(seen)))
print('provider lookups failed:',sum(v is None for v in P.values()))
for mid,m in seen.items():
    us=P[mid] or {}
    free=[p['provider_name'] for k in ('free','ads') for p in us.get(k,[])]
    ok=[p for p in free if p.lower() in OK]
    if ok: out.append(dict(id=mid,title=m['title'],date=m['release_date'],pop=round(m['popularity'],1),votes=m['vote_count'],providers=ok,allfree=free,link=us.get('link'),poster=m.get('poster_path'),genre_ids=m.get('genre_ids'),overview=m.get('overview','')))
    elif free: print('  excluded', m['title'], m['release_date'], free)
out.sort(key=lambda o:o['date'],reverse=True)
json.dump(out,open('/tmp/disc.json','w'))
for o in out: print(o['date'],'|',o['title'],'|',o['providers'],'| pop',o['pop'],'| votes',o['votes'])
print('qualifying',len(out))
