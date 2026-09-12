// /api/stock-news?symbol=AMZN
// Liefert aktuelle Unternehmens-News zu einer Aktie von Finnhub.

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=900, s-maxage=900");

  try {
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "Aktien-Dienst ist noch nicht eingerichtet." });
      return;
    }

    const url = new URL(req.url, "http://internal");
    const symbol = (url.searchParams.get("symbol") || "").trim();
    if (!symbol) {
      res.status(400).json({ error: "Kein Symbol angegeben." });
      return;
    }

    const toStr = new Date().toISOString().slice(0, 10);
    const fromStr = new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10); // letzte 3 Wochen

    const newsRes = await fetch(
      "https://finnhub.io/api/v1/company-news?symbol=" + encodeURIComponent(symbol) + "&from=" + fromStr + "&to=" + toStr + "&token=" + apiKey
    );
    if (!newsRes.ok) throw new Error("Finnhub HTTP " + newsRes.status);
    const data = await newsRes.json();

    const items = (Array.isArray(data) ? data : [])
      .slice(0, 8)
      .map((n) => ({ title: n.headline, url: n.url, source: n.source, publishedOn: n.datetime }));

    res.status(200).json({ items });
  } catch (err) {
    console.error("Aktien-News konnten nicht geladen werden:", err.message);
    res.status(500).json({ error: "News aktuell nicht verfügbar." });
  }
};
