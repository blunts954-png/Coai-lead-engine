// api/enrich.js — COAI Lead Engine Contact Enrichment
// Scrapes a business website for phone numbers and email addresses
// Called automatically after each Google Places result

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // AUTH
  const MASTER_PASSWORD = process.env.APP_PASSWORD || 'COAI-GOD-MODE-2026';
  if (req.headers['authorization'] !== MASTER_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url param required' });

  // Normalize URL
  let targetUrl = url;
  if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;

  const result = { email: null, phone: null, source: null };

  // Pages to check in order of likelihood
  const pagesToCheck = [
    targetUrl,
    targetUrl.replace(/\/$/, '') + '/contact',
    targetUrl.replace(/\/$/, '') + '/contact-us',
    targetUrl.replace(/\/$/, '') + '/about',
    targetUrl.replace(/\/$/, '') + '/about-us',
  ];

  // Regex patterns
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const phoneRegex = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/g;

  // Domains to ignore in email matches
  const ignoreEmailDomains = [
    'sentry.io','googleapis.com','gstatic.com','facebook.com',
    'twitter.com','instagram.com','tiktok.com','youtube.com',
    'example.com','schema.org','w3.org','cloudflare.com',
    'jquery.com','wordpress.com','wix.com','squarespace.com'
  ];

  for (const pageUrl of pagesToCheck) {
    if (result.email && result.phone) break; // got both, stop

    try {
      const resp = await fetch(pageUrl, {
        signal: AbortSignal.timeout(6000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ContactScraper/1.0)',
          'Accept': 'text/html'
        }
      });

      if (!resp.ok) continue;

      const html = await resp.text();

      // ── Extract emails ──
      if (!result.email) {
        // Priority 1: mailto: links
        const mailtoMatches = html.match(/mailto:([^"'?\s>]+)/gi) || [];
        for (const m of mailtoMatches) {
          const email = m.replace(/^mailto:/i, '').split('?')[0].toLowerCase();
          if (email.includes('@') && !ignoreEmailDomains.some(d => email.endsWith(d))) {
            result.email = email;
            result.source = pageUrl;
            break;
          }
        }

        // Priority 2: text pattern scan
        if (!result.email) {
          const textEmails = html.match(emailRegex) || [];
          for (const email of textEmails) {
            const lower = email.toLowerCase();
            if (!ignoreEmailDomains.some(d => lower.endsWith(d)) && !lower.includes('noreply')) {
              result.email = lower;
              result.source = pageUrl;
              break;
            }
          }
        }
      }

      // ── Extract phones ──
      if (!result.phone) {
        // Priority 1: tel: links
        const telMatches = html.match(/tel:([+\d\s()\-\.]+)/gi) || [];
        for (const m of telMatches) {
          const raw = m.replace(/^tel:/i, '').trim();
          const digits = raw.replace(/\D/g, '');
          if (digits.length === 10 || (digits.length === 11 && digits[0] === '1')) {
            result.phone = formatPhone(digits);
            break;
          }
        }

        // Priority 2: text pattern scan
        if (!result.phone) {
          const textPhones = html.match(phoneRegex) || [];
          for (const p of textPhones) {
            const digits = p.replace(/\D/g, '');
            if (digits.length === 10 || (digits.length === 11 && digits[0] === '1')) {
              result.phone = formatPhone(digits);
              break;
            }
          }
        }
      }

    } catch (e) {
      // Page unreachable or timed out — move to next
      continue;
    }
  }

  return res.status(200).json(result);
};

function formatPhone(digits) {
  const d = digits.length === 11 ? digits.slice(1) : digits;
  return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
}
