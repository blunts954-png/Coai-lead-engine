// api/enrich.js — COAI Lead Engine Contact Enrichment
// Scrapes websites for emails, phones, and high-signal numeric values.
// Uses a hybrid strategy: raw HTML first, optional headless render fallback.

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

  const result = {
    email: null,
    phone: null,
    source: null,
    emails: [],
    phones: [],
    phone_records: [],
    numbers: [],
    pages_scanned: [],
    render_used_on: [],
    extraction_notes: []
  };

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
  const fallbackPhoneRegex = /(?:\+\d{1,3}[\s.\-]?)?(?:\(?\d{2,4}\)?[\s.\-]?){2,5}\d{2,4}/g;
  const numberRegex = /\b(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\b/g;

  // Domains to ignore in email matches
  const ignoreEmailDomains = [
    'sentry.io','googleapis.com','gstatic.com','facebook.com',
    'twitter.com','instagram.com','tiktok.com','youtube.com',
    'example.com','schema.org','w3.org','cloudflare.com',
    'jquery.com','wordpress.com','wix.com','squarespace.com'
  ];

  const seenEmails = new Set();
  const seenPhones = new Set(); // e164 or normalized fallback key
  const seenNumbers = new Set();

  for (const pageUrl of pagesToCheck) {

    try {
      const fetched = await fetchPageContent(pageUrl);
      if (!fetched.ok) continue;

      let html = fetched.html || '';
      if (!html) continue;

      if (shouldAttemptRenderedFetch(html)) {
        const rendered = await fetchRenderedHtml(pageUrl);
        if (rendered.ok && rendered.html) {
          html = rendered.html;
          result.render_used_on.push(pageUrl);
        } else if (rendered.error) {
          result.extraction_notes.push(`Render fallback failed for ${pageUrl}: ${rendered.error}`);
        }
      }

      result.pages_scanned.push(pageUrl);
      const textOnly = htmlToText(html);

      // ── Extract emails ──
      // Priority 1: mailto: links
      const mailtoMatches = html.match(/mailto:([^"'?\s>]+)/gi) || [];
      for (const m of mailtoMatches) {
        const email = m.replace(/^mailto:/i, '').split('?')[0].toLowerCase();
        if (isValidBusinessEmail(email, ignoreEmailDomains) && !seenEmails.has(email)) {
          seenEmails.add(email);
          result.emails.push(email);
          if (!result.email) {
            result.email = email;
            result.source = pageUrl;
          }
        }
      }

      // Priority 2: text pattern scan
      const textEmails = textOnly.match(emailRegex) || [];
      for (const email of textEmails) {
        const lower = email.toLowerCase();
        if (isValidBusinessEmail(lower, ignoreEmailDomains) && !seenEmails.has(lower)) {
          seenEmails.add(lower);
          result.emails.push(lower);
          if (!result.email) {
            result.email = lower;
            result.source = pageUrl;
          }
        }
      }

      // Priority 3: obfuscated emails in body text
      const obfuscatedEmails = decodeObfuscatedEmails(textOnly);
      for (const email of obfuscatedEmails) {
        if (isValidBusinessEmail(email, ignoreEmailDomains) && !seenEmails.has(email)) {
          seenEmails.add(email);
          result.emails.push(email);
          if (!result.email) {
            result.email = email;
            result.source = pageUrl;
          }
        }
      }

      // ── Extract phones ──
      // Priority 1: tel: links
      const telMatches = html.match(/tel:([+\d\s()\-\.]+)/gi) || [];
      for (const m of telMatches) {
        const raw = m.replace(/^tel:/i, '').trim();
        const normalized = normalizePhone(raw);
        if (normalized && !seenPhones.has(normalized.key)) {
          seenPhones.add(normalized.key);
          result.phones.push(normalized.display);
          result.phone_records.push(normalized.record);
          if (!result.phone) result.phone = normalized.display;
        }
      }

      // Priority 2: text phone extraction (international)
      const parsedPhones = extractPhonesFromText(textOnly);
      for (const normalized of parsedPhones) {
        if (!seenPhones.has(normalized.key)) {
          seenPhones.add(normalized.key);
          result.phones.push(normalized.display);
          result.phone_records.push(normalized.record);
          if (!result.phone) result.phone = normalized.display;
        }
      }

      // ── Extract all other numeric values ──
      const numericMatches = textOnly.match(numberRegex) || [];
      for (const value of numericMatches) {
        const normalized = normalizeNumber(value);
        if (!normalized) continue;
        if (seenNumbers.has(normalized)) continue;

        // Skip numbers already represented as phones to reduce noise.
        if (looksLikePhoneDigits(normalized)) continue;

        seenNumbers.add(normalized);
        result.numbers.push(normalized);
      }

    } catch (e) {
      // Page unreachable or timed out — move to next
      continue;
    }
  }

  return res.status(200).json(result);
};

function isValidBusinessEmail(email, ignoreEmailDomains) {
  if (!email || !email.includes('@')) return false;
  if (email.includes('noreply')) return false;
  return !ignoreEmailDomains.some(domain => email.endsWith(domain));
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeNumber(raw) {
  if (!raw) return null;
  const normalized = raw.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  if (normalized.length < 2) return null; // remove low-signal single digits
  return normalized;
}

function decodeObfuscatedEmails(text) {
  const candidates = new Set();
  const normalized = text
    .replace(/\s*\[(at|@)\]\s*/gi, '@')
    .replace(/\s*\((at|@)\)\s*/gi, '@')
    .replace(/\s+\bat\b\s+/gi, '@')
    .replace(/\s*\[(dot|\.)\]\s*/gi, '.')
    .replace(/\s*\((dot|\.)\)\s*/gi, '.')
    .replace(/\s+\bdot\b\s+/gi, '.')
    .replace(/\s*\{at\}\s*/gi, '@')
    .replace(/\s*\{dot\}\s*/gi, '.');

  const emails = normalized.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [];
  for (const email of emails) candidates.add(email.toLowerCase());
  return [...candidates];
}

function looksLikePhoneDigits(value) {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

function normalizePhone(raw) {
  const parser = getPhoneParser();
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;

  if (parser?.parsePhoneNumberFromString) {
    const parsed = parser.parsePhoneNumberFromString(trimmed, 'US');
    if (parsed?.isValid()) {
      return {
        key: parsed.number,
        display: parsed.formatInternational(),
        record: {
          raw: trimmed,
          e164: parsed.number,
          international: parsed.formatInternational(),
          national: parsed.formatNational(),
          country: parsed.country || null
        }
      };
    }
  }

  // Fallback without library: keep plausible digit strings.
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  const plus = trimmed.trim().startsWith('+') ? '+' : '';
  const key = plus + digits;
  return {
    key,
    display: plus + digits,
    record: {
      raw: trimmed,
      e164: key,
      international: plus + digits,
      national: digits,
      country: null
    }
  };
}

function extractPhonesFromText(text) {
  const parser = getPhoneParser();

  if (parser?.findPhoneNumbersInText) {
    try {
      const matches = parser.findPhoneNumbersInText(text, 'US');
      return matches
        .map(m => m.number)
        .filter(n => n && n.isValid && n.isValid())
        .map(n => ({
          key: n.number,
          display: n.formatInternational(),
          record: {
            raw: n.number,
            e164: n.number,
            international: n.formatInternational(),
            national: n.formatNational(),
            country: n.country || null
          }
        }));
    } catch {
      // Fallback below.
    }
  }

  const fallbackMatches = text.match(fallbackPhoneRegex) || [];
  return fallbackMatches
    .map(normalizePhone)
    .filter(Boolean);
}

function shouldAttemptRenderedFetch(html) {
  const text = htmlToText(html);
  const hasLowTextSignal = text.length < 400;
  const scriptCount = (html.match(/<script/gi) || []).length;
  const appearsSpa = /id=["'](__next|root|app)["']/i.test(html) || /window\.__/i.test(html);
  const hasNoDirectContacts = !/mailto:|tel:/i.test(html) && !/@/.test(text);
  return (hasLowTextSignal && scriptCount > 4) || appearsSpa || hasNoDirectContacts;
}

async function fetchPageContent(url) {
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(9000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ContactScraper/2.0)',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });
    if (!resp.ok) return { ok: false, status: resp.status };
    const html = await resp.text();
    return { ok: true, html };
  } catch (error) {
    return { ok: false, error: error?.message || 'Fetch failed' };
  }
}

async function fetchRenderedHtml(url) {
  const deps = getHeadlessDeps();
  if (!deps) return { ok: false, error: 'Headless deps not installed' };

  const { chromium, puppeteer } = deps;
  let browser = null;

  try {
    const executablePath = await chromium.executablePath();
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (compatible; ContactScraper-Render/2.0)');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    const html = await page.content();
    return { ok: true, html };
  } catch (error) {
    return { ok: false, error: error?.message || 'Render failed' };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore close errors
      }
    }
  }
}

function getPhoneParser() {
  try {
    // eslint-disable-next-line global-require
    return require('libphonenumber-js/max');
  } catch {
    return null;
  }
}

function getHeadlessDeps() {
  try {
    // eslint-disable-next-line global-require
    const chromium = require('@sparticuz/chromium');
    // eslint-disable-next-line global-require
    const puppeteer = require('puppeteer-core');
    return { chromium, puppeteer };
  } catch {
    return null;
  }
}
