// /api/validate-giftcard
// Read-only Prüfung: existiert der Code, ist er noch aktiv, wie viel Guthaben ist noch drauf?
// Löst NICHTS ein — das passiert erst nach erfolgreicher Zahlung im Webhook. Wird vom Warenkorb
// aufgerufen, sobald jemand auf "Anwenden" klickt, um sofort Feedback zu geben.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.SITE_URL || "https://www.satoshi-lounge.com";

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", SITE_URL);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ valid: false, error: "Gutschein-Prüfung derzeit nicht verfügbar." });
    return;
  }

  try {
    const body = req.body || {};
    const code = (body.code || "").trim().toUpperCase();
    if (!code) { res.status(400).json({ valid: false, error: "Bitte einen Code eingeben." }); return; }

    const sbRes = await fetch(
      SUPABASE_URL + "/rest/v1/gift_cards?code=eq." + encodeURIComponent(code) + "&select=code,remaining_amount_cents,status",
      {
        headers: {
          "apikey": SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
        },
      }
    );
    if (!sbRes.ok) throw new Error("Supabase HTTP " + sbRes.status);
    const rows = await sbRes.json();
    const giftCard = rows && rows[0];

    if (!giftCard || giftCard.status !== "active" || giftCard.remaining_amount_cents <= 0) {
      res.status(200).json({ valid: false, error: "Dieser Gutscheincode ist ungültig oder bereits aufgebraucht." });
      return;
    }

    res.status(200).json({ valid: true, code: giftCard.code, remainingCents: giftCard.remaining_amount_cents });
  } catch (err) {
    console.error(err);
    res.status(500).json({ valid: false, error: "Gutschein konnte nicht geprüft werden." });
  }
};
