// /api/create-checkout-session
// Erstellt eine Stripe-Checkout-Seite für ein Produkt. Preise kommen NUR aus dem
// serverseitigen Produktkatalog (products-catalog.json) — der Client kann den Preis
// also nicht manipulieren, egal was im Request mitgeschickt wird.

const Stripe = require("stripe");
const catalog = require("../products-catalog.json");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const SITE_URL = process.env.SITE_URL || "https://www.satoshi-lounge.com";

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", SITE_URL);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  try {
    const { productId, size } = req.body || {};
    const product = catalog[productId];

    if (!product) {
      res.status(400).json({ error: "Unbekanntes Produkt" });
      return;
    }
    if (product.sizes && !product.sizes.includes(size)) {
      res.status(400).json({ error: "Bitte eine gültige Größe wählen" });
      return;
    }

    const lineItem = {
      price_data: {
        currency: "eur",
        product_data: {
          name: product.name + (size ? " (Größe: " + size + ")" : ""),
          images: product.image ? [product.image] : undefined,
          metadata: { productId, size: size || "" },
        },
        unit_amount: product.price,
      },
      quantity: 1,
    };

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [lineItem],
      shipping_address_collection: { allowed_countries: ["DE", "AT", "CH"] },
      phone_number_collection: { enabled: true },
      billing_address_collection: "auto",
      metadata: { productId, size: size || "", productName: product.name },
      success_url: SITE_URL + "/product/erfolg.html?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: SITE_URL + "/product/" + productId + ".html",
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Checkout konnte nicht erstellt werden." });
  }
};
