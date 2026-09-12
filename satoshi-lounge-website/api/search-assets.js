// /api/search-assets?type=crypto|stock&q=SUCHBEGRIFF
// Sucht nach Coins (CoinGecko, kostenlos) oder Aktien (Finnhub, mit Key) für "Mein Portfolio".

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const url = new URL(req.url, "http://internal");
    const type = url.searchParams.get("type");
    const q = (url.searchParams.get("q") || "").trim();

    if (!q || q.length < 2) {
      res.status(200).json({ results: [] });
      return;
    }
    if (type !== "crypto" && type !== "stock") {
      res.status(400).json({ error: "type muss 'crypto' oder 'stock' sein." });
      return;
    }

    if (type === "crypto") {
      const cgRes = await fetch("https://api.coingecko.com/api/v3/search?query=" + encodeURIComponent(q));
      if (!cgRes.ok) throw new Error("CoinGecko HTTP " + cgRes.status);
      const data = await cgRes.json();
      const results = (data.coins || []).slice(0, 8).map((c) => ({
        id: c.id,
        symbol: c.symbol.toUpperCase(),
        name: c.name,
        logo: c.thumb || null,
      }));
      res.status(200).json({ results });
    } else {
      const apiKey = process.env.FINNHUB_API_KEY;
      if (!apiKey) {
        res.status(500).json({ error: "Aktien-Suche ist noch nicht eingerichtet." });
        return;
      }
      const fhRes = await fetch("https://finnhub.io/api/v1/search?q=" + encodeURIComponent(q) + "&token=" + apiKey);
      if (!fhRes.ok) throw new Error("Finnhub HTTP " + fhRes.status);
      const data = await fhRes.json();
      // Nur "normale" Aktien anzeigen (keine Optionen/Fonds-Rauschen), auf 8 Treffer begrenzen.
      const results = (data.result || [])
        .filter((r) => r.type === "Common Stock" || r.type === "" || !r.type)
        .slice(0, 8)
        .map((r) => ({ id: r.symbol, symbol: r.symbol, name: r.description, logo: null }));
      res.status(200).json({ results });
    }
  } catch (err) {
    console.error("Suche fehlgeschlagen:", err.message);
    res.status(500).json({ error: "Suche aktuell nicht verfügbar." });
  }
};
