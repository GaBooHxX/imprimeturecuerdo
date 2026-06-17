import { firebaseConfig } from "./firebase-config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  increment,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* ---------------- Firebase init ---------------- */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

/* ---------------- Roles / permisos ---------------- */
function adminGlobalDoc(uid){ return doc(db, "admins", uid); }
function memorialAdminDoc(memorialId, uid){ return doc(db, "memorials", memorialId, "admin", uid); }
function memorialModDoc(memorialId, uid){ return doc(db, "memorials", memorialId, "mods", uid); }

async function getRole(memorialId, uid){
  const g = await getDoc(adminGlobalDoc(uid));
  if (g.exists()) return "global-admin";

  const a = await getDoc(memorialAdminDoc(memorialId, uid));
  if (a.exists()) return "memorial-admin";

  const m = await getDoc(memorialModDoc(memorialId, uid));
  if (m.exists()) return "mod";

  return "none";
}

function roleLabel(role){
  switch(role){
    case "global-admin": return "Administrador global";
    case "memorial-admin": return "Administrador del memorial";
    case "mod": return "Moderador";
    default: return "Usuario";
  }
}

/* ---------------- Helpers ---------------- */
function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function getMemorialId(){
  const url = new URL(location.href);
  const mid = url.searchParams.get("mid") || url.searchParams.get("m");
  if (mid) return mid;

  const parts = location.pathname.split("/").filter(Boolean);
  const idxEs = parts.indexOf("memoriales");
  if (idxEs >= 0 && parts[idxEs + 1]) return parts[idxEs + 1];
  const idxEn = parts.indexOf("memorials");
  if (idxEn >= 0 && parts[idxEn + 1]) return parts[idxEn + 1];

  return parts[parts.length - 1] || "memorial";
}

function commentsCol(memorialId, photoIndex){
  return collection(db, "memorials", memorialId, "photos", String(photoIndex), "comments");
}
function reactionsCol(memorialId, photoIndex){
  return collection(db, "memorials", memorialId, "photos", String(photoIndex), "reactions");
}

/* ---------------- Contenido dinámico (subido desde el panel) ---------------- */
function contentDoc(memorialId){
  return doc(db, "memorials", memorialId, "meta", "content");
}
function galleryCol(memorialId){
  return collection(db, "memorials", memorialId, "gallery");
}

// Acepta enlaces de YouTube en cualquier formato y devuelve el "embed".
function toYouTubeEmbed(url){
  if (!url) return "";
  const u = String(url).trim();
  if (u.includes("/embed/")) return u;

  let id = "";
  const m1 = u.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  const m2 = u.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
  const m3 = u.match(/\/shorts\/([A-Za-z0-9_-]{6,})/);
  if (m1) id = m1[1];
  else if (m2) id = m2[1];
  else if (m3) id = m3[1];
  else if (/^[A-Za-z0-9_-]{6,}$/.test(u)) id = u; // solo el ID

  return id ? `https://www.youtube.com/embed/${id}` : u;
}

// Carga data.json si existe (memorial con carpeta propia). Es OPCIONAL.
async function loadBaseData(memorialId){
  const candidates = [
    "data.json",
    `../memoriales/${memorialId}/data.json`,
    `memoriales/${memorialId}/data.json`
  ];
  for (const url of candidates){
    try{
      const r = await fetch(url, { cache: "no-store" });
      if (r.ok) return await r.json();
    }catch(_){}
  }
  return {};
}

function guestbookCol(memorialId){
  return collection(db, "memorials", memorialId, "guestbook");
}

// Lee overrides de Firestore (contenido + galería subida). Nunca rompe la carga.
async function loadDynamicContent(memorialId){
  let content = {};
  let gallery = [];

  try{
    const snap = await getDoc(contentDoc(memorialId));
    if (snap.exists()) content = snap.data() || {};
  }catch(e){
    console.warn("No se pudo leer contenido dinámico:", e?.code || e);
  }

  try{
    const snap = await getDocs(query(galleryCol(memorialId), orderBy("order", "asc")));
    gallery = snap.docs.map(x => ({ key: x.id, ...(x.data() || {}) }));
  }catch(e){
    console.warn("No se pudo leer galería dinámica:", e?.code || e);
  }

  return { content, gallery };
}

/* ---------------- Velas globales ---------------- */
function candlesCol(memorialId){
  return collection(db, "memorials", memorialId, "candles");
}
function candleDoc(memorialId, uid){
  return doc(db, "memorials", memorialId, "candles", uid);
}

/* ---------------- Stats ---------------- */
function statsDoc(memorialId){
  return doc(db, "memorials", memorialId, "meta", "stats");
}

async function ensureStats(memorialId){
  const ref = statsDoc(memorialId);
  try{
    const snap = await getDoc(ref);
    if (snap.exists()) return;

    await setDoc(ref, {
      visits: 0,
      comments: 0,
      reactions: 0,
      updatedAt: serverTimestamp()
    });
  }catch(e){
    console.warn("No se pudo asegurar stats:", e?.code || e);
  }
}

async function bumpVisit(memorialId){
  const key = `visit_${memorialId}_${new Date().toISOString().slice(0,10)}`;
  if (localStorage.getItem(key)) return;
  localStorage.setItem(key, "1");

  try{
    await setDoc(statsDoc(memorialId), {
      visits: increment(1),
      updatedAt: serverTimestamp()
    }, { merge: true });
  }catch(e){
    console.warn("No se pudo registrar visita:", e?.code || e);
  }
}

async function bumpStat(memorialId, field, delta){
  try{
    await setDoc(statsDoc(memorialId), {
      [field]: increment(delta),
      updatedAt: serverTimestamp()
    }, { merge: true });
  }catch(e){
    console.warn(`No se pudo actualizar stats.${field}:`, e?.code || e);
  }
}

/* ---------------- UI errors ---------------- */
function showAuthError(msg){
  const box = document.getElementById("authError");
  if (!box) return;
  if (!msg){
    box.hidden = true;
    box.textContent = "";
    return;
  }
  box.hidden = false;
  box.textContent = msg;
}

/* ---------------- Loader (2) ---------------- */
function showLoader(){
  const l = document.getElementById("pageLoader");
  if (!l) return;
  l.hidden = false;
}
function hideLoader(){
  const l = document.getElementById("pageLoader");
  if (!l) return;
  l.hidden = true;
}

/* ---------------- Welcome gate (1) ---------------- */
function setupWelcomeGate(memorialId){
  const gate = document.getElementById("welcomeGate");
  const enter = document.getElementById("welcomeEnter");
  const skip = document.getElementById("welcomeSkip");
  if (!gate || !enter || !skip) return;

  const key = `welcome_${memorialId}_${new Date().toISOString().slice(0,10)}`;
  if (localStorage.getItem(key)) return;

  gate.hidden = false;
  document.body.style.overflow = "hidden";

  const close = () => {
    localStorage.setItem(key, "1");
    gate.hidden = true;
    document.body.style.overflow = "";
  };

  enter.addEventListener("click", close);
  skip.addEventListener("click", close);

  gate.addEventListener("click", (e) => {
    if (e.target?.classList?.contains("welcomeBackdrop")) close();
  });
}

/* ---------------- Share (3) ---------------- */
function setupShare(){
  const btn = document.getElementById("btnShare");
  if (!btn) return;

  const shareUrl = location.href;
  btn.addEventListener("click", async () => {
    try{
      if (navigator.share){
        await navigator.share({
          title: document.title || "Memorial",
          text: "Te comparto este memorial.",
          url: shareUrl
        });
        return;
      }
    }catch(e){
      return;
    }

    try{
      await navigator.clipboard.writeText(shareUrl);
      const old = btn.textContent;
      btn.textContent = "Copiado ✅";
      setTimeout(() => btn.textContent = old || "Compartir", 1200);
    }catch(e){
      window.prompt("Copia este enlace:", shareUrl);
    }
  });
}

/* ---------------- Auth persistence + login ---------------- */
async function initAuthPersistence(){
  try{
    await setPersistence(auth, browserLocalPersistence);
  }catch(e){
    console.warn("Persistencia NO aplicada:", e?.code || e);
  }
}

async function loginGoogle(){
  showAuthError("");
  await initAuthPersistence();
  try{
    await signInWithPopup(auth, provider);
  }catch(err){
    const code = err?.code || "";
    if (
      code === "auth/popup-blocked" ||
      code === "auth/popup-closed-by-user" ||
      code === "auth/operation-not-supported-in-this-environment"
    ){
      await signInWithRedirect(auth, provider);
      return;
    }
    showAuthError(`No se pudo iniciar sesión. Error: ${code || "desconocido"}`);
    throw err;
  }
}

/* ---------------- UI: login global ---------------- */
let globalAuthReady = false;
function setupGlobalAuthUI(){
  if (globalAuthReady) return;
  globalAuthReady = true;

  const btnLoginMain = document.getElementById("btnLoginMain");
  const btnLogoutMain = document.getElementById("btnLogoutMain");
  const authStatus = document.getElementById("authStatus");

  btnLoginMain?.addEventListener("click", async () => { try{ await loginGoogle(); }catch(e){} });
  btnLogoutMain?.addEventListener("click", async () => {
    showAuthError("");
    try{ await signOut(auth); }
    catch(err){ showAuthError(`No se pudo cerrar sesión. Error: ${err?.code || "desconocido"}`); }
  });

  onAuthStateChanged(auth, (user) => {
    if (authStatus){
      authStatus.textContent = user ? `${user.displayName || "Usuario"} (conectado)` : "Invitado";
    }
    if (btnLoginMain) btnLoginMain.hidden = !!user;
    if (btnLogoutMain) btnLogoutMain.hidden = !user;
    if (user) showAuthError("");
  });
}

/* ---------------- Mostrar MOD/ADMIN + rol ---------------- */
function setupModeratorEntry(){
  const memorialId = getMemorialId();

  const modEntry = document.getElementById("modEntry");
  const modPanel = document.getElementById("modPanel");
  const roleText = document.getElementById("modRoleText");

  if (modEntry) modEntry.hidden = true;
  if (modPanel) modPanel.hidden = true;

  onAuthStateChanged(auth, async (user) => {
    if (!user){
      if (modEntry) modEntry.hidden = true;
      if (modPanel) modPanel.hidden = true;
      if (roleText) roleText.textContent = "";
      return;
    }

    let role = "none";
    try{ role = await getRole(memorialId, user.uid); }
    catch(e){ role = "none"; }

    if (roleText) roleText.textContent = `Rol: ${roleLabel(role)}`;

    const canModerate = (role === "global-admin" || role === "memorial-admin" || role === "mod");
    const canPromote  = (role === "global-admin" || role === "memorial-admin");

    if (modEntry) modEntry.hidden = !canModerate;
    if (modPanel) modPanel.hidden = !canPromote;
  });
}

/* ---------------- Bloques emocionales ---------------- */
function injectEmotionalBlocks(d){
  const host = document.getElementById("extraBlocks");
  if (!host) return;

  const hero = d.hero || {};
  const quotes = Array.isArray(d.quotes) ? d.quotes : [];
  const sections = Array.isArray(d.sections) ? d.sections : [];

  const heroHtml = (hero.subtitle || hero.verse) ? `
    <section class="mSection">
      ${hero.subtitle ? `<h2>${escapeHtml(hero.subtitle)}</h2>` : `<h2>Recuerdo</h2>`}
      ${hero.verse ? `<p class="meta" style="margin:0">${escapeHtml(hero.verse)}</p>` : ``}
    </section>
  ` : "";

  // ✅ ahora esta sección tiene id="frases" para que el menú funcione siempre
  const quotesHtml = quotes.length ? `
    <section class="mSection" id="frases">
      <h2>Frases</h2>
      <div class="mQuotes">
        ${quotes.map(q => `<div class="mQuote">“${escapeHtml(q)}”</div>`).join("")}
      </div>
    </section>
  ` : `<div id="frases"></div>`;

  const sectionsHtml = sections.map(sec => {
    const title = escapeHtml(sec.title || "Sección");
    if (sec.type === "bullets"){
      const items = Array.isArray(sec.items) ? sec.items : [];
      return `
        <section class="mSection">
          <h2>${title}</h2>
          <ul class="mList">
            ${items.map(i => `<li>${escapeHtml(i)}</li>`).join("")}
          </ul>
        </section>
      `;
    }
    if (sec.type === "candle"){
      // Las velas ahora tienen su propia sección fija (con dedicatoria y muro).
      return "";
    }
    return `
      <section class="mSection">
        <h2>${title}</h2>
        <p class="mProse">${escapeHtml(sec.content || "")}</p>
      </section>
    `;
  }).join("");

  host.innerHTML = heroHtml + quotesHtml + sectionsHtml;
}

/* ---------------- Stats UI ---------------- */
const liveStats = { visits:0, comments:0, reactions:0, candles:0 };

function renderStats(){
  const sec = document.getElementById("statsSection");
  const grid = document.getElementById("statsGrid");
  if (!sec || !grid) return;

  sec.hidden = false;

  const cards = [
    { k: "Visitas",    v: `${liveStats.visits}`,    s: "Personas que han acompañado este recuerdo" },
    { k: "Recuerdos",  v: `${liveStats.comments}`,  s: "Mensajes dejados con cariño" },
    { k: "Velas",      v: `${liveStats.candles}`,   s: "Velas encendidas en este memorial" },
    { k: "Reacciones", v: `${liveStats.reactions}`, s: "Gestos de amor en las fotos" }
  ];

  grid.innerHTML = cards.map(c => `
    <div class="mStat">
      <p class="k">${escapeHtml(c.k)}</p>
      <p class="v">${escapeHtml(c.v)}</p>
      <p class="s">${escapeHtml(c.s)}</p>
    </div>
  `).join("");
}

function setupStatsLive(memorialId){
  onSnapshot(statsDoc(memorialId), (snap) => {
    const data = snap.exists() ? snap.data() : {};
    liveStats.visits = Number(data.visits || 0);
    liveStats.comments = Number(data.comments || 0);
    liveStats.reactions = Number(data.reactions || 0);
    renderStats();
  }, (err) => {
    console.warn("Stats snapshot error:", err?.code || err);
  });
}

/* ---------------- Velas globales ---------------- */
function candleBurst(){
  const host = document.getElementById("extraBlocks") || document.body;
  const n = 18;
  for (let i = 0; i < n; i++){
    const p = document.createElement("div");
    p.className = "cSpark";
    p.style.left = (50 + (Math.random()*20 - 10)) + "%";
    p.style.top = (Math.random()*8 + 2) + "px";
    p.style.setProperty("--dx", (Math.random()*220 - 110) + "px");
    p.style.setProperty("--dy", (Math.random()*-160 - 40) + "px");
    p.style.setProperty("--d", (700 + Math.random()*500) + "ms");
    host.appendChild(p);
    setTimeout(() => p.remove(), 1400);
  }
}

function setupGlobalCandles(memorialId){
  const sec = document.getElementById("candleSection");
  const btn = document.getElementById("candleBtn");
  const out = document.getElementById("candleCount");
  const wall = document.getElementById("candleWall");
  const msg = document.getElementById("candleMsg");
  if (!btn || !out) return;
  if (sec) sec.hidden = false;

  onSnapshot(
    candlesCol(memorialId),
    (snap) => {
      out.textContent = `🕯️ ${snap.size} ${snap.size === 1 ? "vela encendida" : "velas encendidas"}`;
      liveStats.candles = snap.size;
      renderStats();

      if (wall){
        const items = snap.docs
          .map(d => d.data() || {})
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        wall.innerHTML = items.map(c => `
          <div class="candleItem">
            <div class="candleFlame">🕯️</div>
            <div class="candleBody">
              <strong>${escapeHtml(c.name || "Anónimo")}</strong>
              ${c.message ? `<p>${escapeHtml(c.message)}</p>` : ``}
            </div>
          </div>
        `).join("");
      }
    },
    (err) => { console.warn("Candles snapshot error:", err?.code || err); }
  );

  onAuthStateChanged(auth, async (user) => {
    if (!user){
      btn.disabled = true;
      btn.textContent = "Inicia sesión para encender una vela";
      if (msg) msg.disabled = true;
      return;
    }

    btn.disabled = false;
    if (msg) msg.disabled = false;
    const ref = candleDoc(memorialId, user.uid);

    try{
      const snap = await getDoc(ref);
      btn.textContent = snap.exists() ? "🕯️ Apagar mi vela" : "🕯️ Encender vela";
    }catch(e){
      btn.textContent = "🕯️ Encender vela";
    }

    btn.onclick = async () => {
      try{
        const again = await getDoc(ref);
        if (again.exists()){
          await deleteDoc(ref);
          btn.textContent = "🕯️ Encender vela";
        } else {
          await setDoc(ref, {
            uid: user.uid,
            name: user.displayName || "Usuario",
            message: msg ? (msg.value || "").trim().slice(0, 200) : "",
            createdAt: serverTimestamp()
          });
          if (msg) msg.value = "";
          btn.textContent = "🕯️ Apagar mi vela";
        }
        candleBurst();
      }catch(err){
        showAuthError(`No se pudo actualizar la vela. Error: ${err?.code || "desconocido"}`);
      }
    };
  });
}

/* ---------------- Lightbox + comentarios + reacciones ---------------- */
function setupLightboxFirebase(gallery){
  const memorialId = getMemorialId();

  // ✅ 1 foto por click
  const NAV_STEP = 1;

  let canSeeHidden = false;

  const lb = document.getElementById("lightbox");
  const lbImg = document.getElementById("lbImg");
  const lbClose = document.getElementById("lbClose");

  const lbPrev = document.getElementById("lbPrev");
  const lbNext = document.getElementById("lbNext");

  const btnLogin = document.getElementById("btnLogin");
  const btnLogout = document.getElementById("btnLogout");
  const userInfo = document.getElementById("userInfo");

  const commentText = document.getElementById("commentText");
  const btnComment = document.getElementById("btnComment");
  const commentHint = document.getElementById("commentHint");
  const commentsList = document.getElementById("commentsList");

  const totals = {
    "❤️": document.getElementById("t_heart"),
    "🙏": document.getElementById("t_pray"),
    "🕯️": document.getElementById("t_candle"),
    "🌟": document.getElementById("t_star"),
    "😢": document.getElementById("t_sad")
  };

  if (!lb || !lbImg || !lbClose) return;

  let current = 0;
  let unsubComments = null;
  let unsubReactions = null;

  // Clave estable de cada foto (id del documento subido, o el índice original).
  const keyOf = (i) => gallery[i]?.key ?? String(i);

  function setAuthUI(user){
    const reactBtns = document.querySelectorAll(".rBtn");
    if (user){
      if (userInfo) userInfo.textContent = `${user.displayName || "Usuario"} (conectado)`;
      if (btnLogin) btnLogin.hidden = true;
      if (btnLogout) btnLogout.hidden = false;

      if (commentText) commentText.disabled = false;
      if (btnComment) btnComment.disabled = false;
      if (commentHint) commentHint.style.display = "none";
      reactBtns.forEach(b => b.disabled = false);
    } else {
      if (userInfo) userInfo.textContent = "Invitado";
      if (btnLogin) btnLogin.hidden = false;
      if (btnLogout) btnLogout.hidden = true;

      if (commentText) commentText.disabled = true;
      if (btnComment) btnComment.disabled = true;
      if (commentHint) commentHint.style.display = "block";
      reactBtns.forEach(b => b.disabled = true);
    }
  }

  onAuthStateChanged(auth, async (user) => {
    setAuthUI(user);
    if (!user){
      canSeeHidden = false;
      return;
    }
    try{
      const role = await getRole(memorialId, user.uid);
      canSeeHidden = (role !== "none");
    }catch(e){
      canSeeHidden = false;
    }
  });

  function normalizeIndex(i){
    const n = gallery.length || 0;
    if (!n) return 0;
    return (i % n + n) % n;
  }

  function updateNavVisibility(){
    const n = gallery.length || 0;
    if (lbPrev) lbPrev.hidden = n <= 1;
    if (lbNext) lbNext.hidden = n <= 1;
  }

  function setImage(i){
    current = normalizeIndex(i);
    if (!gallery[current]?.src) return;

    lbImg.src = gallery[current].src;

    const next = gallery[normalizeIndex(current + NAV_STEP)]?.src;
    const prev = gallery[normalizeIndex(current - NAV_STEP)]?.src;
    [next, prev].forEach((src) => {
      if (!src) return;
      const im = new Image();
      im.src = src;
    });
  }

  async function openLb(i){
    if (!gallery[i]?.src) return;

    updateNavVisibility();
    setImage(i);

    lb.hidden = false;
    document.body.style.overflow = "hidden";

    if (unsubComments) unsubComments();
    if (unsubReactions) unsubReactions();

    unsubComments = onSnapshot(
      query(commentsCol(memorialId, keyOf(current)), orderBy("createdAt", "desc")),
      (snap) => {
        if (!commentsList) return;

        if (snap.empty){
          commentsList.innerHTML = `<div class="lb__hint">Aún no hay comentarios en esta foto.</div>`;
          return;
        }

        const rendered = snap.docs
          .map(x => {
            const c = x.data() || {};
            const hidden = !!c.hidden;
            if (hidden && !canSeeHidden) return "";

            const ts = c.createdAt?.toDate ? c.createdAt.toDate().toLocaleString() : "";
            const badge = hidden ? `<div class="lb__hint">🛡️ Oculto</div>` : "";

            return `
              <div class="cItem">
                <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
                  <div><strong>${escapeHtml(c.name || "Anónimo")}</strong></div>
                  ${badge}
                </div>
                <div>${escapeHtml(c.text || "")}</div>
                <div class="cMeta">${escapeHtml(ts)}</div>
              </div>
            `;
          })
          .filter(Boolean)
          .join("");

        commentsList.innerHTML = rendered || `<div class="lb__hint">No hay comentarios para mostrar.</div>`;
      }
    );

    unsubReactions = onSnapshot(
      reactionsCol(memorialId, keyOf(current)),
      (snap) => {
        const sum = { "❤️":0,"🙏":0,"🕯️":0,"🌟":0,"😢":0 };
        snap.forEach(docu => {
          const r = docu.data() || {};
          for (const k of Object.keys(sum)) sum[k] += Number(r[k] || 0);
        });
        if (totals["❤️"]) totals["❤️"].textContent = String(sum["❤️"]);
        if (totals["🙏"]) totals["🙏"].textContent = String(sum["🙏"]);
        if (totals["🕯️"]) totals["🕯️"].textContent = String(sum["🕯️"]);
        if (totals["🌟"]) totals["🌟"].textContent = String(sum["🌟"]);
        if (totals["😢"]) totals["😢"].textContent = String(sum["😢"]);
      }
    );
  }

  function closeLb(){
    lb.hidden = true;
    lbImg.src = "";
    document.body.style.overflow = "";

    if (unsubComments) unsubComments();
    if (unsubReactions) unsubReactions();
    unsubComments = null;
    unsubReactions = null;
  }

  async function goTo(i){
    if (!gallery.length) return;
    setImage(i);

    if (unsubComments) unsubComments();
    if (unsubReactions) unsubReactions();

    unsubComments = onSnapshot(
      query(commentsCol(memorialId, keyOf(current)), orderBy("createdAt", "desc")),
      (snap) => {
        if (!commentsList) return;
        if (snap.empty){
          commentsList.innerHTML = `<div class="lb__hint">Aún no hay comentarios en esta foto.</div>`;
          return;
        }

        const rendered = snap.docs
          .map(x => {
            const c = x.data() || {};
            const hidden = !!c.hidden;
            if (hidden && !canSeeHidden) return "";

            const ts = c.createdAt?.toDate ? c.createdAt.toDate().toLocaleString() : "";
            const badge = hidden ? `<div class="lb__hint">🛡️ Oculto</div>` : "";

            return `
              <div class="cItem">
                <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
                  <div><strong>${escapeHtml(c.name || "Anónimo")}</strong></div>
                  ${badge}
                </div>
                <div>${escapeHtml(c.text || "")}</div>
                <div class="cMeta">${escapeHtml(ts)}</div>
              </div>
            `;
          })
          .filter(Boolean)
          .join("");

        commentsList.innerHTML = rendered || `<div class="lb__hint">No hay comentarios para mostrar.</div>`;
      }
    );

    unsubReactions = onSnapshot(
      reactionsCol(memorialId, keyOf(current)),
      (snap) => {
        const sum = { "❤️":0,"🙏":0,"🕯️":0,"🌟":0,"😢":0 };
        snap.forEach(docu => {
          const r = docu.data() || {};
          for (const k of Object.keys(sum)) sum[k] += Number(r[k] || 0);
        });
        if (totals["❤️"]) totals["❤️"].textContent = String(sum["❤️"]);
        if (totals["🙏"]) totals["🙏"].textContent = String(sum["🙏"]);
        if (totals["🕯️"]) totals["🕯️"].textContent = String(sum["🕯️"]);
        if (totals["🌟"]) totals["🌟"].textContent = String(sum["🌟"]);
        if (totals["😢"]) totals["😢"].textContent = String(sum["😢"]);
      }
    );
  }

  const galleryEl = document.getElementById("gallery");
  if (galleryEl){
    galleryEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".mThumbBtn");
      if (!btn) return;
      openLb(Number(btn.dataset.i));
    });
  }

  lbPrev?.addEventListener("click", () => { if (!lb.hidden) goTo(current - NAV_STEP); });
  lbNext?.addEventListener("click", () => { if (!lb.hidden) goTo(current + NAV_STEP); });

  lbClose.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeLb();
  });

  lb.addEventListener("click", (e) => {
    if (e.target === lb) closeLb();
  });

  window.addEventListener("keydown", (e) => {
    if (lb.hidden) return;
    if (e.key === "Escape") closeLb();
    if (e.key === "ArrowLeft") goTo(current - NAV_STEP);
    if (e.key === "ArrowRight") goTo(current + NAV_STEP);
  });

  let tStartX = 0, tLastX = 0, tActive = false;
  const SWIPE_MIN = 40;

  lbImg.addEventListener("touchstart", (e) => {
    if (lb.hidden) return;
    tActive = true;
    tStartX = e.touches[0].clientX;
    tLastX = tStartX;
  }, { passive: true });

  lbImg.addEventListener("touchmove", (e) => {
    if (!tActive) return;
    tLastX = e.touches[0].clientX;
  }, { passive: true });

  lbImg.addEventListener("touchend", () => {
    if (!tActive) return;
    tActive = false;
    const dx = tLastX - tStartX;
    if (Math.abs(dx) < SWIPE_MIN) return;

    if (dx > 0) goTo(current - NAV_STEP);
    else goTo(current + NAV_STEP);
  }, { passive: true });

  btnLogin?.addEventListener("click", async () => { try{ await loginGoogle(); }catch(e){} });
  btnLogout?.addEventListener("click", async () => {
    showAuthError("");
    try{ await signOut(auth); }
    catch(err){ showAuthError(`No se pudo cerrar sesión. Error: ${err?.code || "desconocido"}`); }
  });

  btnComment?.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user){
      showAuthError("Debes iniciar sesión para comentar.");
      return;
    }

    const text = (commentText?.value || "").trim();
    if (!text) return;

    try{
      await addDoc(commentsCol(memorialId, keyOf(current)), {
        uid: user.uid,
        name: user.displayName || "Usuario",
        text: text.slice(0, 500),
        createdAt: serverTimestamp(),
        hidden: false
      });

      await bumpStat(memorialId, "comments", 1);

      if (commentText) commentText.value = "";
    }catch(err){
      showAuthError(`No se pudo publicar. Error: ${err?.code || "desconocido"}`);
    }
  });

  document.querySelectorAll(".rBtn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const user = auth.currentUser;
      if (!user){
        showAuthError("Debes iniciar sesión para reaccionar.");
        return;
      }

      const emo = btn.dataset.r;
      const reactionRef = doc(reactionsCol(memorialId, keyOf(current)), user.uid);
      const sRef = statsDoc(memorialId);

      try{
        await runTransaction(db, async (tx) => {
          const rs = await tx.get(reactionRef);
          const data = rs.exists() ? (rs.data() || {}) : {};
          const prev = Number(data[emo] || 0);
          const next = (prev === 1) ? 0 : 1;

          tx.set(reactionRef, { [emo]: next, updatedAt: serverTimestamp() }, { merge: true });

          const delta = next - prev;
          tx.set(sRef, { reactions: increment(delta), updatedAt: serverTimestamp() }, { merge: true });
        });
      }catch(err){
        showAuthError(`No se pudo reaccionar. Error: ${err?.code || "desconocido"}`);
      }
    });
  });
}

/* ---------------- Audio UX ---------------- */
function setupAudioUX(){
  const ap = document.getElementById("audioPlayer");
  const btn = document.getElementById("audioToggle");
  if (!ap || !btn) return;

  try{ ap.volume = 0.25; }catch(e){}

  const setLabel = () => { btn.textContent = ap.paused ? "▶ Reproducir" : "⏸ Pausar"; };

  btn.addEventListener("click", async () => {
    try{
      if (ap.paused) await ap.play();
      else ap.pause();
      setLabel();
    }catch(e){
      setLabel();
    }
  });

  ap.addEventListener("play", setLabel);
  ap.addEventListener("pause", setLabel);
  ap.addEventListener("ended", setLabel);

  setLabel();
}

/* ---------------- ✅ Menú + Volver arriba ---------------- */
function getScrollOffset(){
  const top = document.getElementById("topBar");
  const nav = document.querySelector(".mNav");
  const h1 = top ? top.getBoundingClientRect().height : 0;
  const h2 = nav ? nav.getBoundingClientRect().height : 0;
  return Math.ceil(h1 + h2 + 12);
}

function smoothGoTo(hash){
  const id = (hash || "").replace("#", "");
  const el = document.getElementById(id);
  if (!el) return;

  const offset = getScrollOffset();
  const y = window.scrollY + el.getBoundingClientRect().top - offset;

  window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
}

function setupStickyNavUX(){
  const nav = document.getElementById("memNav");
  if (!nav) return;

  nav.addEventListener("click", (e) => {
    const a = e.target.closest("a[href^='#']");
    if (!a) return;
    e.preventDefault();
    smoothGoTo(a.getAttribute("href"));
  });

  // Scrollspy elegante (marca el botón activo)
  const links = Array.from(nav.querySelectorAll("a[href^='#']"));
  const targets = links
    .map(a => document.getElementById(a.getAttribute("href").slice(1)))
    .filter(Boolean);

  const setActive = (id) => {
    links.forEach(a => a.classList.toggle("is-active", a.getAttribute("href") === `#${id}`));
  };

  const pickActive = () => {
    const offset = getScrollOffset() + 8;
    let best = null;

    for (const t of targets){
      const top = t.getBoundingClientRect().top - offset;
      if (top <= 0) best = t;
    }
    if (best?.id) setActive(best.id);
  };

  window.addEventListener("scroll", pickActive, { passive: true });
  window.addEventListener("resize", pickActive);
  pickActive();
}

function setupToTop(){
  const btn = document.getElementById("btnToTop");
  if (!btn) return;

  const toggle = () => {
    btn.hidden = window.scrollY < 700;
  };

  btn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  window.addEventListener("scroll", toggle, { passive: true });
  toggle();
}

/* ---------------- Galería paginada (6 por página) ---------------- */
const GALLERY_PER_PAGE = 6;
function setupGalleryPaged(gallery){
  const g = document.getElementById("gallery");
  if (!g) return;

  if (!gallery.length){
    g.innerHTML = `<p class="meta">Aún no hay fotos en esta galería.</p>`;
    return;
  }

  let pager = document.getElementById("galleryPager");
  if (!pager){
    pager = document.createElement("div");
    pager.id = "galleryPager";
    pager.className = "mPager";
    g.insertAdjacentElement("afterend", pager);
  }

  const pages = Math.ceil(gallery.length / GALLERY_PER_PAGE);
  let page = 0;

  function render(){
    const start = page * GALLERY_PER_PAGE;
    const slice = gallery.slice(start, start + GALLERY_PER_PAGE);

    g.innerHTML = slice.map((it, j) => {
      const gi = start + j; // índice global (para abrir la foto correcta en el visor)
      return `
        <button class="mThumbBtn" type="button" data-i="${gi}" aria-label="Abrir imagen">
          <div class="mThumbWrap">
            <img class="mThumb" src="${it.src}" alt="" loading="lazy" draggable="false">
            ${it.caption ? `<div class="mCap">${escapeHtml(it.caption)}</div>` : ``}
          </div>
        </button>`;
    }).join("");

    if (pages <= 1){ pager.innerHTML = ""; return; }
    pager.innerHTML = `
      <button class="mPagerBtn" type="button" data-act="prev" ${page === 0 ? "disabled" : ""}>‹ Anterior</button>
      <span class="mPagerInfo">Página ${page + 1} de ${pages}</span>
      <button class="mPagerBtn" type="button" data-act="next" ${page === pages - 1 ? "disabled" : ""}>Siguiente ›</button>
    `;
  }

  pager.onclick = (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    if (b.dataset.act === "prev" && page > 0) page--;
    else if (b.dataset.act === "next" && page < pages - 1) page++;
    else return;
    render();
  };

  render();
}

/* ---------------- Carrusel genérico (puntos + flechas) ---------------- */
function buildCarNav(count){
  const nav = document.createElement("div");
  nav.className = "mCarNav";
  nav.innerHTML = `
    <button class="mCarBtn" type="button" data-d="-1" aria-label="Anterior">‹</button>
    <div class="mDots">
      ${Array.from({length: count}, (_, k) => `<button class="mDot" type="button" data-k="${k}" aria-label="Ir al ${k + 1}"></button>`).join("")}
    </div>
    <span class="mCarInfo"></span>
    <button class="mCarBtn" type="button" data-d="1" aria-label="Siguiente">›</button>
  `;
  return nav;
}

/* ---------------- Carrusel de videos ---------------- */
function setupVideoCarousel(videos){
  const sec = document.getElementById("videoSection");
  const frame = document.getElementById("videoFrame");
  if (!sec || !frame) return;
  if (!videos.length){ sec.hidden = true; return; }

  sec.hidden = false;
  frame.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");

  let idx = 0, dots = null, info = null;
  const setV = (i) => {
    idx = (i % videos.length + videos.length) % videos.length;
    frame.src = toYouTubeEmbed(videos[idx]);
    if (dots) [...dots.children].forEach((d, k) => d.classList.toggle("is-active", k === idx));
    if (info) info.textContent = `${idx + 1} / ${videos.length}`;
  };

  if (videos.length > 1){
    const nav = buildCarNav(videos.length);
    sec.querySelector(".mVideo").insertAdjacentElement("afterend", nav);
    dots = nav.querySelector(".mDots");
    info = nav.querySelector(".mCarInfo");
    nav.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.d) setV(idx + Number(b.dataset.d));
      else if (b.dataset.k != null) setV(Number(b.dataset.k));
    });
  }
  setV(0);
}

/* ---------------- Carrusel de audios ---------------- */
function setupAudioCarousel(audios){
  const sec = document.getElementById("audioSection");
  const player = document.getElementById("audioPlayer");
  if (!sec || !player) return;
  if (!audios.length){ sec.hidden = true; return; }

  sec.hidden = false;
  const hint = document.getElementById("audioHint");

  let idx = 0, dots = null, info = null;
  const setA = (i) => {
    idx = (i % audios.length + audios.length) % audios.length;
    const a = audios[idx];
    const wasPlaying = !player.paused;
    player.src = a.url;
    if (hint) hint.textContent = a.caption || "Volumen inicial suave. Puedes ajustar desde los controles.";
    if (dots) [...dots.children].forEach((d, k) => d.classList.toggle("is-active", k === idx));
    if (info) info.textContent = `${idx + 1} / ${audios.length}`;
    if (wasPlaying) player.play().catch(() => {});
  };

  if (audios.length > 1){
    const nav = buildCarNav(audios.length);
    sec.querySelector(".mAudio").insertAdjacentElement("afterend", nav);
    dots = nav.querySelector(".mDots");
    info = nav.querySelector(".mCarInfo");
    nav.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.d) setA(idx + Number(b.dataset.d));
      else if (b.dataset.k != null) setA(Number(b.dataset.k));
    });
  }
  setA(0);
  setupAudioUX();
}

/* ---------------- Línea de tiempo de su vida ---------------- */
function renderTimeline(items){
  const sec = document.getElementById("timelineSection");
  const host = document.getElementById("timeline");
  if (!sec || !host) return;

  const list = Array.isArray(items) ? items.filter(x => x && (x.title || x.text || x.year)) : [];
  if (!list.length){ sec.hidden = true; return; }

  sec.hidden = false;
  host.innerHTML = list.map(it => `
    <div class="mTLItem">
      <div class="mTLYear">${escapeHtml(it.year || "")}</div>
      <div class="mTLBody">
        ${it.title ? `<h3 class="mTLTitle">${escapeHtml(it.title)}</h3>` : ""}
        ${it.text ? `<p class="mTLText">${escapeHtml(it.text)}</p>` : ""}
      </div>
    </div>
  `).join("");
}

/* ---------------- Libro de condolencias ---------------- */
function setupGuestbook(memorialId){
  const sec = document.getElementById("guestbook");
  const text = document.getElementById("gbText");
  const send = document.getElementById("gbSend");
  const hint = document.getElementById("gbHint");
  const list = document.getElementById("gbList");
  if (!sec || !text || !send || !list) return;

  const col = guestbookCol(memorialId);

  onAuthStateChanged(auth, (user) => {
    send.disabled = !user;
    text.disabled = !user;
    if (hint) hint.style.display = user ? "none" : "block";
  });

  send.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;
    const t = (text.value || "").trim();
    if (!t) return;
    send.disabled = true;
    try{
      await addDoc(col, {
        uid: user.uid,
        name: user.displayName || "Anónimo",
        text: t.slice(0, 800),
        createdAt: serverTimestamp(),
        hidden: false
      });
      text.value = "";
    }catch(e){
      showAuthError("No se pudo publicar el mensaje. Error: " + (e?.code || "desconocido"));
    }finally{
      send.disabled = !auth.currentUser;
    }
  });

  onSnapshot(query(col, orderBy("createdAt", "desc")), (snap) => {
    if (snap.empty){
      list.innerHTML = `<div class="lb__hint">Aún no hay mensajes. Sé el primero en dejar unas palabras. 🕯️</div>`;
      return;
    }
    const html = snap.docs.map(docu => {
      const c = docu.data() || {};
      if (c.hidden) return "";
      const ts = c.createdAt?.toDate ? c.createdAt.toDate().toLocaleDateString() : "";
      return `
        <div class="cItem">
          <div><strong>${escapeHtml(c.name || "Anónimo")}</strong></div>
          <div>${escapeHtml(c.text || "")}</div>
          <div class="cMeta">${escapeHtml(ts)}</div>
        </div>`;
    }).filter(Boolean).join("");
    list.innerHTML = html || `<div class="lb__hint">Aún no hay mensajes.</div>`;
  }, (err) => {
    console.warn("Guestbook snapshot error:", err?.code || err);
  });
}

/* ---------------- Modo presentación (slideshow) ---------------- */
function setupSlideshow(gallery, audios, homageMusicUrl){
  const btn = document.getElementById("btnSlideshow");
  const overlay = document.getElementById("slideshow");
  if (!btn || !overlay) return;

  if (!gallery.length){ btn.hidden = true; return; }
  btn.hidden = false;

  const img = document.getElementById("ssImg");
  const cap = document.getElementById("ssCap");
  const closeBtn = document.getElementById("ssClose");
  let i = 0, timer = null;

  // Música suave del homenaje: pista dedicada (si se subió), o si no, el primer audio.
  const musicUrl = homageMusicUrl || (audios[0] && audios[0].url) || "";
  let music = null;

  function show(n){
    i = (n % gallery.length + gallery.length) % gallery.length;
    if (!img) return;
    img.style.opacity = "0";
    setTimeout(() => {
      img.src = gallery[i].src;
      if (cap) cap.textContent = gallery[i].caption || "";
      img.style.opacity = "1";
    }, 250);
  }
  function start(){
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    show(0);
    timer = setInterval(() => show(i + 1), 4500);
    if (musicUrl){
      try{
        if (!music){ music = new Audio(musicUrl); music.loop = true; music.volume = 0.25; }
        music.play().catch(() => {});
      }catch(e){}
    }
  }
  function stop(){
    overlay.hidden = true;
    document.body.style.overflow = "";
    if (timer) clearInterval(timer);
    timer = null;
    if (music){ try{ music.pause(); }catch(e){} }
  }

  btn.addEventListener("click", start);
  closeBtn?.addEventListener("click", stop);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) stop(); });
  window.addEventListener("keydown", (e) => {
    if (overlay.hidden) return;
    if (e.key === "Escape") stop();
    if (e.key === "ArrowRight") show(i + 1);
    if (e.key === "ArrowLeft") show(i - 1);
  });
}

/* ---------------- Main ---------------- */
async function loadMemorial(){
  showLoader();

  await initAuthPersistence();
  setupGlobalAuthUI();
  setupModeratorEntry();
  setupShare();

  try{ await getRedirectResult(auth); }catch(e){}

  const memorialId = getMemorialId();

  setupWelcomeGate(memorialId);

  await ensureStats(memorialId);
  await bumpVisit(memorialId);
  setupStatsLive(memorialId);

  // data.json es OPCIONAL: la página genérica (/memorial/?m=ID) toma todo de la nube.
  const d = await loadBaseData(memorialId);

  // 🔄 Contenido subido desde el panel (sobreescribe data.json cuando existe)
  const { content: dyn, gallery: dynGallery } = await loadDynamicContent(memorialId);

  // Textos
  if (dyn.name) d.name = dyn.name;
  if (dyn.dates) d.dates = dyn.dates;
  if (dyn.bio) d.bio = dyn.bio;
  if (Array.isArray(dyn.quotes) && dyn.quotes.length) d.quotes = dyn.quotes;
  if (dyn.history){
    d.sections = Array.isArray(d.sections) ? d.sections.slice() : [];
    const idx = d.sections.findIndex(s => String(s.title || "").toLowerCase().includes("historia"));
    if (idx >= 0) d.sections[idx] = { ...d.sections[idx], type: "text", content: dyn.history };
    else d.sections.unshift({ title: "Historia", type: "text", content: dyn.history });
  }

  document.title = (d.name || "Memorial") + " | Imprime tu Recuerdo";

  const coverSrc = dyn.coverUrl || d.cover || "";
  const cover = document.getElementById("cover");
  if (cover){
    cover.src = coverSrc;
    cover.alt = d.name ? `Foto de ${d.name}` : "Foto";
  }
  const coverBg = document.getElementById("coverBg");
  if (coverBg){
    coverBg.src = coverSrc;
  }

  const nameEl = document.getElementById("name");
  const datesEl = document.getElementById("dates");
  const bioEl = document.getElementById("bio");
  if (nameEl) nameEl.textContent = d.name || "";
  if (datesEl) datesEl.textContent = d.dates || "";
  if (bioEl) bioEl.textContent = d.bio || "";

  injectEmotionalBlocks(d);

  // Galería: si hay fotos subidas en la nube, se usan esas (con su clave estable);
  // si no, se usan las de data.json (clave = índice, para conservar comentarios).
  let gallery;
  if (dynGallery.length){
    gallery = dynGallery.map(x => ({ src: x.url, caption: x.caption || "", key: x.key }));
  } else {
    const items = Array.isArray(d.gallery) ? d.gallery : [];
    gallery = items.map((x, i) => {
      const o = (typeof x === "string") ? { src: x, caption: "" } : x;
      return { src: o.src, caption: o.caption || "", key: String(i) };
    });
  }

  // Galería paginada (6 por página). El lightbox sigue recorriendo TODAS las fotos.
  setupGalleryPaged(gallery);

  // Videos: uno o varios, en carrusel
  let videos = Array.isArray(dyn.videos) ? dyn.videos.filter(Boolean) : [];
  if (!videos.length){
    const single = dyn.videoUrl || d.video?.youtubeEmbedUrl;
    if (single) videos = [single];
  }
  setupVideoCarousel(videos);

  // Audios: uno o varios, en carrusel
  let audios = Array.isArray(dyn.audios) ? dyn.audios.filter(a => a && a.url) : [];
  if (!audios.length){
    const single = dyn.audioUrl || d.audio?.src;
    if (single) audios = [{ url: single, caption: d.audio?.caption || "" }];
  }
  setupAudioCarousel(audios);

  renderTimeline(Array.isArray(dyn.timeline) ? dyn.timeline : d.timeline);
  setupGuestbook(memorialId);
  setupSlideshow(gallery, audios, dyn.homageMusicUrl || d.homageMusicUrl);

  setupLightboxFirebase(gallery);
  setupGlobalCandles(memorialId);

  // ✅ nav y botón arriba
  setupStickyNavUX();
  setupToTop();

  renderStats();
  hideLoader();
}

loadMemorial().catch((e) => {
  console.error(e);
  hideLoader();
});
