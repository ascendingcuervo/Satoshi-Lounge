// /api/fred-series?id=SERIES_ID
// Liefert eine beliebige öffentliche FRED-Datenreihe (z.B. DFEDTARU, DFEDTARL) als JSON.
// Nutzt den öffentlichen FRED-CSV-Download (kein API-Key nötig) — wird server-seitig
// abgerufen, weil FRED von Browsern aus (CORS) nicht direkt erreichbar ist.

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  // 12h Cache: Leitzins-Daten ändern sich nur bei tatsächlichen Fed-Entscheidungen.
  res.setHeader("Cache-Control", "public, max-age=43200, s-maxage=43200");

  try {
    const url = new URL(req.url, "http://internal");
    const seriesId = url.searchParams.get("id") || "";
    if (!/^[A-Za-z0-9_]+$/.test(seriesId)) {
      res.status(400).json({ error: "Ungültige oder fehlende Serien-ID." });
      return;
    }

    const response = await fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=" + encodeURIComponent(seriesId));
    if (!response.ok) throw new Error("FRED HTTP " + response.status);
    const csvText = await response.text();

    const lines = csvText.trim().split("\n");
    const points = [];
    for (let i = 1; i < lines.length; i++) {
      const [dateStr, valueStr] = lines[i].split(",");
      if (!dateStr || !valueStr || valueStr === ".") continue;
      const t = new Date(dateStr + "T00:00:00Z").getTime();
      const value = parseFloat(valueStr);
      if (!isNaN(t) && !isNaN(value)) points.push({ t, value });
    }

    if (!points.length) throw new Error("Keine gültigen Datenpunkte für " + seriesId);
    res.status(200).json({ points });
  } catch (err) {
    console.error("FRED-Serie konnte nicht geladen werden:", err.message);
    res.status(500).json({ error: "Daten aktuell nicht verfügbar." });
  }
};
