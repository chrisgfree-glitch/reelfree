"""Genre browser data (data/genres.json): per TMDB genre, up to 30 US free/ads movies on allowed providers,
newest first, with >= 150 votes and rating >= 6.0. Run from repo root: python3 scripts/tmdb/genres.py"""
import json,concurrent.futures as cf,datetime
import sys,os
sys.path.insert(0,os.path.dirname(__file__))
from common import tm
ALLOWED={'Tubi TV':'Tubi','Pluto TV':'Pluto TV','Plex':'Plex','Plex Channel':'Plex','Fandango at Home Free':'Fandango at Home','YouTube Free':'YouTube'}
plist=tm('/watch/providers/movie',{'watch_region':'US'})['results']
pid=[str(p['provider_id']) for p in plist if p['provider_name'] in ALLOWED]
genres=tm('/genre/movie/list',{})['genres']
def disc(g):
    seen={}
    for page in (1,2,3):
        r=tm('/discover/movie',{'watch_region':'US','with_watch_monetization_types':'free|ads','with_watch_providers':'|'.join(pid),'with_genres':g['id'],'sort_by':'primary_release_date.desc','primary_release_date.lte':datetime.date.today().isoformat(),'vote_count.gte':150,'vote_average.gte':6.0,'page':page,'include_adult':'false'})
        for m in r['results']: seen[m['id']]=m
        if len(seen)>=45 or page>=r.get('total_pages',1): break
    return g,list(seen.values())
with cf.ThreadPoolExecutor(6) as ex: G=list(ex.map(disc,genres))
def prov(m):
    try:
        us=tm(f"/movie/{m['id']}/watch/providers",{}).get('results',{}).get('US',{})
        return m['id'],list(dict.fromkeys(ALLOWED[p['provider_name']] for k in ('free','ads') for p in us.get(k,[]) if p['provider_name'] in ALLOWED))
    except Exception: return m['id'],None
allm={m['id']:m for g,ms in G for m in ms}
with cf.ThreadPoolExecutor(10) as ex: P=dict(ex.map(prov,allm.values()))
out={'generated':datetime.datetime.utcnow().isoformat()+'Z','note':'US free/ads titles from TMDB discover + watch/providers (Tubi, Pluto TV, Plex, Fandango at Home Free, YouTube Free only). Links open TMDB/JustWatch where-to-watch pages.','genres':[]}
skipped=[]
for g,ms in G:
    items=[]
    for m in sorted(ms,key=lambda x:x.get('release_date',''),reverse=True):
        p=P.get(m['id'])
        if not p: continue
        img=m.get('backdrop_path') or m.get('poster_path')
        items.append({'tmdbId':m['id'],'title':m['title'],'year':int(m['release_date'][:4]) if m.get('release_date') else 0,'releaseDate':m.get('release_date'),'providers':p,'url':f"https://www.themoviedb.org/movie/{m['id']}/watch?locale=US",'image':f"https://image.tmdb.org/t/p/w780{img}" if img else None,'rating':round(m.get('vote_average',0),1)})
        if len(items)>=30: break
    if items: out['genres'].append({'id':g['id'],'name':g['name'],'count':len(items),'items':items})
    else: skipped.append(g['name'])
out['skipped']=skipped
json.dump(out,open('data/genres.json','w'),separators=(',',':'),ensure_ascii=False)
print('lookups failed',sum(v is None for v in P.values()))
for g in out['genres']: print(g['name'],g['count'],g['items'][0]['year'] if g['items'] else '')
print('skipped',skipped)
