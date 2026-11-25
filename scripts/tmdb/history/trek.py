exec(open('/tmp/disc.py').read().split("seen={}")[0])
for n,i in [('SNW',103516),('Lower Decks',85948),('Prodigy',106393),('Discovery',67198),('Picard',85949),('Short Treks',83021)]:
    us=tm(f'/tv/{i}/watch/providers',{}).get('results',{}).get('US',{})
    print(n,i,{k:[p['provider_name'] for p in us.get(k,[])] for k in ('free','ads','flatrate','buy')})
