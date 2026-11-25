"""Shared TMDB helpers. Reads TMDB_READ_TOKEN or TMDB_API_KEY from the environment (never commit them)."""
import re
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

ALLOWED={'Tubi TV':'Tubi','Pluto TV':'Pluto TV','Plex':'Plex','Plex Channel':'Plex','Fandango at Home Free':'Fandango at Home','YouTube Free':'YouTube'}
GEN={g['id']:g['name'] for g in tm('/genre/movie/list',{})['genres']}
GEN.update({g['id']:g['name'] for g in tm('/genre/tv/list',{})['genres']})
def short(n): return {'Science Fiction':'Sci-Fi','Sci-Fi & Fantasy':'Sci-Fi','Action & Adventure':'Action'}.get(n,n)
def details(kind,i):
    d=tm(f'/{kind}/{i}',{'append_to_response':'watch/providers'})
    us=d.get('watch/providers',{}).get('results',{}).get('US',{})
    prov=[ALLOWED[p['provider_name']] for k in ('free','ads') for p in us.get(k,[]) if p['provider_name'] in ALLOWED]
    prov=list(dict.fromkeys(prov))
    return d,prov
def slug(s): return re.sub(r'[^a-z0-9]+','-',s.lower()).strip('-')
def entry(kind,d,prov,extra={}):
    title=d.get('title') or d.get('name'); date=d.get('release_date') or d.get('first_air_date') or ''
    img=d.get('backdrop_path') or d.get('poster_path')
    ov=(d.get('overview') or '').strip()
    if len(ov)>230: ov=ov[:227].rsplit(' ',1)[0]+'…'
    e={"id":f"{slug(title)}-{date[:4]}-tmdb","title":title,"year":int(date[:4]) if date else 0,"releaseDate":date,"type":'tv' if kind=='tv' else 'movie',
       "genre":short(GEN.get((d.get('genres') or [{}])[0].get('id'),'Drama')),"source":"tmdb","providers":prov,"tmdbKind":kind,"tmdbId":d['id'],
       "url":f"https://www.themoviedb.org/{kind}/{d['id']}/watch?locale=US","description":ov,"tmdbPopularity":round(d.get('popularity',0),1)}
    if img: e["image"]=f"https://image.tmdb.org/t/p/w780{img}"
    if kind=='tv': e["lastAirDate"]=d.get('last_air_date'); e["endYear"]=int(d['last_air_date'][:4]) if d.get('last_air_date') and d.get('status') in ('Ended','Canceled') else None
    e.update(extra); return e
