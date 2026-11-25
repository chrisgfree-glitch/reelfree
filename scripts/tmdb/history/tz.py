exec(open('/tmp/build_new.py').read().split("out={'movies'")[0])
import json
res={}
for i in (83135,6357):
    d,prov=details('tv',i); print(i,d.get('name'),d.get('first_air_date'),prov)
    if prov: res[i]=entry('tv',d,prov,{"rating":round(d.get('vote_average',0),1),"votes":d.get('vote_count',0)})
json.dump(res,open('/tmp/tz.json','w'))
