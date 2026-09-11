// /api/m2-data
// Liefert die US-Geldmenge M2 (monatlich, in Mrd. USD) für den Chart-Indikator.
// Nutzt den öffentlichen FRED-CSV-Download (kein API-Key nötig) — wird server-seitig
// abgerufen, weil FRED von Browsern aus (CORS) nicht direkt erreichbar ist.

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  // 12h Cache: M2-Daten aktualisieren sich nur einmal im Monat, kein Grund für häufigeres Abrufen.
  res.setHeader("Cache-Control", "public, max-age=43200, s-maxage=43200");

  try {
    const response = await fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=M2SL");
    if (!response.ok) throw new Error("FRED HTTP " + response.status);
    const csvText = await response.text();

    const lines = csvText.trim().split("\n");
    const points = [];
    // Erste Zeile ist der Header ("DATE,M2SL") — ab Zeile 2 folgen die eigentlichen Werte.
    for (let i = 1; i < lines.length; i++) {
      const [dateStr, valueStr] = lines[i].split(",");
      if (!dateStr || !valueStr || valueStr === ".") continue; // "." = fehlender Wert bei FRED
      const t = new Date(dateStr + "T00:00:00Z").getTime();
      const value = parseFloat(valueStr);
      if (!isNaN(t) && !isNaN(value)) points.push({ t, value });
    }

    if (!points.length) throw new Error("Keine gültigen M2-Datenpunkte gefunden");
    res.status(200).json({ points });
  } catch (err) {
    console.error("M2-Daten konnten nicht geladen werden:", err.message);
    res.status(500).json({ error: "M2-Daten aktuell nicht verfügbar." });
  }
};
