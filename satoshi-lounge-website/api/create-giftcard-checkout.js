// /api/create-giftcard-checkout
// Erstellt eine Stripe-Checkout-Session für den Kauf eines Satoshi-Lounge-Gutscheins mit frei
// wählbarem Betrag. Der eigentliche Gutscheincode wird NICHT hier erzeugt, sondern erst im
// Webhook (api/webhook.js), sobald die Zahlung wirklich abgeschlossen ist — sonst könnte jemand
// einen Code bekommen, ohne bezahlt zu haben.

const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const SITE_URL = process.env.SITE_URL || "https://www.satoshi-lounge.com";

const MIN_AMOUNT_EUR = 1;
const MAX_AMOUNT_EUR = 250;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", SITE_URL);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  try {
    const body = req.body || {};
    const amountEur = parseInt(body.amountEur, 10);

    if (!Number.isInteger(amountEur) || amountEur < MIN_AMOUNT_EUR || amountEur > MAX_AMOUNT_EUR) {
      res.status(400).json({
        error: "Bitte einen Betrag zwischen " + MIN_AMOUNT_EUR + "€ und " + MAX_AMOUNT_EUR + "€ wählen.",
      });
      return;
    }

    const amountCents = amountEur * 100;

    // Gutscheine sind digital — keine Versandadresse, keine Versandkosten nötig.
    async function createSession(opts) {
      const payload = {
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "eur",
            product_data: {
              name: "Satoshi Lounge Gutschein",
              description: "Digitaler Gutschein im Wert von " + amountEur + "€ — der Code wird per E-Mail zugeschickt.",
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        }],
        // Markiert die Session für den Webhook als Gutschein-Kauf statt normaler Bestellung.
        metadata: { type: "giftcard", amountCents: String(amountCents) },
        success_url: SITE_URL + "/product/erfolg.html?session_id={CHECKOUT_SESSION_ID}",
        cancel_url: SITE_URL + "/merchandise.html",
      };
      // Normalfall: payment_method_types weglassen, damit Stripe alle im Dashboard aktivierten
      // Zahlungsmethoden dynamisch anzeigt. Nur im Fallback wird hart auf Karte beschränkt.
      if (opts.paymentMethods === "card") payload.payment_method_types = ["card"];
      return stripe.checkout.sessions.create(payload);
    }

    const attempts = [{ paymentMethods: "dynamic" }, { paymentMethods: "card" }];
    let session = null, lastErr = null;
    for (let i = 0; i < attempts.length; i++) {
      try {
        session = await createSession(attempts[i]);
        if (i > 0) console.error("Gutschein-Checkout erfolgreich erst bei Versuch " + (i + 1));
        break;
      } catch (e) {
        lastErr = e;
        console.error("Gutschein-Checkout-Versuch " + (i + 1) + " fehlgeschlagen:", e.message);
      }
    }
    if (!session) throw lastErr;

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gutschein-Checkout konnte nicht erstellt werden." });
  }
};
