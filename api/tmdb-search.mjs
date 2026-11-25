// "Request a title": search TMDB (server-side key) and report whether each match is free (US, ads/free) on an allowed service.
const OK = { 'Tubi TV': 'Tubi', 'Pluto TV': 'Pluto TV', Plex: 'Plex', 'Plex Channel': 'Plex', 'Fandango at Home Free': 'Fandango at Home', 'YouTube Free': 'YouTube' };
async function tm(path, params = {}) {
  const token = process.env.TMDB_READ_TOKEN || process.env.tmdb_read_token, key = process.env.TMDB_API_KEY;
  const u = new URL(`https://api.themoviedb.org/3${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  if (!token) u.searchParams.set('api_key', key);
  const r = await fetch(u, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
  if (!r.ok) throw new Error(`TMDB ${r.status}`);
  return r.json();
}
export default async function handler(req, res) {
  const q = String(req.query.q || '').trim().slice(0, 80);
  if (q.length < 2) return res.status(400).json({ error: 'query too short' });
  if (!process.env.TMDB_READ_TOKEN && !process.env.tmdb_read_token && !process.env.TMDB_API_KEY) return res.status(503).json({ error: 'search unavailable' });
  try {
    const s = await tm('/search/multi', { query: q, include_adult: 'false', region: 'US' });
    const hits = (s.results || []).filter((r) => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 8);
    const results = await Promise.all(hits.map(async (h) => {
      const p = await tm(`/${h.media_type}/${h.id}/watch/providers`).catch(() => ({}));
      const us = p.results?.US || {};
      const free = [...new Set([...(us.free || []), ...(us.ads || [])].map((x) => OK[x.provider_name]).filter(Boolean))];
      const date = h.release_date || h.first_air_date || '';
      return { tmdbId: h.id, kind: h.media_type, title: h.title || h.name, year: date.slice(0, 4), free,
        url: `https://www.themoviedb.org/${h.media_type}/${h.id}/watch?locale=US`,
        image: h.poster_path ? `https://image.tmdb.org/t/p/w342${h.poster_path}` : null };
    }));
    res.setHeader('Cache-Control', 'public, s-maxage=21600');
    return res.status(200).json({ results });
  } catch { return res.status(502).json({ error: 'search failed' }); }
}
