exec(open('/tmp/build_new.py').read().split("out={'movies'")[0])
import json,datetime
r=tm('/search/tv',{'query':'The Outer Limits','first_air_date_year':1995})['results'][0]
d=tm(f"/tv/{r['id']}",{'append_to_response':'watch/providers'})
us=d['watch/providers']['results'].get('US',{})
print('OL95',r['id'],r['first_air_date'],{k:[p['provider_name'] for p in us.get(k,[])] for k in ('free','ads')})
ol=entry('tv',d,['The Roku Channel'],{"allowRoku":True,"rating":round(d.get('vote_average',0),1)})
ol['id']='the-outer-limits-1995'
tr=[]
for path in ('/movie/upcoming','/movie/now_playing'):
    for m in tm(path,{'region':'US','page':1})['results']:
        if len(tr)>=16 or any(x['tmdbId']==m['id'] for x in tr): continue
        v=tm(f"/movie/{m['id']}/videos",{}).get('results',[])
        v=[x for x in v if x['site']=='YouTube' and x['type']=='Trailer' and x.get('official')]
        if v: tr.append({'tmdbId':m['id'],'title':m['title'],'releaseDate':m.get('release_date'),'youtubeId':v[0]['key'],'name':v[0]['name'],'upcoming':path.endswith('upcoming')})
tr.sort(key=lambda x:x['releaseDate'] or '',reverse=True)
json.dump({'generated':datetime.date.today().isoformat(),'trailers':tr},open('/workspace/reelfree/data/trailers.json','w'),indent=1,ensure_ascii=False)
json.dump(ol,open('/tmp/ol95.json','w'))
print(len(tr),[x['title'] for x in tr])
