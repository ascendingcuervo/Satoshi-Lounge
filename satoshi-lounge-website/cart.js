// ===== Satoshi Lounge: Warenkorb =====
// Speichert den Warenkorb im Browser (localStorage), rendert das Slide-Panel und
// schickt beim Checkout den ganzen Warenkorb an /api/create-checkout-session.

(function () {
  const KEY = "satoshi_cart_v1";

  const GIFTCARD_KEY = "satoshi_giftcard_v1";

  function getAppliedGiftCard() {
    try { return JSON.parse(localStorage.getItem(GIFTCARD_KEY)) || null; }
    catch (e) { return null; }
  }
  function setAppliedGiftCard(code) {
    localStorage.setItem(GIFTCARD_KEY, JSON.stringify({ code }));
  }
  function clearAppliedGiftCard() {
    localStorage.removeItem(GIFTCARD_KEY);
  }

  function getCart() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch (e) { return []; }
  }
  function saveCart(cart) {
    localStorage.setItem(KEY, JSON.stringify(cart));
    updateCartBadge();
  }
  function addToCart(productId, name, price, image, size) {
    const cart = getCart();
    const existing = cart.find((i) => i.productId === productId && i.size === size);
    if (existing) { existing.qty += 1; }
    else { cart.push({ productId, name, price, image, size: size || null, qty: 1 }); }
    saveCart(cart);
  }
  function removeFromCart(index) {
    const cart = getCart();
    cart.splice(index, 1);
    saveCart(cart);
  }
  function updateQty(index, qty) {
    const cart = getCart();
    if (!cart[index]) return;
    if (qty <= 0) { cart.splice(index, 1); }
    else { cart[index].qty = qty; }
    saveCart(cart);
  }
  function clearCart() { localStorage.removeItem(KEY); updateCartBadge(); }
  function cartTotal() { return getCart().reduce((sum, i) => sum + i.price * i.qty, 0); }
  function cartCount() { return getCart().reduce((sum, i) => sum + i.qty, 0); }
  function euro(cents) { return (cents / 100).toFixed(2).replace(".", ",") + " €"; }

  function updateCartBadge() {
    const badge = document.getElementById("cartBadge");
    if (badge) badge.textContent = cartCount();
    const btn = document.getElementById("cartBtn");
    if (btn) btn.classList.toggle("has-items", cartCount() > 0);
  }

  function renderCartPanel() {
    const list = document.getElementById("cartItemsList");
    if (!list) return;
    const cart = getCart();
    const emptyEl = document.getElementById("cartEmpty");
    const footEl = document.getElementById("cartPanelFoot");

    if (cart.length === 0) {
      list.innerHTML = "";
      if (emptyEl) emptyEl.style.display = "block";
      if (footEl) footEl.style.display = "none";
      return;
    }
    if (emptyEl) emptyEl.style.display = "none";
    if (footEl) footEl.style.display = "block";

    list.innerHTML = cart.map((item, i) => (
      '<div class="cart-item">' +
        '<img src="' + item.image + '" alt="' + item.name + '">' +
        '<div class="cart-item-info">' +
          '<div class="cart-item-name">' + item.name + '</div>' +
          (item.size ? '<div class="cart-item-size">Größe: ' + item.size + '</div>' : '') +
          '<div class="cart-item-price">' + euro(item.price) + '</div>' +
          '<div class="cart-item-qty">' +
            '<button class="qty-btn" data-action="dec" data-index="' + i + '">−</button>' +
            '<span>' + item.qty + '</span>' +
            '<button class="qty-btn" data-action="inc" data-index="' + i + '">+</button>' +
          '</div>' +
        '</div>' +
        '<button class="cart-item-remove" data-index="' + i + '" aria-label="Entfernen">×</button>' +
      '</div>'
    )).join("");

    const totalEl = document.getElementById("cartTotal");
    if (totalEl) totalEl.textContent = euro(cartTotal());

    list.querySelectorAll(".qty-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.index, 10);
        const c = getCart();
        const delta = btn.dataset.action === "inc" ? 1 : -1;
        updateQty(idx, c[idx].qty + delta);
        renderCartPanel();
      });
    });
    list.querySelectorAll(".cart-item-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        removeFromCart(parseInt(btn.dataset.index, 10));
        renderCartPanel();
      });
    });
  }

  async function renderGiftCardBox() {
    const box = document.getElementById("giftcardRedeemBox");
    if (!box) return;
    const applied = getAppliedGiftCard();

    if (!applied) {
      box.innerHTML =
        '<div class="giftcard-box-cart">' +
          '<label for="giftcardCodeInput" class="giftcard-cart-label">Gutschein-Code</label>' +
          '<div class="giftcard-cart-row">' +
            '<input type="text" id="giftcardCodeInput" class="giftcard-cart-input" placeholder="SL-GIFT-XXXXXXXX">' +
            '<button type="button" id="giftcardApplyBtn" class="giftcard-cart-apply">Anwenden</button>' +
          '</div>' +
          '<p class="giftcard-cart-msg" id="giftcardCartMsg"></p>' +
        '</div>';

      const applyBtn = document.getElementById("giftcardApplyBtn");
      const input = document.getElementById("giftcardCodeInput");
      const msg = document.getElementById("giftcardCartMsg");
      if (applyBtn) {
        applyBtn.addEventListener("click", async function () {
          const code = (input.value || "").trim().toUpperCase();
          if (!code) { if (msg) msg.textContent = "Bitte einen Code eingeben."; return; }
          applyBtn.disabled = true; applyBtn.textContent = "…";
          try {
            const res = await fetch("/api/validate-giftcard", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code: code }),
            });
            const data = await res.json();
            if (data.valid) {
              setAppliedGiftCard(data.code);
              renderGiftCardBox();
            } else {
              if (msg) msg.textContent = data.error || "Code ungültig.";
              applyBtn.disabled = false; applyBtn.textContent = "Anwenden";
            }
          } catch (e) {
            if (msg) msg.textContent = "Verbindung fehlgeschlagen.";
            applyBtn.disabled = false; applyBtn.textContent = "Anwenden";
          }
        });
      }
      return;
    }

    // Ein Code ist gespeichert -> aktuelles Guthaben nachladen, damit die Anzeige stimmt
    // (könnte sich seit dem letzten Öffnen des Warenkorbs geändert haben).
    box.innerHTML = '<div class="giftcard-box-cart"><p class="giftcard-cart-msg">Prüfe Guthaben…</p></div>';
    try {
      const res = await fetch("/api/validate-giftcard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: applied.code }),
      });
      const data = await res.json();
      if (!data.valid) {
        clearAppliedGiftCard();
        renderGiftCardBox();
        return;
      }
      const discountCents = Math.min(data.remainingCents, cartTotal());
      box.innerHTML =
        '<div class="giftcard-box-cart">' +
          '<div class="giftcard-chip">' +
            '<div class="giftcard-chip-info">' +
              '<span class="giftcard-chip-code">' + data.code + '</span>' +
              '<span class="giftcard-chip-balance">Guthaben: ' + euro(data.remainingCents) + ' · Rabatt: -' + euro(discountCents) + '</span>' +
            '</div>' +
            '<button type="button" class="giftcard-chip-remove" id="giftcardRemoveBtn" aria-label="Entfernen">×</button>' +
          '</div>' +
        '</div>';
      const removeBtn = document.getElementById("giftcardRemoveBtn");
      if (removeBtn) removeBtn.addEventListener("click", function () { clearAppliedGiftCard(); renderGiftCardBox(); });
    } catch (e) {
      box.innerHTML = '<div class="giftcard-box-cart"><p class="giftcard-cart-msg">Guthaben konnte nicht geprüft werden.</p></div>';
    }
  }

  function toggleCartPanel(open) {
    const panel = document.getElementById("cartPanel");
    const overlay = document.getElementById("cartOverlay");
    if (!panel) return;
    if (open) { renderCartPanel(); renderGiftCardBox(); }
    panel.classList.toggle("open", open);
    if (overlay) overlay.classList.toggle("show", open);
  }

  window.SatoshiCart = {
    addToCart, removeFromCart, updateQty, clearCart,
    getCart, cartTotal, cartCount, renderCartPanel, toggleCartPanel,
  };

  document.addEventListener("DOMContentLoaded", function () {
    updateCartBadge();

    const cartBtn = document.getElementById("cartBtn");
    const cartClose = document.getElementById("cartPanelClose");
    const cartOverlay = document.getElementById("cartOverlay");
    if (cartBtn) cartBtn.addEventListener("click", () => toggleCartPanel(true));
    if (cartClose) cartClose.addEventListener("click", () => toggleCartPanel(false));
    if (cartOverlay) cartOverlay.addEventListener("click", () => toggleCartPanel(false));

    const checkoutBtn = document.getElementById("cartCheckoutBtn");
    if (checkoutBtn) {
      // Container für die Gutschein-Box einmalig vor dem Kasse-Button einfügen.
      if (!document.getElementById("giftcardRedeemBox")) {
        checkoutBtn.insertAdjacentHTML("beforebegin", '<div class="giftcard-redeem" id="giftcardRedeemBox"></div>');
      }

      checkoutBtn.addEventListener("click", async function () {
        const cart = getCart();
        if (!cart.length) return;
        const msg = document.getElementById("cartCheckoutMsg");
        checkoutBtn.disabled = true; checkoutBtn.textContent = "Einen Moment…";
        if (msg) msg.textContent = "";
        const applied = getAppliedGiftCard();
        try {
          const res = await fetch("/api/create-checkout-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: cart.map((i) => ({ productId: i.productId, size: i.size, qty: i.qty })),
              giftCardCode: applied ? applied.code : undefined,
            }),
          });
          const data = await res.json();
          if (data.url) { window.location.href = data.url; }
          else {
            if (msg) msg.textContent = data.error || "Fehler beim Checkout.";
            checkoutBtn.disabled = false; checkoutBtn.textContent = "Zur Kasse";
          }
        } catch (e) {
          if (msg) msg.textContent = "Verbindung fehlgeschlagen. Versuch es nochmal.";
          checkoutBtn.disabled = false; checkoutBtn.textContent = "Zur Kasse";
        }
      });
    }
  });
})();
