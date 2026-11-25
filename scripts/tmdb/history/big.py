import json,re,datetime,concurrent.futures as cf
exec(open('/tmp/build_new.py').read().split("out={'movies'")[0])
today=datetime.date.today().isoformat()
PID=[str(p['provider_id']) for p in tm('/watch/providers/movie',{'watch_region':'US'})['results'] if p['provider_name'] in ALLOWED]
def disc(params,need):
    got=[];seen=set()
    for page in range(1,30):
        r=tm('/discover/movie',dict(params,watch_region='US',with_watch_monetization_types='free|ads',with_watch_providers='|'.join(PID),include_adult='false',page=page))
        cands=[m for m in r['results'] if m['id'] not in seen]
        for m in cands: seen.add(m['id'])
        with cf.ThreadPoolExecutor(8) as ex: res=list(ex.map(lambda m:(m,)+details('movie',m['id']),cands))
        for m,d,prov in res:
            if prov and len(got)<need: got.append((d,prov))
        if len(got)>=need or page>=r.get('total_pages',1): break
    return got
def rate(d): return {"rating":round(d.get('vote_average',0),1),"votes":d.get('vote_count',0)}
feat=disc({'sort_by':'primary_release_date.desc','primary_release_date.gte':'2010-01-01','primary_release_date.lte':today,'vote_count.gte':5},100)
MINV=200
pop=disc({'sort_by':'vote_average.desc','primary_release_date.gte':'1970-01-01','primary_release_date.lte':today,'vote_count.gte':MINV},100)
out={'featured':[entry('movie',d,p,rate(d)) for d,p in feat],'popular':[entry('movie',d,p,rate(d)) for d,p in pop],'minVotes':MINV}
# ratings for existing catalog titles
T=json.load(open('/workspace/reelfree/data/titles.json'))
def find(t):
    if t.get('tmdbId'):
        d=tm(f"/{t.get('tmdbKind','movie')}/{t['tmdbId']}",{}); return t['id'],rate(d)
    kind='tv' if t['type']=='tv' else 'movie'
    q=re.sub(r'\s*\(.*?\)','',t['title'])
    r=tm(f'/search/{kind}',{'query':q,('first_air_date_year' if kind=='tv' else 'year'):t['year']}).get('results',[])
    return t['id'],(rate(r[0]) if r else None)
with cf.ThreadPoolExecutor(8) as ex: out['catalogRatings']=dict(ex.map(find,T))
for n,i in [('Prodigy',106393),('Discovery',67198),('Picard',85949),('Short Treks',83021)]:
    us=tm(f'/tv/{i}/watch/providers',{}).get('results',{}).get('US',{})
    out.setdefault('trek',{})[n]={k:[p['provider_name'] for p in us.get(k,[])] for k in ('free','ads','flatrate')}
json.dump(out,open('/tmp/big.json','w'))
print('featured',len(out['featured']),out['featured'][0]['releaseDate'],out['featured'][-1]['releaseDate'])
print('popular',len(out['popular']),out['popular'][0]['title'],out['popular'][0]['rating'],out['popular'][-1]['rating'])
print('rated catalog',sum(1 for v in out['catalogRatings'].values() if v))
print(out['trek'])
