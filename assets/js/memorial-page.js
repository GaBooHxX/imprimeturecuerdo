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
  // 1) ?mid=
  const url = new URL(location.href);
  const mid = url.searchParams.get("mid");
  if (mid) return mid;

  // 2) /memoriales/{id}/ o /memorials/{id}/
  const parts = location.pathname.split("/").filter(Boolean);

  const idxEs = parts.indexOf("memoriales");
  if (idxEs >= 0 && parts[idxEs + 1]) return parts[idxEs + 1];

  const idxEn = parts.indexOf("memorials");
  if (idxEn >= 0 && parts[idxEn + 1]) return parts[idxEn + 1];

  // 3) fallback: último segmento
  return parts[parts.length - 1] || "memorial";
}

function commentsCol(memorialId, photoIndex){
  return collection(db, "memorials", memorialId, "photos", String(photoIndex), "comments");
}
function reactionsCol(memorialId, photoIndex){
  return collection(db, "memorials", memorialId, "photos", String(photoIndex), "reactions");
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

    // crea doc (cumple reglas: números)
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
  // 1 visita por dispositivo por día
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

/* ---------------- UID row ---------------- */
function setupUidRow(){
  const row = document.getElementById("uidRow");
  const myUid = document.getElementById("myUid");
  const copyBtn = document.getElementById("copyUid");
  if (!row || !myUid || !copyBtn) return;

  onAuthStateChanged(auth, (user) => {
    if (!user){
      row.hidden = true;
      myUid.textContent = "";
      return;
    }
    row.hidden = false;
    myUid.textContent = user.uid;

    copyBtn.onclick = async () => {
      try{
        await navigator.clipboard.writeText(user.uid);
        copyBtn.textContent = "¡Copiado!";
        setTimeout(() => copyBtn.textContent = "Copiar UID", 900);
      }catch(e){
        copyBtn.textContent = "No se pudo copiar";
        setTimeout(() => copyBtn.textContent = "Copiar UID", 1200);
      }
    };
  });
}

/* ---------------- Mostrar MOD/ADMIN + rol (solo indicador) ---------------- */
function setupModeratorEntry(){
  const memorialId = getMemorialId();

  const modEntry = document.getElementById("modEntry");
  const modPanel = document.getElementById("modPanel");
  const roleText = document.getElementById("modRoleText");

  // Nota: el modal real lo maneja mod.js, aquí solo ocultamos/mostramos el acceso si existe.
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

  const quotesHtml = quotes.length ? `
    <section class="mSection">
      <h2>Frases</h2>
      <div class="mQuotes">
        ${quotes.map(q => `<div class="mQuote">“${escapeHtml(q)}”</div>`).join("")}
      </div>
    </section>
  ` : "";

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
      return `
        <section class="mSection">
          <h2>${title}</h2>
          <p class="meta">${escapeHtml(sec.content || "")}</p>
          <button class="mCandleBtn" type="button" id="candleBtn">🕯️ Encender vela</button>
          <p class="meta" id="candleCount" style="margin-top:10px"></p>
        </section>
      `;
    }
    return `
      <section class="mSection">
        <h2>${title}</h2>
        <p class="meta">${escapeHtml(sec.content || "")}</p>
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
  const btn = document.getElementById("candleBtn");
  const out = document.getElementById("candleCount");
  if (!btn || !out) return;

  onSnapshot(
    candlesCol(memorialId),
    (snap) => {
      out.textContent = `🕯️ ${snap.size} velas encendidas`;
      liveStats.candles = snap.size;
      renderStats();
    },
    (err) => { console.warn("Candles snapshot error:", err?.code || err); }
  );

  onAuthStateChanged(auth, async (user) => {
    if (!user){
      btn.disabled = true;
      btn.textContent = "Inicia sesión para encender una vela";
      return;
    }

    btn.disabled = false;
    const ref = candleDoc(memorialId, user.uid);

    try{
      const snap = await getDoc(ref);
      btn.textContent = snap.exists() ? "🕯️ Apagar vela" : "🕯️ Encender vela";
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
            createdAt: serverTimestamp()
          });
          btn.textContent = "🕯️ Apagar vela";
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

  let canSeeHidden = false;

  const lb = document.getElementById("lightbox");
  const lbImg = document.getElementById("lbImg");
  const lbClose = document.getElementById("lbClose");

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

  async function openLb(i){
    if (!gallery[i]?.src) return;
    current = i;

    lbImg.src = gallery[i].src;
    lb.hidden = false;
    document.body.style.overflow = "hidden";

    if (unsubComments) unsubComments();
    if (unsubReactions) unsubReactions();

    // COMMENTS
    unsubComments = onSnapshot(
      query(commentsCol(memorialId, i), orderBy("createdAt", "desc")),
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
      },
      (err) => {
        console.warn("comments snapshot error:", err?.code || err);
        if (commentsList){
          commentsList.innerHTML = `<div class="lb__hint">No se pudieron cargar comentarios (${escapeHtml(err?.code || "error")}).</div>`;
        }
      }
    );

    // REACTIONS (conteo por foto)
    unsubReactions = onSnapshot(
      reactionsCol(memorialId, i),
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
      },
      (err) => {
        console.warn("reactions snapshot error:", err?.code || err);
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

  // abrir desde galería
  const galleryEl = document.getElementById("gallery");
  if (galleryEl){
    galleryEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".mThumbBtn");
      if (!btn) return;
      openLb(Number(btn.dataset.i));
    });
  }

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
  });

  btnLogin?.addEventListener("click", async () => { try{ await loginGoogle(); }catch(e){} });
  btnLogout?.addEventListener("click", async () => {
    showAuthError("");
    try{ await signOut(auth); }
    catch(err){ showAuthError(`No se pudo cerrar sesión. Error: ${err?.code || "desconocido"}`); }
  });

  // comentar
  btnComment?.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user){
      showAuthError("Debes iniciar sesión para comentar.");
      return;
    }

    const text = (commentText?.value || "").trim();
    if (!text) return;

    try{
      await addDoc(commentsCol(memorialId, current), {
        uid: user.uid,
        name: user.displayName || "Usuario",
        text: text.slice(0, 500),
        createdAt: serverTimestamp(),
        hidden: false
      });

      // contador global de comentarios
      await bumpStat(memorialId, "comments", 1);

      if (commentText) commentText.value = "";
    }catch(err){
      showAuthError(`No se pudo publicar. Error: ${err?.code || "desconocido"}`);
    }
  });

  // reacciones (y contador global reactions con transacción)
  document.querySelectorAll(".rBtn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const user = auth.currentUser;
      if (!user){
        showAuthError("Debes iniciar sesión para reaccionar.");
        return;
      }

      const emo = btn.dataset.r;
      const reactionRef = doc(reactionsCol(memorialId, current), user.uid);
      const sRef = statsDoc(memorialId);

      try{
        await runTransaction(db, async (tx) => {
          const rs = await tx.get(reactionRef);
          const data = rs.exists() ? (rs.data() || {}) : {};
          const prev = Number(data[emo] || 0);
          const next = (prev === 1) ? 0 : 1;

          tx.set(reactionRef, { [emo]: next, updatedAt: serverTimestamp() }, { merge: true });

          const delta = next - prev; // +1 o -1
          tx.set(sRef, { reactions: increment(delta), updatedAt: serverTimestamp() }, { merge: true });
        });
      }catch(err){
        showAuthError(`No se pudo reaccionar. Error: ${err?.code || "desconocido"}`);
      }
    });
  });
}

/* ---------------- Anniversary mode ---------------- */
function applyAnniversary(d){
  // default 08-06 (6 de agosto) => "MM-DD"
  const mmdd = (d?.anniversary || "08-06").trim();
  const today = new Date();
  const t = String(today.getMonth()+1).padStart(2,"0") + "-" + String(today.getDate()).padStart(2,"0");
  if (t !== mmdd) return;

  document.body.classList.add("anniversary");
  const banner = document.getElementById("anniversaryBanner");
  if (banner) banner.hidden = false;
}

/* ---------------- Welcome gate ---------------- */
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

/* ---------------- Main ---------------- */
async function loadMemorial(){
  await initAuthPersistence();
  setupGlobalAuthUI();
  setupUidRow();
  setupModeratorEntry();

  try{ await getRedirectResult(auth); }catch(e){}

  const memorialId = getMemorialId();

  // welcome
  setupWelcomeGate(memorialId);

  // stats
  await ensureStats(memorialId);
  await bumpVisit(memorialId);
  setupStatsLive(memorialId);

  // data.json
  const res = await fetch("data.json", { cache: "no-store" });
  if (!res.ok) throw new Error("No se pudo cargar data.json");
  const d = await res.json();

  applyAnniversary(d);

  document.title = (d.name || "Memorial") + " | Imprime tu Recuerdo";

  // cover + blur
  const cover = document.getElementById("cover");
  if (cover){
    cover.src = d.cover || "";
    cover.alt = d.name ? `Foto de ${d.name}` : "Foto";
  }
  const coverBg = document.getElementById("coverBg");
  if (coverBg){
    coverBg.src = d.cover || "";
  }

  // texts
  const nameEl = document.getElementById("name");
  const datesEl = document.getElementById("dates");
  const bioEl = document.getElementById("bio");
  if (nameEl) nameEl.textContent = d.name || "";
  if (datesEl) datesEl.textContent = d.dates || "";
  if (bioEl) bioEl.textContent = d.bio || "";

  injectEmotionalBlocks(d);

  // gallery
  const items = Array.isArray(d.gallery) ? d.gallery : [];
  const gallery = items.map(x => (typeof x === "string" ? ({ src: x, caption: "" }) : x));
  const g = document.getElementById("gallery");
  if (g){
    g.innerHTML = gallery.map((it, i) => `
  <button class="mThumbBtn" type="button" data-i="${i}" aria-label="Abrir imagen">
    <div class="mThumbWrap">
      <img class="mThumb" src="${it.src}" alt="" loading="lazy" draggable="false">
      ${it.caption ? `<div class="mCap">${escapeHtml(it.caption)}</div>` : ``}
    </div>
  </button>
`).join("");

  }

  // video/audio
  if (d.video?.youtubeEmbedUrl){
    const vs = document.getElementById("videoSection");
    const vf = document.getElementById("videoFrame");
    if (vs) vs.hidden = false;
    if (vf){
      vf.src = d.video.youtubeEmbedUrl; // usa /embed/ (no m.youtube.com)
      vf.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
    }
  }
  if (d.audio?.src){
    const as = document.getElementById("audioSection");
    const ap = document.getElementById("audioPlayer");
    if (as) as.hidden = false;
    if (ap) ap.src = d.audio.src;
  }

  // firebase features
  setupLightboxFirebase(gallery);
  setupGlobalCandles(memorialId);

  renderStats();
}

loadMemorial().catch(console.error);
