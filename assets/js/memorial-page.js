import { firebaseConfig } from "./firebase-config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* ---------------- Firebase init ---------------- */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

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
  const parts = location.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("memoriales");
  return (idx >= 0 && parts[idx + 1]) ? parts[idx + 1] : "memorial";
}

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

async function initAuthPersistence(){
  try{
    await setPersistence(auth, browserLocalPersistence);
  }catch(e){
    console.warn("Persistencia NO aplicada:", e?.code || e);
  }
}

/* --- rutas firestore --- */
const adminDoc = (uid) => doc(db, "admins", uid);

const roleDoc = (memorialId, uid) => doc(db, "memorials", memorialId, "roles", uid);
const blockedDoc = (memorialId, uid) => doc(db, "memorials", memorialId, "blocked", uid);

const candlesCol = (memorialId) => collection(db, "memorials", memorialId, "candles");
const candleDoc = (memorialId, uid) => doc(db, "memorials", memorialId, "candles", uid);

const commentsCol = (memorialId, photoIndex) =>
  collection(db, "memorials", memorialId, "photos", String(photoIndex), "comments");

const reactionsCol = (memorialId, photoIndex) =>
  collection(db, "memorials", memorialId, "photos", String(photoIndex), "reactions");

/* ---------------- Auth (popup + fallback redirect) ---------------- */
async function loginGoogle(){
  showAuthError("");
  await initAuthPersistence();

  try{
    await signInWithPopup(auth, provider);
  }catch(err){
    const code = err?.code || "";
    // fallback móvil / bloqueos popup
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

/* ---------------- Roles (admin / moderator) + bloqueo ---------------- */
async function getPrivileges(memorialId, user){
  if (!user) return { isAdmin:false, isModerator:false, isBlocked:false };

  const [a, r, b] = await Promise.all([
    getDoc(adminDoc(user.uid)),
    getDoc(roleDoc(memorialId, user.uid)),
    getDoc(blockedDoc(memorialId, user.uid))
  ]);

  const isAdmin = a.exists();
  const role = r.exists() ? String(r.data()?.role || "") : "";
  const isModerator = isAdmin || role === "owner" || role === "moderator";
  const isBlocked = b.exists();

  return { isAdmin, isModerator, isBlocked, role };
}

/* ---------------- UI: Login global ---------------- */
let globalAuthReady = false;
function setupGlobalAuthUI(){
  if (globalAuthReady) return;
  globalAuthReady = true;

  const btnLoginMain = document.getElementById("btnLoginMain");
  const btnLogoutMain = document.getElementById("btnLogoutMain");
  const authStatus = document.getElementById("authStatus");

  btnLoginMain?.addEventListener("click", async () => {
    try { await loginGoogle(); } catch(e){}
  });

  btnLogoutMain?.addEventListener("click", async () => {
    showAuthError("");
    try { await signOut(auth); } catch(e){
      showAuthError(`No se pudo cerrar sesión. Error: ${e?.code || "desconocido"}`);
    }
  });

  onAuthStateChanged(auth, async (user) => {
    authStatus && (authStatus.textContent = user ? `${user.displayName || "Usuario"} (conectado)` : "Invitado");
    btnLoginMain && (btnLoginMain.hidden = !!user);
    btnLogoutMain && (btnLogoutMain.hidden = !user);
    if (user) showAuthError("");
  });
}

/* ---------------- Emotional blocks + velas globales ---------------- */
function injectEmotionalBlocks(d){
  // NO uses el div extraBlocks del HTML para inyectar otra vez: ya existe
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
          <p class="meta" id="candleHint" style="margin-top:6px; opacity:.8"></p>
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

function candleBurst(){
  // partículas doradas (usa tu CSS .cSpark)
  const btn = document.getElementById("candleBtn");
  if (!btn) return;

  const rect = btn.getBoundingClientRect();
  const x = rect.left + rect.width/2;
  const y = rect.top + rect.height/2;

  const n = 18;
  for (let i=0;i<n;i++){
    const p = document.createElement("div");
    p.className = "cSpark";
    p.style.position = "fixed";
    p.style.left = x + "px";
    p.style.top = y + "px";
    p.style.setProperty("--dx", (Math.random()*220 - 110) + "px");
    p.style.setProperty("--dy", (Math.random()*-160 - 40) + "px");
    p.style.setProperty("--d", (700 + Math.random()*500) + "ms");
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1400);
  }
}

function setupGlobalCandles(memorialId){
  const btn = document.getElementById("candleBtn");
  const out = document.getElementById("candleCount");
  const hint = document.getElementById("candleHint");
  if (!btn || !out) return;

  // contador total
  onSnapshot(candlesCol(memorialId), (snap) => {
    out.textContent = `🕯️ ${snap.size} velas encendidas`;
  });

  onAuthStateChanged(auth, async (user) => {
    const priv = await getPrivileges(memorialId, user);

    if (!user){
      btn.disabled = true;
      btn.textContent = "Inicia sesión para encender una vela";
      hint && (hint.textContent = "");
      return;
    }

    if (priv.isBlocked){
      btn.disabled = true;
      btn.textContent = "No disponible";
      hint && (hint.textContent = "Tu cuenta está bloqueada en este memorial.");
      return;
    }

    btn.disabled = false;
    const ref = candleDoc(memorialId, user.uid);
    const snap = await getDoc(ref);

    btn.textContent = snap.exists() ? "🕯️ Apagar vela" : "🕯️ Encender vela";

    btn.onclick = async () => {
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
    };
  });
}

/* ---------------- Lightbox + comentarios + reacciones + moderación ---------------- */
function setupLightboxFirebase(d, gallery){
  const memorialId = getMemorialId();

  // Lightbox base
  const lb = document.getElementById("lightbox");
  const lbImg = document.getElementById("lbImg");
  const lbClose = document.getElementById("lbClose");

  // Auth inside LB
  const btnLogin = document.getElementById("btnLogin");
  const btnLogout = document.getElementById("btnLogout");
  const userInfo = document.getElementById("userInfo");

  // Comments
  const commentText = document.getElementById("commentText");
  const btnComment = document.getElementById("btnComment");
  const commentHint = document.getElementById("commentHint");
  const commentsList = document.getElementById("commentsList");

  // Totals
  const totals = {
    "❤️": document.getElementById("t_heart"),
    "🙏": document.getElementById("t_pray"),
    "🕯️": document.getElementById("t_candle"),
    "🌟": document.getElementById("t_star"),
    "😢": document.getElementById("t_sad")
  };

  if (!lb || !lbImg || !lbClose || !btnLogin || !btnLogout || !userInfo || !commentText || !btnComment || !commentHint || !commentsList){
    console.error("Falta el lightbox PRO en index.html (login/comentarios/reacciones).");
    return;
  }

  let current = 0;
  let unsubComments = null;
  let unsubReactions = null;

  // estado
  let priv = { isAdmin:false, isModerator:false, isBlocked:false };

  async function refreshPrivileges(){
    priv = await getPrivileges(memorialId, auth.currentUser);
  }

  function setAuthUI(user){
    const reactBtns = document.querySelectorAll(".rBtn");

    if (user){
      userInfo.textContent = `${user.displayName || "Usuario"}${priv.isModerator ? " (moderador)" : ""}`;
      btnLogin.hidden = true;
      btnLogout.hidden = false;

      // si bloqueado, deshabilitamos todo
      if (priv.isBlocked){
        commentText.disabled = true;
        btnComment.disabled = true;
        commentHint.style.display = "block";
        commentHint.textContent = "Tu cuenta está bloqueada en este memorial.";
        reactBtns.forEach(b => b.disabled = true);
      } else {
        commentText.disabled = false;
        btnComment.disabled = false;
        commentHint.style.display = "none";
        reactBtns.forEach(b => b.disabled = false);
      }
    } else {
      userInfo.textContent = "Invitado";
      btnLogin.hidden = false;
      btnLogout.hidden = true;

      commentText.disabled = true;
      btnComment.disabled = true;
      commentHint.style.display = "block";
      commentHint.textContent = "Para comentar y reaccionar debes iniciar sesión.";
      reactBtns.forEach(b => b.disabled = true);
    }
  }

  async function openLb(i){
    if (!gallery[i]?.src) return;
    current = i;

    await refreshPrivileges();
    setAuthUI(auth.currentUser);

    lbImg.src = gallery[i].src;
    lb.hidden = false;
    document.body.style.overflow = "hidden";

    if (unsubComments) unsubComments();
    if (unsubReactions) unsubReactions();

    // COMMENTS realtime (filtra ocultos a no moderadores)
    unsubComments = onSnapshot(
      query(commentsCol(memorialId, i), orderBy("createdAt", "desc")),
      async (snap) => {
        // refresca privilegios por si cambió rol/bloqueo
        await refreshPrivileges();

        if (snap.empty){
          commentsList.innerHTML = `<div class="lb__hint">Aún no hay comentarios en esta foto.</div>`;
          return;
        }

        const visibleDocs = snap.docs.filter(docu => {
          const c = docu.data() || {};
          // si NO es moderador, no ve ocultos
          if (!priv.isModerator) return c.hidden !== true;
          return true;
        });

        if (!visibleDocs.length){
          commentsList.innerHTML = `<div class="lb__hint">No hay comentarios visibles.</div>`;
          return;
        }

        commentsList.innerHTML = visibleDocs.map(docu => {
          const c = docu.data() || {};
          const ts = c.createdAt?.toDate ? c.createdAt.toDate().toLocaleString() : "";
          const hiddenTag = (c.hidden === true) ? `<div class="lb__hint">Oculto</div>` : ``;

          // botones de moderación (solo moderador)
          const modBtns = priv.isModerator ? `
            <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap">
              <button class="lb__btn ghost jsToggleHide"
                data-cid="${docu.id}"
                data-hidden="${c.hidden === true ? "1" : "0"}"
                type="button">
                ${c.hidden === true ? "Mostrar" : "Ocultar"}
              </button>
              <button class="lb__btn ghost jsBlockUser"
                data-uid="${escapeHtml(c.uid || "")}"
                data-name="${escapeHtml(c.name || "")}"
                type="button">
                Bloquear usuario
              </button>
            </div>
          ` : "";

          return `
            <div class="cItem" data-cid="${docu.id}">
              <div><strong>${escapeHtml(c.name || "Anónimo")}</strong></div>
              ${hiddenTag}
              <div>${escapeHtml(c.text || "")}</div>
              <div class="cMeta">${escapeHtml(ts)}</div>
              ${modBtns}
            </div>
          `;
        }).join("");
      }
    );

    // REACTIONS realtime
    unsubReactions = onSnapshot(reactionsCol(memorialId, i), (snap) => {
      const sum = { "❤️":0,"🙏":0,"🕯️":0,"🌟":0,"😢":0 };
      snap.forEach(docu => {
        const r = docu.data() || {};
        for (const k of Object.keys(sum)){
          sum[k] += Number(r[k] || 0);
        }
      });
      totals["❤️"].textContent = String(sum["❤️"]);
      totals["🙏"].textContent = String(sum["🙏"]);
      totals["🕯️"].textContent = String(sum["🕯️"]);
      totals["🌟"].textContent = String(sum["🌟"]);
      totals["😢"].textContent = String(sum["😢"]);
    });
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

  // Abrir desde galería
  document.getElementById("gallery").addEventListener("click", (e) => {
    const btn = e.target.closest(".mThumbBtn");
    if (!btn) return;
    openLb(Number(btn.dataset.i));
  });

  // Cerrar
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

  // Login/logout dentro lightbox
  btnLogin.addEventListener("click", async () => {
    try { await loginGoogle(); await refreshPrivileges(); setAuthUI(auth.currentUser); }
    catch(e){}
  });

  btnLogout.addEventListener("click", async () => {
    showAuthError("");
    try { await signOut(auth); await refreshPrivileges(); setAuthUI(null); }
    catch(e){ showAuthError(`No se pudo cerrar sesión. Error: ${e?.code || "desconocido"}`); }
  });

  // Comentario
  btnComment.addEventListener("click", async () => {
    const user = auth.currentUser;
    await refreshPrivileges();

    if (!user){
      showAuthError("Debes iniciar sesión para comentar.");
      return;
    }
    if (priv.isBlocked){
      showAuthError("Tu cuenta está bloqueada. No puedes comentar.");
      return;
    }

    const text = (commentText.value || "").trim();
    if (!text) return;

    await addDoc(commentsCol(memorialId, current), {
      uid: user.uid,
      name: user.displayName || "Usuario",
      text: text.slice(0, 500),
      hidden: false,
      createdAt: serverTimestamp()
    });

    commentText.value = "";
  });

  // Reacciones (toggle 0/1 por usuario)
  document.querySelectorAll(".rBtn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const user = auth.currentUser;
      await refreshPrivileges();

      if (!user){
        showAuthError("Debes iniciar sesión para reaccionar.");
        return;
      }
      if (priv.isBlocked){
        showAuthError("Tu cuenta está bloqueada. No puedes reaccionar.");
        return;
      }

      const emo = btn.dataset.r;
      const ref = doc(reactionsCol(memorialId, current), user.uid);
      const snap = await getDoc(ref);
      const data = snap.exists() ? snap.data() : {};
      const next = (Number(data[emo] || 0) === 1) ? 0 : 1;

      await setDoc(ref, { [emo]: next, updatedAt: serverTimestamp() }, { merge: true });
    });
  });

  // Moderación (delegación de eventos dentro del listado de comentarios)
  commentsList.addEventListener("click", async (e) => {
    const hideBtn = e.target.closest(".jsToggleHide");
    const blockBtn = e.target.closest(".jsBlockUser");
    await refreshPrivileges();

    if (hideBtn){
      if (!priv.isModerator){
        showAuthError("No tienes permisos de moderación.");
        return;
      }

      const cid = hideBtn.dataset.cid;
      const currentlyHidden = hideBtn.dataset.hidden === "1";
      const user = auth.currentUser;

      const cRef = doc(db, "memorials", memorialId, "photos", String(current), "comments", cid);

      await updateDoc(cRef, {
        hidden: !currentlyHidden,
        hiddenBy: user?.uid || "",
        hiddenAt: serverTimestamp()
      });

      return;
    }

    if (blockBtn){
      if (!priv.isModerator){
        showAuthError("No tienes permisos de moderación.");
        return;
      }

      const targetUid = blockBtn.dataset.uid;
      const targetName = blockBtn.dataset.name;

      if (!targetUid) return;

      // Evita auto-bloqueo accidental
      if (auth.currentUser?.uid === targetUid){
        showAuthError("No puedes bloquearte a ti mismo.");
        return;
      }

      await setDoc(blockedDoc(memorialId, targetUid), {
        blocked: true,
        reason: "moderation",
        targetName: targetName || "",
        blockedBy: auth.currentUser?.uid || "",
        createdAt: serverTimestamp()
      }, { merge: true });

      showAuthError(`Usuario bloqueado: ${targetName || targetUid}`);
      return;
    }
  });

  // actualizar UI auth cuando cambie sesión
  onAuthStateChanged(auth, async (user) => {
    await refreshPrivileges();
    setAuthUI(user);
  });
}

/* ---------------- Main ---------------- */
async function loadMemorial(){
  await initAuthPersistence();
  setupGlobalAuthUI();

  // Completa redirect si venías de redirect login
  try{
    await getRedirectResult(auth);
  }catch(err){
    const code = err?.code || "";
    if (code && code !== "auth/no-auth-event"){
      showAuthError(`No se pudo completar el inicio de sesión. Error: ${code}`);
    }
  }

  const res = await fetch("data.json", { cache: "no-store" });
  if (!res.ok) throw new Error("No se pudo cargar data.json");
  const d = await res.json();

  document.title = (d.name || "Memorial") + " | Imprime tu Recuerdo";

  // básicos
  const cover = document.getElementById("cover");
  cover.src = d.cover || "";
  cover.alt = d.name ? `Foto de ${d.name}` : "Foto";

  document.getElementById("name").textContent = d.name || "";
  document.getElementById("dates").textContent = d.dates || "";
  document.getElementById("bio").textContent = d.bio || "";

  // emocional + velas globales
  injectEmotionalBlocks(d);
  setupGlobalCandles(getMemorialId());

  // galería
  const items = Array.isArray(d.gallery) ? d.gallery : [];
  const gallery = items.map(x => (typeof x === "string" ? ({ src: x, caption: "" }) : x));
  const g = document.getElementById("gallery");

  g.innerHTML = gallery.map((it, i) => `
    <button class="mThumbBtn" type="button" data-i="${i}" aria-label="Abrir imagen">
      <img class="mThumb" src="${it.src}" alt="" loading="lazy" draggable="false">
      ${it.caption ? `<div class="mCap">${escapeHtml(it.caption)}</div>` : ``}
    </button>
  `).join("");

  // video
  if (d.video?.youtubeEmbedUrl){
    document.getElementById("videoSection").hidden = false;
    const vf = document.getElementById("videoFrame");
    vf.src = d.video.youtubeEmbedUrl;
    vf.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
  }

  // audio
  if (d.audio?.src){
    document.getElementById("audioSection").hidden = false;
    document.getElementById("audioPlayer").src = d.audio.src;
  }

  setupLightboxFirebase(d, gallery);
}

loadMemorial().catch(console.error);
