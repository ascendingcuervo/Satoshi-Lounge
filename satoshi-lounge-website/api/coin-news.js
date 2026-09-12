// /api/coin-news?symbol=BTC
// Holt aktuelle News zu einem Coin von CryptoCompare — läuft server-seitig, damit der
// API-Key niemals im Browser/Quelltext sichtbar wird.

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  // 15 Min Cache: News müssen nicht sekundengenau sein, spart unnötige Abrufe.
  res.setHeader("Cache-Control", "public, max-age=900, s-maxage=900");

  try {
    const url = new URL(req.url, "http://internal");
    const symbol = (url.searchParams.get("symbol") || "").toUpperCase();
    if (!/^[A-Z0-9]+$/.test(symbol)) {
      res.status(400).json({ error: "Ungültiges oder fehlendes Symbol." });
      return;
    }

    const apiKey = process.env.CRYPTOCOMPARE_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "News-Dienst ist noch nicht eingerichtet." });
      return;
    }

    const ccRes = await fetch(
      "https://min-api.cryptocompare.com/data/v2/news/?categories=" + encodeURIComponent(symbol) + "&lang=EN&api_key=" + apiKey
    );
    if (!ccRes.ok) throw new Error("CryptoCompare HTTP " + ccRes.status);
    const data = await ccRes.json();

    const items = (data.Data || []).slice(0, 8).map((n) => ({
      title: n.title,
      url: n.url,
      source: n.source_info && n.source_info.name ? n.source_info.name : n.source,
      publishedOn: n.published_on,
    }));

    res.status(200).json({ items });
  } catch (err) {
    console.error("Coin-News konnten nicht geladen werden:", err.message);
    res.status(500).json({ error: "News aktuell nicht verfügbar." });
  }
};
