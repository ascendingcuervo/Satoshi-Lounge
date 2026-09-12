// /api/stock-detail?symbol=AMZN&category=growth  (category: "growth" oder "dividend")
// Liefert Kurs, Logo und den nächsten relevanten Termin (Earnings bei Wachstumsaktien,
// Dividendentermin bei Dividendenaktien) für eine einzelne Aktie.

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
    const category = url.searchParams.get("category") === "dividend" ? "dividend" : "growth";
    if (!symbol) {
      res.status(400).json({ error: "Kein Symbol angegeben." });
      return;
    }

    const [quoteRes, profileRes] = await Promise.all([
      fetch("https://finnhub.io/api/v1/quote?symbol=" + encodeURIComponent(symbol) + "&token=" + apiKey),
      fetch("https://finnhub.io/api/v1/stock/profile2?symbol=" + encodeURIComponent(symbol) + "&token=" + apiKey),
    ]);
    const quote = await quoteRes.json();
    const profile = await profileRes.json();

    if (quote.c == null || quote.c === 0) {
      res.status(200).json({ ok: false, error: "Für dieses Symbol liegen aktuell keine Kursdaten vor." });
      return;
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const futureStr = new Date(Date.now() + 200 * 86400000).toISOString().slice(0, 10);
    const pastStr = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

    let nextEvent = null;
    try {
      if (category === "growth") {
        const earnRes = await fetch(
          "https://finnhub.io/api/v1/calendar/earnings?from=" + todayStr + "&to=" + futureStr + "&symbol=" + encodeURIComponent(symbol) + "&token=" + apiKey
        );
        const earnData = await earnRes.json();
        const upcoming = (earnData.earningsCalendar || [])
          .filter((e) => e.date >= todayStr)
          .sort((a, b) => (a.date > b.date ? 1 : -1));
        if (upcoming.length) {
          nextEvent = { type: "earnings", date: upcoming[0].date };
        }
      } else {
        const divRes = await fetch(
          "https://finnhub.io/api/v1/stock/dividend?symbol=" + encodeURIComponent(symbol) + "&from=" + pastStr + "&to=" + futureStr + "&token=" + apiKey
        );
        const divData = await divRes.json();
        const list = Array.isArray(divData) ? divData : [];
        const upcoming = list
          .filter((d) => (d.payDate || d.date) >= todayStr)
          .sort((a, b) => ((a.payDate || a.date) > (b.payDate || b.date) ? 1 : -1));
        if (upcoming.length) {
          nextEvent = { type: "dividend", date: upcoming[0].payDate || upcoming[0].date, amount: upcoming[0].amount };
        }
      }
    } catch (e) {
      // Termin konnte nicht geladen werden — kein Abbruch, Seite zeigt Preis trotzdem an.
      nextEvent = null;
    }

    res.status(200).json({
      ok: true,
      symbol,
      name: profile.name || symbol,
      logo: profile.logo || null,
      price: quote.c,
      change: quote.d,
      changePercent: quote.dp,
      currency: profile.currency || "USD",
      nextEvent,
    });
  } catch (err) {
    console.error("Aktien-Detail konnte nicht geladen werden:", err.message);
    res.status(500).json({ error: "Daten aktuell nicht verfügbar." });
  }
};
