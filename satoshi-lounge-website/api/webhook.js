// /api/webhook
// Wird von Stripe automatisch aufgerufen, sobald eine Zahlung erfolgreich war.
// Schickt dir (und optional dem Kunden) eine E-Mail mit allen Bestelldetails via Resend.

const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const NOTIFY_EMAIL = process.env.ORDER_NOTIFY_EMAIL || "ascendingcuervo@t-online.de";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
// Solange keine eigene Domain bei Resend verifiziert ist, funktioniert nur dieser Test-Absender
// UND nur der Versand an die eigene, bei Resend hinterlegte E-Mail-Adresse zuverlässig.
const FROM_ADDRESS = process.env.RESEND_FROM || "Satoshi Lounge <bestellungen@satoshi-lounge.com>";

// Vercel soll den Rohtext des Requests NICHT selbst parsen — Stripe braucht die
// unveränderten Original-Bytes, um die Signatur zu prüfen (Fälschungsschutz).
module.exports.config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function sendEmail(to, subject, html) {
  if (!RESEND_API_KEY) { console.warn("RESEND_API_KEY fehlt — E-Mail wird nicht verschickt."); return; }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + RESEND_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("Resend-Fehler:", res.status, text);
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.status(405).end(); return; }

  let event;
  try {
    const rawBody = await readRawBody(req);
    const sig = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook-Signatur ungültig:", err.message);
    res.status(400).send("Webhook Error: " + err.message);
    return;
  }

  if (event.type === "checkout.session.completed") {
    try {
      const session = await stripe.checkout.sessions.retrieve(event.data.object.id, {
        expand: ["line_items", "customer_details"],
      });

      const items = session.line_items.data.map((li) => ({
        name: li.description,
        amount: (li.amount_total / 100).toFixed(2),
        qty: li.quantity,
      }));
      const itemsHtml = items.map((i) => "<li>" + i.qty + "x " + i.name + " — " + i.amount + " €</li>").join("");

      const shipping = session.shipping_details;
      const address = shipping && shipping.address;
      const addressHtml = address
        ? address.line1 + (address.line2 ? ", " + address.line2 : "") + "<br>" +
          address.postal_code + " " + address.city + "<br>" + address.country
        : "Keine Lieferadresse übermittelt";

      const customerName = (shipping && shipping.name) || (session.customer_details && session.customer_details.name) || "-";
      const customerEmail = session.customer_details ? session.customer_details.email : "-";
      const customerPhone = (session.customer_details && session.customer_details.phone) || "-";
      const total = (session.amount_total / 100).toFixed(2);

      const orderHtml =
        "<h2>🎉 Neue Bestellung — Satoshi Lounge</h2>" +
        "<p><strong>Gesamtbetrag:</strong> " + total + " €</p>" +
        "<h3>Artikel</h3><ul>" + itemsHtml + "</ul>" +
        "<h3>Kunde</h3><p>Name: " + customerName + "<br>E-Mail: " + customerEmail + "<br>Telefon: " + customerPhone + "</p>" +
        "<h3>Lieferadresse</h3><p>" + addressHtml + "</p>" +
        "<hr><p style='color:#888;font-size:12px;'>Stripe Session: " + session.id + "</p>";

      await sendEmail(
        NOTIFY_EMAIL,
        "Neue Bestellung: " + items.map((i) => i.name).join(", "),
        orderHtml
      );

      // Bonus: Bestätigung an den Kunden — funktioniert erst zuverlässig, sobald bei Resend
      // eine eigene Domain verifiziert ist (siehe Setup-Anleitung).
      if (customerEmail && customerEmail !== "-") {
        await sendEmail(
          customerEmail,
          "Deine Bestellung bei Satoshi Lounge",
          "<h2>Danke für deine Bestellung! 🧡</h2>" +
          "<p>Wir haben deine Zahlung über " + total + " € erhalten und bereiten alles vor.</p>" +
          "<h3>Artikel</h3><ul>" + itemsHtml + "</ul>" +
          "<p>Lieferadresse:<br>" + addressHtml + "</p>" +
          "<p>Bei Fragen antworte einfach auf diese E-Mail.</p>"
        );
      }
    } catch (err) {
      console.error("Fehler beim Verarbeiten der Bestellung:", err);
      // Trotzdem 200 an Stripe zurückgeben, sonst versucht Stripe es endlos erneut
    }
  }

  res.status(200).json({ received: true });
};
