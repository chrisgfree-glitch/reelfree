import json,re
T=json.load(open('data/titles.json')); B=json.load(open('/tmp/big.json')); TZ=json.load(open('/tmp/tz.json'))
norm=lambda s:re.sub(r'[^a-z0-9]','',s.lower())
for t in T:
    for k in ('featuredRank','popRank'): t.pop(k,None)
    r=B['catalogRatings'].get(t['id'])
    if r and not t.get('rating') and r['votes']>=5: t['rating']=r['rating']; t['votes']=r['votes']
byT={t['tmdbId']:t for t in T if t.get('tmdbId') and t.get('type')=='movie'}
byN={(norm(t['title']),t['year']):t for t in T}
ids={t['id'] for t in T}; added={'featured':0,'popular':0}
def place(lst,key,tag):
    for i,e in enumerate(lst,1):
        ex=byT.get(e['tmdbId']) or byN.get((norm(e['title']),e['year']))
        if ex: ex[key]=i; ex.setdefault('rating',e['rating']); ex.setdefault('votes',e['votes']); continue
        e[key]=i
        while e['id'] in ids: e['id']+='-2'
        ids.add(e['id']); T.append(e); byT[e['tmdbId']]=e; byN[(norm(e['title']),e['year'])]=e; added[tag]+=1
place(B['featured'],'featuredRank','featured'); place(B['popular'],'popRank','popular')
# TV: insert Pluto Star Trek channel at #3, Twilight Zone (1959) right after The Outer Limits
tv=sorted([t for t in T if t.get('tvRank')],key=lambda t:t['tvRank'])
ch={"id":"star-trek-pluto-channel","title":"Star Trek 24/7 channel (Pluto TV)","checkTitle":"Star Trek","year":1966,"type":"tv","genre":"Sci-Fi","source":"pluto",
 "url":"https://pluto.tv/us/live-tv/star-trek-1","description":"Pluto TV's free, official Star Trek live channel: a nonstop lineup of classic Star Trek episodes, free with ads in the US."}
tz=TZ.get('6357'); 
if tz: tz['id']='the-twilight-zone-1959'; tz['genre']='Sci-Fi'
tv.insert(2,ch)
if tz: tv.insert(next(i for i,t in enumerate(tv) if t['title']=='The Outer Limits')+1,tz)
for i,t in enumerate(tv,1): t['tvRank']=i
T+= [ch]+([tz] if tz else [])
fan=[("star-trek-continues","Star Trek Continues","3G-ziTBAkbQ",2013,"Fan-made web series (11 episodes, 2013–2017) that completes the original five-year mission, with Vic Mignogna as Kirk. Starts with E01 \"Pilgrim of Eternity\"; full playlist on the official Star Trek Continues channel.","https://www.youtube.com/playlist?list=PLhvh2eq-XLgqNxH6npvQxGxLCUHy90IpZ","tv"),
 ("prelude-to-axanar","Prelude to Axanar","1W1_8IV8uhA",2014,"Award-winning fan-made short film presented as a documentary about the Four Years War, starring Richard Hatch, Tony Todd and J.G. Hertzler. On Axanar Productions' official channel.",None,"movie"),
 ("star-trek-new-voyages-come-what-may","Star Trek: New Voyages – Come What May","_pX9lE1lFvQ",2004,"Pilot episode of the long-running fan series Star Trek: New Voyages / Phase II, uploaded by its writer-director Jack Marshall.",None,"tv")]
for i,(id_,ti,yt,yr,desc,pl,ty) in enumerate(fan):
    T.append({"id":id_,"title":ti,"year":yr,"type":ty,"genre":"Sci-Fi","source":"youtube","fanMade":True,"description":desc,"youtubeId":yt,
      "url":pl or f"https://www.youtube.com/watch?v={yt}","embedUrl":f"https://www.youtube-nocookie.com/embed/{yt}","image":f"https://i.ytimg.com/vi/{yt}/hqdefault.jpg"})
json.dump(T,open('data/titles.json','w'),indent=2,ensure_ascii=False)
json.dump({"popularMinVotes":B['minVotes'],"generated":"2026-11-24"},open('data/meta.json','w'))
print(len(T),added,[ (t['tvRank'],t['title']) for t in tv])
print('featured ranks',sum(1 for t in T if t.get('featuredRank')),'pop',sum(1 for t in T if t.get('popRank')))
