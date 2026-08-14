// Holt die komplette Bitcoin-Tageshistorie von CoinGecko und speichert sie als statische Datei
// (btc-history.json), damit die Website selbst NICHT mehr live bei CoinGecko anfragen muss.
// Läuft automatisch 1x täglich über die GitHub Action ".github/workflows/update-btc-history.yml".
//
// Lokal testen: node scripts/update-btc-history.js

const fs = require("fs");
const path = require("path");

const OUT_FILE = path.join(__dirname, "..", "satoshi-lounge-website", "btc-history.json");
const URL = "https://api.coingecko.com/api/v3/coins/bitcoin/ohlc?vs_currency=usd&days=max";

async function fetchWithRetry(url, tries) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) throw new Error("Leere Antwort");
      return data;
    } catch (e) {
      console.warn("Versuch " + (i + 1) + "/" + tries + " fehlgeschlagen:", e.message);
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 5000 * (i + 1)));
    }
  }
  return null;
}

async function main() {
  const raw = await fetchWithRetry(URL, 4);

  if (!raw) {
    // CoinGecko war heute nicht erreichbar (Rate-Limit o.ä.) — einfach nichts tun.
    // Die bestehende Datei bleibt unverändert, morgen läuft die Action erneut.
    console.warn("Keine Daten von CoinGecko erhalten, Datei bleibt unverändert.");
    process.exit(0);
  }

  // CoinGecko liefert [ [ time, open, high, low, close ], ... ]
  const candles = raw.map((c) => [c[0], c[1], c[2], c[3], c[4]]);
  candles.sort((a, b) => a[0] - b[0]);

  const out = {
    updated: new Date().toISOString(),
    note: "Automatisch taeglich per GitHub Action aktualisiert (update-btc-history.yml). Format: [timestamp_ms, open, high, low, close], eine Zeile pro Tag.",
    candles: candles,
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out));
  console.log("Geschrieben: " + candles.length + " Kerzen -> " + OUT_FILE);
}

main().catch((e) => {
  console.error(e);
  process.exit(0); // Fehler nicht als harten CI-Fail werten — nächster Tag versucht's erneut
});
