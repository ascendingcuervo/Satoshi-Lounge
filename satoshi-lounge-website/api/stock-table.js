// /api/stock-table?symbols=AMZN,META,MSFT
// Liefert Preis + Logo für mehrere Aktien auf einmal (für die Wachstums-/Dividenden-Tabelle).
// Läuft server-seitig, damit der Finnhub-Key niemals im Browser sichtbar wird.

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  // 5 Min Cache: reicht für eine "aktuelle" Anzeige, ohne bei jedem Besuch alle Symbole neu abzurufen.
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");

  try {
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "Aktien-Dienst ist noch nicht eingerichtet." });
      return;
    }

    const url = new URL(req.url, "http://internal");
    const symbolsParam = url.searchParams.get("symbols") || "";
    const symbols = symbolsParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (!symbols.length) {
      res.status(400).json({ error: "Keine Symbole angegeben." });
      return;
    }

    const results = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const [quoteRes, profileRes] = await Promise.all([
            fetch("https://finnhub.io/api/v1/quote?symbol=" + encodeURIComponent(symbol) + "&token=" + apiKey),
            fetch("https://finnhub.io/api/v1/stock/profile2?symbol=" + encodeURIComponent(symbol) + "&token=" + apiKey),
          ]);
          const quote = await quoteRes.json();
          const profile = await profileRes.json();

          // Finnhub liefert bei unbekannten/nicht abgedeckten Symbolen ein leeres Objekt statt eines Fehlers.
          if (quote.c == null || quote.c === 0) {
            return { symbol, ok: false };
          }

          return {
            symbol,
            ok: true,
            name: profile.name || symbol,
            logo: profile.logo || null,
            price: quote.c,
            change: quote.d,
            changePercent: quote.dp,
            currency: profile.currency || "USD",
          };
        } catch (e) {
          return { symbol, ok: false };
        }
      })
    );

    res.status(200).json({ stocks: results });
  } catch (err) {
    console.error("Aktien-Tabelle konnte nicht geladen werden:", err.message);
    res.status(500).json({ error: "Daten aktuell nicht verfügbar." });
  }
};
