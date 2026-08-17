// ===== Satoshi Lounge: Login / Registrierung / Profilbild =====
// Braucht: auth-config.js (SUPABASE_URL, SUPABASE_ANON_KEY) und das Supabase-SDK,
// beide VOR dieser Datei eingebunden.

(function(){
  if(typeof SUPABASE_URL === "undefined" || SUPABASE_URL.indexOf("HIER_DEINE") === 0){
    console.warn("Satoshi Lounge: auth-config.js ist noch nicht ausgefüllt — Login ist deaktiviert.");
    return;
  }

  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  let authMode = "login"; // "login" | "signup"
  let currentUser = null;
  let currentProfile = null;

  function el(id){ return document.getElementById(id); }

  function showMsg(text, type){
    const m = el("authMsg");
    if(!m) return;
    m.textContent = text || "";
    m.className = "auth-msg" + (type ? " " + type : "");
  }

  function openModal(mode){
    authMode = mode || "login";
    setTab(authMode);
    showMsg("");
    el("authForm").reset();
    el("authOverlay").classList.add("open");
  }
  function closeModal(){
    el("authOverlay").classList.remove("open");
  }
  function setTab(mode){
    authMode = mode;
    el("authTabLogin").classList.toggle("active", mode === "login");
    el("authTabSignup").classList.toggle("active", mode === "signup");
    el("authSubmitBtn").textContent = mode === "login" ? "Anmelden" : "Konto erstellen";
    el("authPassword").setAttribute("autocomplete", mode === "login" ? "current-password" : "new-password");
  }

  function friendlyError(msg){
    if(!msg) return "Etwas ist schiefgelaufen. Versuch's nochmal.";
    if(msg.indexOf("Invalid login credentials") !== -1) return "E-Mail oder Passwort ist falsch.";
    if(msg.indexOf("already registered") !== -1 || msg.indexOf("already been registered") !== -1) return "Diese E-Mail ist schon registriert — versuch dich anzumelden.";
    if(msg.indexOf("Password should be at least") !== -1) return "Passwort muss mindestens 6 Zeichen haben.";
    if(msg.indexOf("Unable to validate email") !== -1 || msg.indexOf("invalid") !== -1) return "Bitte eine gültige E-Mail-Adresse eingeben.";
    return msg;
  }

  async function handleSubmit(e){
    e.preventDefault();
    const email = el("authEmail").value.trim();
    const password = el("authPassword").value;
    const btn = el("authSubmitBtn");
    btn.disabled = true;
    showMsg("");

    if(authMode === "login"){
      const { error } = await sb.auth.signInWithPassword({ email, password });
      btn.disabled = false;
      if(error){ showMsg(friendlyError(error.message), "error"); return; }
      closeModal();
    }else{
      const { error } = await sb.auth.signUp({ email, password });
      btn.disabled = false;
      if(error){ showMsg(friendlyError(error.message), "error"); return; }
      showMsg("Fast geschafft — check dein E-Mail-Postfach zur Bestätigung.", "success");
    }
  }

  async function handleLogout(){
    await sb.auth.signOut();
    el("profileMenu").classList.remove("open");
  }

  // Verkleinert ein Bild clientseitig auf max. 300x300, bevor es hochgeladen wird
  function resizeImage(file){
    return new Promise(function(resolve, reject){
      const img = new Image();
      const reader = new FileReader();
      reader.onload = function(e){ img.src = e.target.result; };
      reader.onerror = reject;
      img.onload = function(){
        const max = 300;
        let w = img.width, h = img.height;
        if(w > h && w > max){ h = Math.round(h * (max/w)); w = max; }
        else if(h > max){ w = Math.round(w * (max/h)); h = max; }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        canvas.toBlob(function(blob){
          if(!blob) return reject(new Error("Bild konnte nicht verarbeitet werden"));
          resolve(blob);
        }, "image/jpeg", 0.85);
      };
      img.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleAvatarChange(e){
    const file = e.target.files && e.target.files[0];
    if(!file || !currentUser) return;
    if(file.size > 8 * 1024 * 1024){ alert("Datei ist zu groß (max. 8 MB)."); return; }

    try{
      const blob = await resizeImage(file);
      const path = currentUser.id + "/avatar.jpg";
      const { error: upErr } = await sb.storage.from("avatars").upload(path, blob, {
        upsert: true, contentType: "image/jpeg"
      });
      if(upErr) throw upErr;

      const { data: pub } = sb.storage.from("avatars").getPublicUrl(path);
      const avatarUrl = pub.publicUrl + "?t=" + Date.now(); // Cache-Buster

      const { error: updErr } = await sb.from("profiles").update({ avatar_url: avatarUrl }).eq("id", currentUser.id);
      if(updErr) throw updErr;

      currentProfile = currentProfile || {};
      currentProfile.avatar_url = avatarUrl;
      renderAuthArea();
    }catch(err){
      alert("Profilbild-Upload fehlgeschlagen: " + (err.message || err));
    }
  }

  async function loadProfile(userId){
    const { data } = await sb.from("profiles").select("*").eq("id", userId).single();
    return data;
  }

  function renderAuthArea(){
    const area = el("authArea");
    if(!area) return;

    if(!currentUser){
      area.innerHTML = '<a href="#" class="login-btn" id="authBtn">Anmelden</a>';
      el("authBtn").addEventListener("click", function(ev){ ev.preventDefault(); openModal("login"); });
      return;
    }

    const initial = (currentUser.email || "?").charAt(0).toUpperCase();
    const avatarUrl = currentProfile && currentProfile.avatar_url;
    area.innerHTML =
      '<button type="button" class="profile-btn" id="profileBtn">' +
      (avatarUrl ? '<img src="' + avatarUrl + '" alt="Profilbild">' : '<span class="initial">' + initial + '</span>') +
      '</button>';

    el("profileMenuEmail").textContent = currentUser.email || "";
    el("profileBtn").addEventListener("click", function(ev){
      ev.stopPropagation();
      el("profileMenu").classList.toggle("open");
    });
  }

  async function refreshSession(){
    const { data } = await sb.auth.getSession();
    currentUser = data.session ? data.session.user : null;
    currentProfile = currentUser ? await loadProfile(currentUser.id) : null;
    renderAuthArea();
  }

  document.addEventListener("DOMContentLoaded", function(){
    if(!el("authOverlay")) return; // Seite hat kein Auth-Markup

    el("authModalClose").addEventListener("click", closeModal);
    el("authOverlay").addEventListener("click", function(e){ if(e.target === el("authOverlay")) closeModal(); });
    el("authTabLogin").addEventListener("click", function(){ setTab("login"); showMsg(""); });
    el("authTabSignup").addEventListener("click", function(){ setTab("signup"); showMsg(""); });
    el("authForm").addEventListener("submit", handleSubmit);
    el("changeAvatarBtn").addEventListener("click", function(){ el("avatarFileInput").click(); });
    el("avatarFileInput").addEventListener("change", handleAvatarChange);
    el("logoutBtn").addEventListener("click", handleLogout);
    document.addEventListener("click", function(){ el("profileMenu").classList.remove("open"); });

    sb.auth.onAuthStateChange(function(){ refreshSession(); });
    refreshSession();
  });
})();
