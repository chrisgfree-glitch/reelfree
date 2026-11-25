import json,re,concurrent.futures as cf
exec(open('/tmp/disc.py').read().split("seen={}")[0])
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
out={'movies':[], 'tv':[], 'skipped':[]}
# featured recent movies
disc=[o for o in json.load(open('/tmp/disc.json')) if o['votes']>=5]
disc.sort(key=lambda o:o['date'],reverse=True)
def mv(o):
    d,prov=details('movie',o['id']); return o,d,prov
with cf.ThreadPoolExecutor(8) as ex: res=list(ex.map(mv,disc))
n=0
for o,d,prov in res:
    if not prov: out['skipped'].append(('movie',o['title'],'no allowed free provider on recheck')); continue
    if n>=25: break
    n+=1; out['movies'].append(entry('movie',d,prov,{"featured":True,"featuredRank":n}))
# transformers age of extinction
d,prov=details('movie',91314)
if prov: out['movies'].append(entry('movie',d,prov))
# TV lineup
tvids=[253,4629,  # slot 1, 2
 None]
names=['Tracker','The Rainmaker','Matlock','Ghosts','Survivor','Hot Ones','Murdoch Mysteries','Snowpiercer','The X-Files']
D=json.load(open('/tmp/disctv.json')); byname={o['title']:o['id'] for o in D}
rest=[byname[n] for n in names if n in byname]+[655,580,1855,2290,1972,4271,2985,43020,62413,2840,1649,1639,4018,21567]
def tvd(i):
    d,prov=details('tv',i); return i,d,prov
with cf.ThreadPoolExecutor(8) as ex: R=dict((i,(d,p)) for i,d,p in ex.map(tvd,[253,4629]+rest))
lineup=[]
for i in [253,4629]:
    d,p=R[i]
    if p: lineup.append(entry('tv',d,p))
    else: out['skipped'].append(('tv',d['name'],'not free'))
others=[]
for i in rest:
    d,p=R[i]
    if p: others.append(entry('tv',d,p))
    else: out['skipped'].append(('tv',d['name'],'not free'))
others.sort(key=lambda e:(e.get('lastAirDate') or ''),reverse=True)
lineup+=others
for k,e in enumerate(lineup[:25]): e['tvRank']=k+1
out['tv']=lineup[:25]
json.dump(out,open('/tmp/new_entries.json','w'),indent=1)
for e in out['movies']: print('M',e.get('featuredRank'),e['releaseDate'],e['title'],e['providers'],e['tmdbPopularity'])
for e in out['tv']: print('T',e['tvRank'],e['year'],e.get('endYear'),e['title'],e['providers'])
print('skipped',out['skipped'])
