// /api/webhook
// Wird von Stripe automatisch aufgerufen, sobald eine Zahlung erfolgreich war.
// Schickt dir (und dem Kunden) eine E-Mail mit allen Bestelldetails via Resend,
// inklusive einer automatisch erzeugten PDF-Rechnung im Anhang.

const Stripe = require("stripe");
const { generateInvoicePDF } = require("../lib/invoice");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const NOTIFY_EMAIL = process.env.ORDER_NOTIFY_EMAIL || "ascendingcuervo@t-online.de";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
// Solange keine eigene Domain bei Resend verifiziert ist, funktioniert nur dieser Test-Absender
// UND nur der Versand an die eigene, bei Resend hinterlegte E-Mail-Adresse zuverlässig.
const FROM_ADDRESS = process.env.RESEND_FROM || "Satoshi Lounge <bestellungen@satoshi-lounge.com>";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function euroDE(cents) {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

// Holt eine fortlaufende Rechnungsnummer aus Supabase (SL-2026-00001, ...). Falls das aus
// irgendeinem Grund fehlschlägt, wird eine trotzdem eindeutige Ersatznummer erzeugt, damit
// eine fehlgeschlagene Datenbank-Verbindung nie die ganze Bestellbestätigung blockiert.
async function getNextInvoiceNumber() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY fehlt — nutze Ersatz-Rechnungsnummer.");
    return "SL-" + new Date().getFullYear() + "-" + Date.now().toString().slice(-6);
  }
  try {
    const res = await fetch(SUPABASE_URL + "/rest/v1/rpc/next_invoice_number", {
      method: "POST",
      headers: {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (!data) throw new Error("leere Antwort");
    return data;
  } catch (e) {
    console.error("Rechnungsnummer konnte nicht von Supabase geholt werden:", e.message);
    return "SL-" + new Date().getFullYear() + "-" + Date.now().toString().slice(-6);
  }
}

async function sendEmail(to, subject, html, attachments) {
  if (!RESEND_API_KEY) { console.warn("RESEND_API_KEY fehlt — E-Mail wird nicht verschickt."); return; }
  const payload = { from: FROM_ADDRESS, to, subject, html };
  if (attachments && attachments.length) payload.attachments = attachments;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + RESEND_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
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

      // ---- PDF-Rechnung erzeugen (eigener try/catch: schlägt das fehl, sollen die
      // Bestell-Mails trotzdem ohne Anhang rausgehen, statt komplett zu scheitern) ----
      let attachments = [];
      try {
        const invoiceNumber = await getNextInvoiceNumber();
        const invoiceDate = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

        const subtotalCents = session.line_items.data.reduce((sum, li) => sum + li.amount_total, 0);
        const shippingCents = (session.total_details && typeof session.total_details.amount_shipping === "number")
          ? session.total_details.amount_shipping
          : Math.max(0, session.amount_total - subtotalCents);

        const invoiceItems = session.line_items.data.map((li) => {
          const totalAmt = li.amount_total;
          const unitAmt = li.quantity ? totalAmt / li.quantity : totalAmt;
          return {
            name: li.description,
            qty: li.quantity,
            unitPrice: euroDE(unitAmt),
            total: euroDE(totalAmt),
          };
        });

        const addressLines = address
          ? [
              address.line1 + (address.line2 ? ", " + address.line2 : ""),
              address.postal_code + " " + address.city,
              address.country,
            ]
          : ["Keine Lieferadresse übermittelt"];

        const pdfBuffer = await generateInvoicePDF({
          invoiceNumber,
          date: invoiceDate,
          items: invoiceItems,
          subtotal: euroDE(subtotalCents),
          shipping: euroDE(shippingCents),
          total: euroDE(session.amount_total),
          customerName,
          addressLines,
          customerEmail: customerEmail !== "-" ? customerEmail : "",
        });

        attachments = [{ filename: invoiceNumber + ".pdf", content: pdfBuffer.toString("base64") }];
      } catch (invErr) {
        console.error("Rechnung konnte nicht erzeugt werden, Bestell-Mails gehen ohne Anhang raus:", invErr.message);
      }

      await sendEmail(
        NOTIFY_EMAIL,
        "Neue Bestellung: " + items.map((i) => i.name).join(", "),
        orderHtml,
        attachments
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
          (attachments.length ? "<p>Die Rechnung findest du im Anhang dieser E-Mail.</p>" : "") +
          "<p>Bei Fragen antworte einfach auf diese E-Mail.</p>",
          attachments
        );
      }
    } catch (err) {
      console.error("Fehler beim Verarbeiten der Bestellung:", err);
      // Trotzdem 200 an Stripe zurückgeben, sonst versucht Stripe es endlos erneut
    }
  }

  res.status(200).json({ received: true });
};

// Vercel soll den Rohtext des Requests NICHT selbst parsen — Stripe braucht die
// unveränderten Original-Bytes, um die Signatur zu prüfen (Fälschungsschutz).
// WICHTIG: muss NACH der module.exports-Zuweisung stehen, sonst geht diese Einstellung verloren.
module.exports.config = { api: { bodyParser: false } };
