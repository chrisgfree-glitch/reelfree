"""Re-curate the two TMDB-driven movie rows and prune junk.  Run from the repo root:
    python3 scripts/tmdb/curate.py
Popular: US free/ads (allowed providers) movies from 1970 on with >= 1000 votes and rating >= 6.5,
         ranked by weighted rating  score = (v*R + m*C) / (v + m),  m = 1000, C = mean rating of the pool.
Newest:  US free/ads movies from 2010 on with rating >= 6.0 and >= 100 votes, newest first, max 100.
Every pick is re-verified with /movie/{id}/watch/providers (Tubi, Pluto TV, Plex, Fandango at Home Free, YouTube Free).
Also removes earlier TMDB-added movies that are in neither row and fall below rating 6.0 or 100 votes."""
import sys, os, json, re, datetime, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(__file__))
from common import tm, details, entry, ALLOWED
TODAY = datetime.date.today().isoformat()
POP_MIN_VOTES, POP_MIN_RATING, M = 1000, 6.5, 1000
NEW_MIN_VOTES, NEW_MIN_RATING = 100, 6.0
PID = [str(p['provider_id']) for p in tm('/watch/providers/movie', {'watch_region': 'US'})['results'] if p['provider_name'] in ALLOWED]

def disc(params, need, max_pages=40):
    got, seen = [], set()
    for page in range(1, max_pages + 1):
        r = tm('/discover/movie', dict(params, watch_region='US', with_watch_monetization_types='free|ads',
               with_watch_providers='|'.join(PID), include_adult='false', page=page))
        cands = [m for m in r['results'] if m['id'] not in seen]
        seen.update(m['id'] for m in cands)
        with cf.ThreadPoolExecutor(8) as ex:
            for d, prov in ex.map(lambda m: details('movie', m['id']), cands):
                if prov and len(got) < need: got.append((d, prov))
        if len(got) >= need or page >= r.get('total_pages', 1): break
    return got

def rate(d): return {'rating': round(d.get('vote_average', 0), 1), 'votes': d.get('vote_count', 0)}

pool = disc({'sort_by': 'vote_count.desc', 'primary_release_date.gte': '1970-01-01', 'primary_release_date.lte': TODAY,
             'vote_count.gte': POP_MIN_VOTES, 'vote_average.gte': POP_MIN_RATING}, 400)
C = sum(d['vote_average'] for d, _ in pool) / max(1, len(pool))
score = lambda d: (d['vote_count'] * d['vote_average'] + M * C) / (d['vote_count'] + M)
pool.sort(key=lambda x: (score(x[0]), x[0]['vote_count']), reverse=True)
popular = [entry('movie', d, p, dict(rate(d), score=round(score(d), 2))) for d, p in pool[:100]]
newest = [entry('movie', d, p, rate(d)) for d, p in disc({'sort_by': 'primary_release_date.desc', 'primary_release_date.gte': '2010-01-01',
          'primary_release_date.lte': TODAY, 'vote_count.gte': NEW_MIN_VOTES, 'vote_average.gte': NEW_MIN_RATING}, 100)]

T = json.load(open('data/titles.json'))
norm = lambda s: re.sub(r'[^a-z0-9]', '', s.lower())
for t in T:
    for k in ('featuredRank', 'popRank', 'score'): t.pop(k, None)
keep_ids = {e['tmdbId'] for e in popular + newest}
before = len(T)
T = [t for t in T if t.get('keep') or not (t.get('source') == 'tmdb' and t.get('type') == 'movie' and t.get('tmdbId') not in keep_ids
                          and ((t.get('rating') or 0) < NEW_MIN_RATING or (t.get('votes') or 0) < NEW_MIN_VOTES))]
pruned = before - len(T)
byT = {t['tmdbId']: t for t in T if t.get('tmdbId') and t.get('type') == 'movie'}
byN = {(norm(t['title']), t['year']): t for t in T}
ids = {t['id'] for t in T}
def place(lst, key):
    for i, e in enumerate(lst, 1):
        ex = byT.get(e['tmdbId']) or byN.get((norm(e['title']), e['year']))
        if ex:
            ex[key] = i; ex['rating'], ex['votes'] = e['rating'], e['votes']
            if 'score' in e: ex['score'] = e['score']
            continue
        e[key] = i; e['addedAt'] = TODAY
        while e['id'] in ids: e['id'] += '-2'
        ids.add(e['id']); T.append(e); byT[e['tmdbId']] = e; byN[(norm(e['title']), e['year'])] = e
place(popular, 'popRank'); place(newest, 'featuredRank')
json.dump(T, open('data/titles.json', 'w'), indent=2, ensure_ascii=False)
json.dump({'generated': TODAY, 'popular': {'minVotes': POP_MIN_VOTES, 'minRating': POP_MIN_RATING, 'm': M, 'C': round(C, 2), 'pool': len(pool)},
           'newest': {'minVotes': NEW_MIN_VOTES, 'minRating': NEW_MIN_RATING, 'count': len(newest)}}, open('data/meta.json', 'w'), indent=1)
print('pool', len(pool), 'C', round(C, 2), 'pruned', pruned, 'titles', len(T))
for e in popular[:10]: print('P', e['title'], e['year'], e['rating'], e['votes'], e['score'])
print('newest', len(newest), newest[-1]['releaseDate'] if newest else '-')
for e in newest[:5]: print('N', e['title'], e['releaseDate'], e['rating'], e['votes'])
