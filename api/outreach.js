// api/outreach.js — COAI Lead Engine AI Outreach Generator
// Calls Claude (claude-haiku) to write a personalized pitch based on the lead's specific signals.
//
// Environment variables required:
//   APP_PASSWORD        — same shared key used by search + enrich
//   ANTHROPIC_API_KEY   — your Anthropic API key (optional; falls back to static template if missing)
//
// Method: POST
// Body:   { lead: <LeadObject>, type: 'text' | 'email' | 'voicemail' }
// Returns: { message: string, aiGenerated: boolean }

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // AUTH
  const MASTER_PASSWORD = process.env.APP_PASSWORD;
  if (!MASTER_PASSWORD) {
    return res.status(500).json({ error: 'Server misconfiguration: APP_PASSWORD not set in environment.' });
  }
  if (req.headers['authorization'] !== MASTER_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // If no Anthropic key, signal fallback — frontend will use static template
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) {
    return res.status(200).json({ fallback: true, reason: 'ANTHROPIC_API_KEY not configured — using static template.' });
  }

  // Parse body
  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON body.' });
  }

  const { lead, type } = body;
  if (!lead || !type) return res.status(400).json({ error: 'lead and type are required.' });

  // Build a clear signal summary from the lead data
  const signals = [];
  if (!lead.hasWebsite)                          signals.push('no website on Google Maps');
  if (lead.rating > 0 && lead.rating < 3.5)     signals.push(`only ${lead.rating} stars on Google`);
  if (lead.rating === 0)                         signals.push('zero star rating on Google');
  if (lead.reviews === 0)                        signals.push('zero customer reviews');
  else if (lead.reviews < 10)                    signals.push(`only ${lead.reviews} customer reviews`);
  if (!lead.hasPhone)                            signals.push('no phone number listed on Google');
  const signalSummary = signals.length > 0 ? signals.join('; ') : 'digital presence that could be stronger';

  const formatInstructions = {
    text:      'Write a SHORT text message / DM (max 90 words). Casual, direct, one clear ask at the end.',
    email:     'Write a cold email. Include a Subject: line first. Body = 3 paragraphs max. Professional but human tone. End with one clear ask.',
    voicemail: 'Write a voicemail script (~120 words, reads in under 60 seconds). Say the callback number (661) 610-9198 twice — once in the middle and once at the end.'
  };

  const prompt = `You are writing outreach ON BEHALF OF Jason Manuel, founder of Chaotically Organized AI (chaoticallyorganizedai.com), based in Bakersfield, CA 93301.

Jason's value proposition: He builds fully sovereign websites and AI lead-capture systems for local service businesses. Starting at $1,200. Client owns everything outright — no monthly platform fees, no Wix, no rented land. He has a trades background (13 years in construction) so he speaks plain.

TARGET BUSINESS:
Name: ${lead.name}
Industry: ${lead.cat}
Location: ${lead.address || 'Bakersfield area'}
Their Specific Problems: ${signalSummary}

TASK: ${formatInstructions[type] || formatInstructions.text}

RULES:
- Reference THEIR specific problem using the signals above — make it feel personal, not generic
- Write from Jason's voice: direct, no fluff, no corporate speak
- Never open with "I hope this finds you well" or any similar filler
- Never say "I understand" or "That's great"
- Sound like a fellow local business owner, not a vendor
- Jason's phone: (661) 610-9198
- Jason's website: chaoticallyorganizedai.com
- Jason's address (for email only): 1712 19th St #216, Bakersfield CA 93301

OUTPUT: The message text only. No preamble, no quotes, no explanation.`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await resp.json();

    if (!resp.ok || !data.content?.[0]?.text) {
      // AI call failed — signal fallback to frontend
      return res.status(200).json({
        fallback: true,
        reason: data.error?.message || 'AI generation failed — using static template.'
      });
    }

    return res.status(200).json({
      message: data.content[0].text.trim(),
      aiGenerated: true
    });

  } catch (err) {
    return res.status(200).json({ fallback: true, reason: err.message });
  }
}
