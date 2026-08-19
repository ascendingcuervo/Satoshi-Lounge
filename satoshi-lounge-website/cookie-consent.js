// ===== Satoshi Lounge: Cookie-Consent-Banner =====
// Rechtsgrundlage: § 25 TTDSG / DSGVO. Aktuell setzt die Seite ausschließlich technisch
// notwendige Speicherung ein (Warenkorb, Login-Sitzung) — keine Analyse-/Marketing-Cookies.
// Die Auswahl wird trotzdem sauber gespeichert, damit künftige optionale Dienste (z.B.
// Analytics) korrekt gegen die hier gespeicherte Einwilligung geprüft werden können.

(function () {
  const KEY = "satoshi_cookie_consent";

  function getConsent() {
    try { return JSON.parse(localStorage.getItem(KEY)); }
    catch (e) { return null; }
  }
  function saveConsent(analytics) {
    localStorage.setItem(KEY, JSON.stringify({
      necessary: true,
      analytics: !!analytics,
      timestamp: new Date().toISOString(),
    }));
  }

  function openBanner() {
    const overlay = document.getElementById("cookieOverlay");
    if (overlay) overlay.classList.add("show");
  }
  function closeBanner() {
    const overlay = document.getElementById("cookieOverlay");
    if (overlay) overlay.classList.remove("show");
  }

  window.SatoshiCookieConsent = { getConsent, openBanner, closeBanner };

  document.addEventListener("DOMContentLoaded", function () {
    const overlay = document.getElementById("cookieOverlay");
    if (!overlay) return; // Seite hat kein Banner-Markup

    const acceptBtn = document.getElementById("cookieAcceptBtn");
    const necessaryBtn = document.getElementById("cookieNecessaryBtn");
    const detailsBtn = document.getElementById("cookieDetailsBtn");
    const detailBox = document.getElementById("cookieDetailBox");
    const reopenBtn = document.getElementById("reopenCookieBanner"); // auf cookies.html

    if (acceptBtn) acceptBtn.addEventListener("click", function () {
      saveConsent(true);
      closeBanner();
    });
    if (necessaryBtn) necessaryBtn.addEventListener("click", function () {
      saveConsent(false);
      closeBanner();
    });
    if (detailsBtn && detailBox) detailsBtn.addEventListener("click", function () {
      detailBox.classList.toggle("show");
    });
    if (reopenBtn) reopenBtn.addEventListener("click", function () {
      openBanner();
    });

    // Banner nur zeigen, wenn noch keine (oder eine älter als 12 Monate zurückliegende) Entscheidung vorliegt
    const consent = getConsent();
    let expired = true;
    if (consent && consent.timestamp) {
      const ageMs = Date.now() - new Date(consent.timestamp).getTime();
      expired = ageMs > 365 * 24 * 60 * 60 * 1000;
    }
    if (!consent || expired) openBanner();
  });
})();
