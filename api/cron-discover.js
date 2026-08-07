// api/cron-discover.js — hourly lead discovery orchestrator
const { query, initSchema, seedMarkets } = require('../lib/db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const authToken = req.headers.authorization;
  if (authToken !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await initSchema();
    await seedMarkets();

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    const appPassword = process.env.APP_PASSWORD;
    if (!apiKey || !appPassword) {
      return res.status(500).json({ error: 'Missing API keys' });
    }

    const marketsResult = await query('SELECT * FROM markets WHERE active = true');
    const markets = marketsResult.rows;

    let discovered = 0;
    let duplicates = 0;

    for (const market of markets) {
      try {
        const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(market.search_term)}&key=${apiKey}`;
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();

        if (!searchData.results) continue;

        for (const place of searchData.results) {
          const phoneDigits = (place.formatted_phone_number || '').replace(/\D/g, '').slice(-10);

          const checkDupe = await query(
            'SELECT id FROM leads WHERE market_id = $1 AND phone_normalized = $2 LIMIT 1',
            [market.id, phoneDigits]
          );

          if (checkDupe.rows.length > 0) {
            duplicates++;
            continue;
          }

          await query(
            `INSERT INTO leads (
              market_id, name, phone, address, city, rating, reviews_count,
              maps_url, business_status, pipeline_stage, phone_normalized
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT DO NOTHING`,
            [
              market.id,
              place.name,
              place.formatted_phone_number || null,
              place.formatted_address || null,
              (place.formatted_address || '').split(',')[1]?.trim() || null,
              place.rating || null,
              place.user_ratings_total || 0,
              place.url || null,
              place.business_status || 'OPERATIONAL',
              'discovered',
              phoneDigits || null
            ]
          );
          discovered++;
        }
      } catch (err) {
        console.error(`Error discovering in market ${market.name}:`, err.message);
      }
    }

    res.status(200).json({ status: 'OK', discovered, duplicates, markets: markets.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
