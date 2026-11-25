import json
exec(open('/tmp/sports.py').read().split("S={")[0])
exec("S={"+open('/tmp/sports.py').read().split("S={")[1].split("def chan")[0])
exec("def chan"+open('/tmp/sports.py').read().split("def chan")[1].split("hs=[")[0])
D=json.load(open('/tmp/sports.json')); R=D['yt']
R['@PRCAProRodeo']=chan('@PRCAProRodeo')[1]; S['Rodeo']=['@PBR','@PRCAProRodeo']
BAD={'@PFL','@PRCA','@MajorLeagueCricket'}
pl=lambda slug,name:{'kind':'tab','service':'Pluto TV','name':name,'url':f'https://pluto.tv/us/live-tv/{slug}','note':'Free 24/7 channel (ads)'}
FAST={'Football':[pl('nfl-channel','NFL Channel')],'Baseball':[pl('mlb','MLB')],'Golf':[pl('pga-tour','PGA TOUR')],
 'Boxing & MMA':[pl('top-rank-classics','Top Rank Classics'),pl('dazn-ringside','DAZN Ringside')],'Wrestling':[pl('tna-wrestling','TNA Wrestling')],
 'Rodeo':[{'kind':'tab','service':'Pluto TV','name':'PBR RidePass','url':'https://pluto.tv/us/watch/live-tv/18585/','note':'Free 24/7 bull riding & rodeo channel (ads)'},
          {'kind':'tab','service':'Tubi','name':'Cowboy+ Sports','url':'https://tubitv.com/live/400000285/cowboy-sports','note':'Free 24/7 ProRodeo & Western sports channel (ads)'}],
 'Sports news & multi-sport':[pl('fox-sports','FOX Sports'),pl('cbs-sports-hq','CBS Sports HQ')]}
# verify FAST pages respond with expected title
for k,v in FAST.items():
    for s in v:
        url,html=get(s['url']); s['ok']=bool(url) and s['name'].split()[0].lower() in html[:20000].lower()
out=[]
for sport in list(S)+['Sports news & multi-sport']:
    items=[]
    for h in S.get(sport,[]):
        c=R.get(h)
        if not c or h in BAD: continue
        if c['embedOk']: items.append({'kind':'embed','service':'YouTube (official)','name':c['name'].replace('&#39;',"'"),'url':f'https://www.youtube.com/{h}/videos','embed':f"https://www.youtube-nocookie.com/embed/videoseries?list={c['uploads']}",'note':'Latest uploads: highlights, condensed & classic games'})
        else: items.append({'kind':'tab','service':'YouTube (official)','name':c['name'].replace('&#39;',"'"),'url':f'https://www.youtube.com/{h}/videos','note':'Official channel (opens YouTube)'})
    items+= [s for s in FAST.get(sport,[]) if s.get('ok')]
    for s in items: s.pop('ok',None)
    if items: out.append({'sport':sport,'count':len(items),'items':items})
json.dump({'note':'Official league/org YouTube channels and free ad-supported sports channels. Most live major games are not legally free.','sports':out},open('/workspace/reelfree/data/sports.json','w'),indent=1,ensure_ascii=False)
for s in out: print(s['sport'],s['count'],[i['name'] for i in s['items']])
print('fast failed',[s['name'] for v in FAST.values() for s in v if s.get('ok') is False])
