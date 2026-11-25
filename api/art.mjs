// Optional TMDB enrichment (env-gated stub). Reads env at RUNTIME:
//   TMDB_READ_TOKEN or tmdb_read_token (v4 read token, Bearer) preferred; TMDB_API_KEY (v3, ?api_key=) only if the token is missing.
// Not set -> { active: false } and the site shows no TMDB credit. Vercel needs a redeploy after adding env vars.
import fs from 'node:fs';
import path from 'node:path';
export default async function handler(req, res) {
  const token = process.env.TMDB_READ_TOKEN || process.env.tmdb_read_token, key = process.env.TMDB_API_KEY;
  if (!token && !key) { res.setHeader('Cache-Control', 'public, s-maxage=3600'); return res.status(200).json({ active: false }); }
  const titles = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'titles.json'), 'utf8'));
  const tm = async (p, q) => {
    const u = new URL(`https://api.themoviedb.org/3${p}`);
    Object.entries(q).forEach(([k, v]) => u.searchParams.set(k, v));
    if (!token) u.searchParams.set('api_key', key);
    const r = await fetch(u, { headers: token ? { Authorization: `Bearer ${token}`, accept: 'application/json' } : { accept: 'application/json' } });
    return r.ok ? r.json() : null;
  };
  const art = {};
  const q = [...titles];
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (q.length) {
      const t = q.shift();
      try {
        const tv = t.type === 'tv';
        const j = await tm(tv ? '/search/tv' : '/search/movie', { query: t.title.replace(/\s*\(.*?\)\s*/g, ' ').trim(), ...(tv ? { first_air_date_year: t.year } : { year: t.year }) });
        const hit = j?.results?.[0];
        if (hit) art[t.id] = { poster: hit.poster_path ? `https://image.tmdb.org/t/p/w342${hit.poster_path}` : null, releaseDate: hit.release_date || hit.first_air_date || null, tmdbId: hit.id };
      } catch {}
    }
  }));
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
  return res.status(200).json({ active: true, art });
}
