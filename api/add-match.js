// /api/add-match.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // server-only
);

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { password, week, bowler1, scores1, bowler2, scores2 } = req.body || {};

    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid admin password' });
    }

    const w = parseInt(week, 10);
    const s1 = Array.isArray(scores1) ? scores1.map(Number) : [];
    const s2 = Array.isArray(scores2) ? scores2.map(Number) : [];

    if (!bowler1 || !bowler2 || !Number.isInteger(w) ||
        s1.length !== 3 || s2.length !== 3 || s1.some(isNaN) || s2.some(isNaN)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const { error } = await supabase.from('matches').insert({
      week: w, bowler1, scores1: s1, bowler2, scores2: s2
    });

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
}
