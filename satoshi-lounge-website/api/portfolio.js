// /api/portfolio  (GET, POST, DELETE)
// Verwaltet die "Mein Portfolio"-Einträge eines eingeloggten Nutzers.
// Erwartet im Header: Authorization: Bearer <supabase_access_token> (kommt vom Login im Frontend).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = "sb_publishable_a1-HGlNt2kqahcIlJzLOlA_6y3zf3SQ"; // öffentlicher Wert, siehe auth-config.js

const MAX_CRYPTO = 5;
const MAX_STOCK = 10;

// Prüft den mitgeschickten Login-Token bei Supabase und gibt die Nutzer-ID zurück (oder null).
async function getUserId(req) {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try {
    const res = await fetch(SUPABASE_URL + "/auth/v1/user", {
      headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + token },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.id || null;
  } catch (e) {
    return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "Portfolio-Dienst ist noch nicht eingerichtet." });
    return;
  }

  const userId = await getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Bitte zuerst anmelden." });
    return;
  }

  const dbHeaders = {
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
    "Content-Type": "application/json",
  };

  try {
    if (req.method === "GET") {
      const listRes = await fetch(
        SUPABASE_URL + "/rest/v1/user_portfolio?user_id=eq." + userId + "&select=asset_type,symbol,display_name,added_at&order=added_at.asc",
        { headers: dbHeaders }
      );
      const items = await listRes.json();
      res.status(200).json({ items });
      return;
    }

    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") body = JSON.parse(body || "{}");
      const { asset_type, symbol, display_name } = body || {};
      if (!asset_type || !symbol || !display_name || !["crypto", "stock"].includes(asset_type)) {
        res.status(400).json({ error: "Ungültige Angaben." });
        return;
      }

      // Aktuelle Anzahl dieses Typs prüfen, bevor hinzugefügt wird.
      const countRes = await fetch(
        SUPABASE_URL + "/rest/v1/user_portfolio?user_id=eq." + userId + "&asset_type=eq." + asset_type + "&select=symbol",
        { headers: dbHeaders }
      );
      const existing = await countRes.json();
      const limit = asset_type === "crypto" ? MAX_CRYPTO : MAX_STOCK;
      if (Array.isArray(existing) && existing.length >= limit) {
        res.status(400).json({ error: "Maximal " + limit + " " + (asset_type === "crypto" ? "Kryptowährungen" : "Aktien") + " möglich." });
        return;
      }

      const insertRes = await fetch(SUPABASE_URL + "/rest/v1/user_portfolio", {
        method: "POST",
        headers: { ...dbHeaders, "Prefer": "return=minimal" },
        body: JSON.stringify({ user_id: userId, asset_type, symbol, display_name }),
      });
      if (!insertRes.ok && insertRes.status !== 409) {
        const errText = await insertRes.text();
        throw new Error("Insert fehlgeschlagen: " + errText);
      }
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === "DELETE") {
      let body = req.body;
      if (typeof body === "string") body = JSON.parse(body || "{}");
      const { asset_type, symbol } = body || {};
      if (!asset_type || !symbol) {
        res.status(400).json({ error: "Ungültige Angaben." });
        return;
      }
      const delRes = await fetch(
        SUPABASE_URL + "/rest/v1/user_portfolio?user_id=eq." + userId + "&asset_type=eq." + asset_type + "&symbol=eq." + encodeURIComponent(symbol),
        { method: "DELETE", headers: dbHeaders }
      );
      if (!delRes.ok) throw new Error("Löschen fehlgeschlagen");
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: "Methode nicht erlaubt." });
  } catch (err) {
    console.error("Portfolio-Aktion fehlgeschlagen:", err.message);
    res.status(500).json({ error: "Aktion aktuell nicht möglich." });
  }
};
