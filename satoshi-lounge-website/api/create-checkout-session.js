// /api/create-checkout-session
// Erstellt eine Stripe-Checkout-Seite für einen ganzen Warenkorb (mehrere Artikel möglich).
// Preise kommen NUR aus dem serverseitigen Produktkatalog (products-catalog.json) — der
// Client kann Preise also nicht manipulieren, egal was im Request mitgeschickt wird.

const Stripe = require("stripe");
const catalog = require("../products-catalog.json");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const SITE_URL = process.env.SITE_URL || "https://www.satoshi-lounge.com";

// Ganz Europa (EU-Länder + gängige weitere europäische Länder) — entspricht "Versand innerhalb
// Europas" aus der AGB. Liste sind ISO-3166-1-alpha-2-Codes, wie von Stripe erwartet.
const EUROPE_COUNTRIES = [
  "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT",
  "LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE", // EU
  "GB","CH","NO","IS","LI", // weiteres Europa
];

// Versandkosten laut AGB § 5: 5,99€ pauschal auf die GESAMTE Bestellung, ab 70€ Bestellwert kostenlos.
const SHIPPING_FLAT_CENTS = 599;
const FREE_SHIPPING_THRESHOLD_CENTS = 7000;
const MAX_QTY_PER_ITEM = 20; // Sicherheitsgrenze gegen Missbrauch

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", SITE_URL);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  try {
    const body = req.body || {};
    // Abwärtskompatibel: sowohl ein einzelnes Produkt (productId/size) als auch
    // ein ganzer Warenkorb (items: [{productId, size, qty}]) werden akzeptiert.
    const rawItems = Array.isArray(body.items) && body.items.length
      ? body.items
      : (body.productId ? [{ productId: body.productId, size: body.size, qty: 1 }] : []);

    if (!rawItems.length) {
      res.status(400).json({ error: "Warenkorb ist leer" });
      return;
    }

    const lineItems = [];
    let orderTotalCents = 0;

    for (const raw of rawItems) {
      const product = catalog[raw.productId];
      if (!product) {
        res.status(400).json({ error: "Unbekanntes Produkt im Warenkorb" });
        return;
      }
      if (product.sizes && !product.sizes.includes(raw.size)) {
        res.status(400).json({ error: "Bitte für \"" + product.name + "\" eine gültige Größe wählen" });
        return;
      }
      const qty = Math.max(1, Math.min(MAX_QTY_PER_ITEM, parseInt(raw.qty, 10) || 1));

      lineItems.push({
        price_data: {
          currency: "eur",
          product_data: {
            name: product.name + (raw.size ? " (Größe: " + raw.size + ")" : ""),
            images: product.image ? [product.image] : undefined,
            metadata: { productId: raw.productId, size: raw.size || "" },
          },
          unit_amount: product.price,
        },
        quantity: qty,
      });
      orderTotalCents += product.price * qty;
    }

    async function createSession(opts) {
      const items = opts.includeImages ? lineItems : lineItems.map((li) => {
        const clone = JSON.parse(JSON.stringify(li));
        delete clone.price_data.product_data.images;
        return clone;
      });

      const payload = {
        mode: "payment",
        line_items: items,
        billing_address_collection: "auto",
        metadata: { itemCount: String(rawItems.length) },
        success_url: SITE_URL + "/product/erfolg.html?session_id={CHECKOUT_SESSION_ID}",
        cancel_url: SITE_URL + "/merchandise.html",
      };

      if (opts.paymentMethods === "automatic") payload.automatic_payment_methods = { enabled: true };
      else payload.payment_method_types = ["card"];

      if (opts.shipping) {
        payload.shipping_address_collection = { allowed_countries: opts.countries };
        payload.shipping_options = [{
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: {
              amount: orderTotalCents >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : SHIPPING_FLAT_CENTS,
              currency: "eur",
            },
            display_name: orderTotalCents >= FREE_SHIPPING_THRESHOLD_CENTS ? "Kostenloser Versand" : "Standardversand",
          },
        }];
        payload.phone_number_collection = { enabled: true };
      }

      return stripe.checkout.sessions.create(payload);
    }

    // Mehrstufiger Versuch: volle Version zuerst, bei Fehler automatisch mit reduziertem
    // Funktionsumfang erneut versuchen — der Checkout soll nie komplett ausfallen.
    // (jeder Fehlschlag wird geloggt, damit sich die genaue Ursache später nachvollziehen lässt)
    const attempts = [
      { includeImages: true,  paymentMethods: "automatic", shipping: true,  countries: EUROPE_COUNTRIES },
      { includeImages: false, paymentMethods: "automatic", shipping: true,  countries: EUROPE_COUNTRIES },
      { includeImages: false, paymentMethods: "card",      shipping: true,  countries: EUROPE_COUNTRIES },
      { includeImages: false, paymentMethods: "card",      shipping: true,  countries: ["DE","AT","CH"] },
      { includeImages: false, paymentMethods: "card",      shipping: false, countries: ["DE","AT","CH"] },
    ];

    let session = null, lastErr = null;
    for (let i = 0; i < attempts.length; i++) {
      try {
        session = await createSession(attempts[i]);
        if (i > 0) console.error("Checkout erfolgreich erst bei Versuch " + (i + 1) + " (Konfiguration: " + JSON.stringify(attempts[i]) + ")");
        break;
      } catch (e) {
        lastErr = e;
        console.error("Checkout-Versuch " + (i + 1) + " fehlgeschlagen:", e.message);
      }
    }
    if (!session) throw lastErr;

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Checkout konnte nicht erstellt werden." });
  }
};
