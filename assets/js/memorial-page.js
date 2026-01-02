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

const reportsCol = (memorialId) => collection(db, "memorials", memorialId, "reports");

const candlesCol = (memorialId) => collection(db, "memorials", memorialId, "candles");
const candleDoc = (memorialId, uid) => doc(db, "memorials", memorialId, "candles", uid);

const commentsCol = (memorialId, photoIndex) =>
  collection(db, "memorials", memorialId, "photos", String(photoIndex), "comments");

const commentDoc = (memorialId, photoIndex, commentId) =>
  doc(db, "memorials", memorialId, "photos", String(photoIndex), "comments", commentId);

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

/* ---------------- Roles + bloqueo ---------------- */
async function getPrivileges(memorialId, user){
  if (!user) return { isAdmin:false, isModerator:false, isBlocked:false, role:"" };

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

  const uidRow = document.getElementById("uidRow");
  const myUid = document.getElementById("myUid");
  const copyUid = document.getElementById("copyUid");

  btnLoginMain?.addEventListener("click", async () => {
    try { await loginGoogle(); } catch(e){}
  });

  btnLogoutMain?.addEventListener("click", async () => {
    showAuthError("");
    try { await signOut(auth); } catch(e){
      showAuthError(`No se pudo cerrar sesión. Error: ${e?.code || "desconocido"}`);
    }
  });

  copyUid?.addEventListener("click", async () => {
    const txt = myUid?.textContent || "";
    if (!txt) return;
    try{
      await navigator.clipboard.writeText(txt);
      showAuthError("UID copiado al portapapeles.");
      setTimeout(() => showAuthError(""), 1400);
    }catch{
      showAuthError("No se pudo copiar. Copia manualmente el UID.");
    }
  });

  onAuthStateChanged(auth, async (user) => {
    authStatus && (authStatus.textContent = user ? `${user.displayName || "Usuario"} (conectado)` : "Invitado");
    btnLoginMain && (btnLoginMain.hidden = !!user);
    btnLogoutMain && (btnLogoutMain.hidden = !user);

    if (uidRow){
      uidRow.hidden = !user;
    }
    if (myUid){
      myUid.textContent = user ? user.uid : "";
    }

    if (user) showAuthError("");
  });
}

/* ---------------- Emotional blocks + velas globales ---------------- */
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

/* ---------------- Panel Moderación ---------------- */
function setupModeratorPanel(memorialId){
  const panel = document.getElementById("modPanel");
  const roleText = document.getElementById("modRoleText");
  const reportsList = document.getElementById("reportsList");
  const blockedList = document.getElementById("blockedList");

  const promoteUid = document.getElementById("promoteUid");
  const btnMakeMod = document.getElementById("btnMakeMod");
  const btnRemoveMod = document.getElementById("btnRemoveMod");
  const promoteMsg = document.getElementById("promoteMsg");

  let priv = { isAdmin:false, isModerator:false, isBlocked:false, role:"" };

  function setMsg(t){
    if (!promoteMsg) return;
    promoteMsg.textContent = t || "";
  }

  async function refreshPriv(){
    priv = await getPrivileges(memorialId, auth.currentUser);
    if (panel) panel.hidden = !priv.isModerator;
    if (roleText){
      const who = priv.isAdmin ? "Admin global" : (priv.role ? `Rol: ${priv.role}` : "Moderador");
      roleText.textContent = `Acceso: ${who}`;
    }
  }

  // Promover por UID
  btnMakeMod?.addEventListener("click", async () => {
    setMsg("");
    await refreshPriv();
    if (!priv.isModerator){
      setMsg("Sin permisos.");
      return;
    }
    const uid = (promoteUid?.value || "").trim();
    if (!uid){ setMsg("Pega un UID válido."); return; }

    await setDoc(roleDoc(memorialId, uid), {
      role: "moderator",
      updatedAt: serverTimestamp()
    }, { merge: true });

    setMsg("Listo: ahora ese usuario es moderador.");
  });

  btnRemoveMod?.addEventListener("click", async () => {
    setMsg("");
    await refreshPriv();
    if (!priv.isModerator){
      setMsg("Sin permisos.");
      return;
    }
    const uid = (promoteUid?.value || "").trim();
    if (!uid){ setMsg("Pega un UID válido."); return; }

    await deleteDoc(roleDoc(memorialId, uid));
    setMsg("Listo: moderación removida.");
  });

  // Reportes realtime
  onSnapshot(query(reportsCol(memorialId), orderBy("createdAt", "desc")), async (snap) => {
    await refreshPriv();
    if (!priv.isModerator){
      if (reportsList) reportsList.innerHTML = "";
      return;
    }

    if (!reportsList) return;

    if (snap.empty){
      reportsList.innerHTML = `<div class="lb__hint">No hay reportes.</div>`;
      return;
    }

    reportsList.innerHTML = snap.docs.map(d => {
      const r = d.data() || {};
      const status = r.status || "open";
      const ts = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString() : "";

      const actionBtns = `
        <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap">
          <button class="lb__btn ghost jsResolve" data-id="${d.id}" data-mode="resolved" type="button">Resolver</button>
          <button class="lb__btn ghost jsResolve" data-id="${d.id}" data-mode="dismissed" type="button">Descartar</button>
          <button class="lb__btn ghost jsHideFromReport" data-id="${d.id}" data-photo="${r.photoIndex}" data-cid="${escapeHtml(r.commentId)}" type="button">Ocultar comentario</button>
          <button class="lb__btn ghost jsBlockFromReport" data-id="${d.id}" data-uid="${escapeHtml(r.commentAuthorUid)}" data-name="${escapeHtml(r.commentAuthorName || "")}" type="button">Bloquear autor</button>
          <button class="lb__btn ghost jsMakeModFromReport" data-uid="${escapeHtml(r.commentAuthorUid)}" type="button">Hacer moderador</button>
        </div>
      `;

      return `
        <div class="cItem" style="opacity:${status === 'open' ? '1' : '.75'}">
          <div><strong>Estado:</strong> ${escapeHtml(status)}</div>
          <div class="cMeta">${escapeHtml(ts)}</div>
          <div style="margin-top:8px"><strong>Motivo:</strong> ${escapeHtml(r.reason || "")}</div>
          <div style="margin-top:8px"><strong>Autor comentario:</strong> ${escapeHtml(r.commentAuthorName || "")}</div>
          <div class="cMeta">UID autor: ${escapeHtml(r.commentAuthorUid || "")}</div>
          <div class="cMeta">Foto index: ${String(r.photoIndex ?? "")} - commentId: ${escapeHtml(r.commentId || "")}</div>
          ${actionBtns}
        </div>
      `;
    }).join("");
  });

  // Bloqueados realtime
  onSnapshot(collection(db, "memorials", memorialId, "blocked"), async (snap) => {
    await refreshPriv();
    if (!priv.isModerator){
      if (blockedList) blockedList.innerHTML = "";
      return;
    }
    if (!blockedList) return;

    if (snap.empty){
      blockedList.innerHTML = `<div class="lb__hint">No hay bloqueados.</div>`;
      return;
    }

    blockedList.innerHTML = snap.docs.map(d => {
      const b = d.data() || {};
      const uid = d.id;
      const ts = b.createdAt?.toDate ? b.createdAt.toDate().toLocaleString() : "";
      return `
        <div class="cItem">
          <div><strong>${escapeHtml(b.targetName || "Usuario")}</strong></div>
          <div class="cMeta">UID: ${escapeHtml(uid)}</div>
          <div class="cMeta">${escapeHtml(ts)}</div>
          <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap">
            <button class="lb__btn ghost jsUnblock" data-uid="${escapeHtml(uid)}" type="button">Desbloquear</button>
            <button class="lb__btn ghost jsMakeMod" data-uid="${escapeHtml(uid)}" type="button">Hacer moderador</button>
          </div>
        </div>
      `;
    }).join("");
  });

  // Delegación de clicks (reportes + bloqueados)
  panel?.addEventListener("click", async (e) => {
    await refreshPriv();
    if (!priv.isModerator) return;

    const btnResolve = e.target.closest(".jsResolve");
    const btnHide = e.target.closest(".jsHideFromReport");
    const btnBlock = e.target.closest(".jsBlockFromReport");
    const btnUnblock = e.target.closest(".jsUnblock");
    const btnMakeMod1 = e.target.closest(".jsMakeModFromReport");
    const btnMakeMod2 = e.target.closest(".jsMakeMod");

    if (btnResolve){
      const id = btnResolve.dataset.id;
      const mode = btnResolve.dataset.mode;
      const ref = doc(db, "memorials", memorialId, "reports", id);
      await updateDoc(ref, {
        status: mode,
        resolvedBy: auth.currentUser?.uid || "",
        resolvedAt: serverTimestamp(),
        resolutionNote: ""
      });
      return;
    }

    if (btnHide){
      const photo = Number(btnHide.dataset.photo);
      const cid = btnHide.dataset.cid;
      if (!Number.isInteger(photo) || !cid) return;

      await updateDoc(commentDoc(memorialId, photo, cid), {
        hidden: true,
        hiddenBy: auth.currentUser?.uid || "",
        hiddenAt: serverTimestamp()
      });
      showAuthError("Comentario ocultado.");
      setTimeout(() => showAuthError(""), 1200);
      return;
    }

    if (btnBlock){
      const uid = btnBlock.dataset.uid;
      const name = btnBlock.dataset.name || "";
      if (!uid) return;

      if (uid === auth.currentUser?.uid){
        showAuthError("No puedes bloquearte a ti mismo.");
        return;
      }

      await setDoc(blockedDoc(memorialId, uid), {
        blocked: true,
        targetName: name,
        reason: "moderation",
        blockedBy: auth.currentUser?.uid || "",
        createdAt: serverTimestamp()
      }, { merge: true });

      showAuthError("Usuario bloqueado.");
      setTimeout(() => showAuthError(""), 1200);
      return;
    }

    if (btnUnblock){
      const uid = btnUnblock.dataset.uid;
      if (!uid) return;
      await deleteDoc(blockedDoc(memorialId, uid));
      showAuthError("Usuario desbloqueado.");
      setTimeout(() => showAuthError(""), 1200);
      return;
    }

    const modUid = (btnMakeMod1?.dataset.uid || btnMakeMod2?.dataset.uid || "").trim();
    if ((btnMakeMod1 || btnMakeMod2) && modUid){
      await setDoc(roleDoc(memorialId, modUid), {
        role: "moderator",
        updatedAt: serverTimestamp()
      }, { merge: true });

      showAuthError("Moderador asignado.");
      setTimeout(() => showAuthError(""), 1200);
      return;
    }
  });

  onAuthStateChanged(auth, async () => {
    await refreshPriv();
  });

  refreshPriv();
}

/* ---------------- Lightbox + comentarios + reacciones + reportar ---------------- */
function setupLightboxFirebase(d, gallery){
  const memorialId = getMemorialId();

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

  if (!lb || !lbImg || !lbClose || !btnLogin || !btnLogout || !userInfo || !commentText || !btnComment || !commentHint || !commentsList){
    console.error("Falta el lightbox PRO en index.html (login/comentarios/reacciones).");
    return;
  }

  let current = 0;
  let unsubComments = null;
  let unsubReactions = null;

  let priv = { isAdmin:false, isModerator:false, isBlocked:false, role:"" };

  async function refreshPrivileges(){
    priv = await getPrivileges(memorialId, auth.currentUser);
  }

  function setAuthUI(user){
    const reactBtns = document.querySelectorAll(".rBtn");

    if (user){
      userInfo.textContent = `${user.displayName || "Usuario"}${priv.isModerator ? " (moderador)" : ""}`;
      btnLogin.hidden = true;
      btnLogout.hidden = false;

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

    unsubComments = onSnapshot(
      query(commentsCol(memorialId, i), orderBy("createdAt", "desc")),
      async (snap) => {
        await refreshPrivileges();

        if (snap.empty){
          commentsList.innerHTML = `<div class="lb__hint">Aún no hay comentarios en esta foto.</div>`;
          return;
        }

        const visibleDocs = snap.docs.filter(docu => {
          const c = docu.data() || {};
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

          const reportBtn = (!priv.isModerator) ? `
            <button class="lb__btn ghost jsReport"
              data-cid="${docu.id}"
              data-auid="${escapeHtml(c.uid || "")}"
              data-aname="${escapeHtml(c.name || "")}"
              type="button">Reportar</button>
          ` : "";

          const modBtns = priv.isModerator ? `
            <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap">
              <button class="lb__btn ghost jsToggleHide"
                data-cid="${docu.id}"
                data-hidden="${c.hidden === true ? "1" : "0"}"
                type="button">${c.hidden === true ? "Mostrar" : "Ocultar"}</button>

              <button class="lb__btn ghost jsBlockUser"
                data-uid="${escapeHtml(c.uid || "")}"
                data-name="${escapeHtml(c.name || "")}"
                type="button">Bloquear</button>

              <button class="lb__btn ghost jsMakeMod"
                data-uid="${escapeHtml(c.uid || "")}"
                type="button">Hacer moderador</button>
            </div>
          ` : "";

          return `
            <div class="cItem" data-cid="${docu.id}">
              <div><strong>${escapeHtml(c.name || "Anónimo")}</strong></div>
              ${hiddenTag}
              <div>${escapeHtml(c.text || "")}</div>
              <div class="cMeta">${escapeHtml(ts)}</div>
              <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap">
                ${reportBtn}
              </div>
              ${modBtns}
            </div>
          `;
        }).join("");
      }
    );

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

  document.getElementById("gallery").addEventListener("click", (e) => {
    const btn = e.target.closest(".mThumbBtn");
    if (!btn) return;
    openLb(Number(btn.dataset.i));
  });

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

  btnLogin.addEventListener("click", async () => {
    try { await loginGoogle(); await refreshPrivileges(); setAuthUI(auth.currentUser); }
    catch(e){}
  });

  btnLogout.addEventListener("click", async () => {
    showAuthError("");
    try { await signOut(auth); await refreshPrivileges(); setAuthUI(null); }
    catch(e){ showAuthError(`No se pudo cerrar sesión. Error: ${e?.code || "desconocido"}`); }
  });

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

  // Delegación: reportar / moderar desde comentarios
  commentsList.addEventListener("click", async (e) => {
    await refreshPrivileges();

    const reportBtn = e.target.closest(".jsReport");
    if (reportBtn){
      const user = auth.currentUser;
      if (!user){
        showAuthError("Debes iniciar sesión para reportar.");
        return;
      }
      if (priv.isBlocked){
        showAuthError("Tu cuenta está bloqueada.");
        return;
      }

      const cid = reportBtn.dataset.cid;
      const auid = reportBtn.dataset.auid;
      const aname = reportBtn.dataset.aname;

      const reason = prompt("Motivo del reporte (máx 300 caracteres):", "Contenido inapropiado");
      if (!reason) return;

      await addDoc(reportsCol(memorialId), {
        reporterUid: user.uid,
        reporterName: user.displayName || "Usuario",
        photoIndex: current,
        commentId: cid,
        commentAuthorUid: auid || "",
        commentAuthorName: aname || "",
        reason: String(reason).slice(0, 300),
        status: "open",
        createdAt: serverTimestamp()
      });

      showAuthError("Reporte enviado.");
      setTimeout(() => showAuthError(""), 1200);
      return;
    }

    // Moderación
    const hideBtn = e.target.closest(".jsToggleHide");
    const blockBtn = e.target.closest(".jsBlockUser");
    const makeModBtn = e.target.closest(".jsMakeMod");

    if (hideBtn){
      if (!priv.isModerator){
        showAuthError("No tienes permisos.");
        return;
      }
      const cid = hideBtn.dataset.cid;
      const currentlyHidden = hideBtn.dataset.hidden === "1";
      await updateDoc(commentDoc(memorialId, current, cid), {
        hidden: !currentlyHidden,
        hiddenBy: auth.currentUser?.uid || "",
        hiddenAt: serverTimestamp()
      });
      return;
    }

    if (blockBtn){
      if (!priv.isModerator){
        showAuthError("No tienes permisos.");
        return;
      }
      const targetUid = blockBtn.dataset.uid;
      const targetName = blockBtn.dataset.name || "";
      if (!targetUid) return;

      if (auth.currentUser?.uid === targetUid){
        showAuthError("No puedes bloquearte a ti mismo.");
        return;
      }

      await setDoc(blockedDoc(memorialId, targetUid), {
        blocked: true,
        targetName: targetName,
        reason: "moderation",
        blockedBy: auth.currentUser?.uid || "",
        createdAt: serverTimestamp()
      }, { merge: true });

      showAuthError("Usuario bloqueado.");
      setTimeout(() => showAuthError(""), 1200);
      return;
    }

    if (makeModBtn){
      if (!priv.isModerator){
        showAuthError("No tienes permisos.");
        return;
      }
      const targetUid = (makeModBtn.dataset.uid || "").trim();
      if (!targetUid) return;

      await setDoc(roleDoc(memorialId, targetUid), {
        role: "moderator",
        updatedAt: serverTimestamp()
      }, { merge: true });

      showAuthError("Moderador asignado.");
      setTimeout(() => showAuthError(""), 1200);
      return;
    }
  });

  onAuthStateChanged(auth, async (user) => {
    await refreshPrivileges();
    setAuthUI(user);
  });
}

/* ---------------- Main ---------------- */
async function loadMemorial(){
  await initAuthPersistence();
  setupGlobalAuthUI();

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

  const cover = document.getElementById("cover");
  cover.src = d.cover || "";
  cover.alt = d.name ? `Foto de ${d.name}` : "Foto";

  document.getElementById("name").textContent = d.name || "";
  document.getElementById("dates").textContent = d.dates || "";
  document.getElementById("bio").textContent = d.bio || "";

  injectEmotionalBlocks(d);
  setupGlobalCandles(getMemorialId());

  const items = Array.isArray(d.gallery) ? d.gallery : [];
  const gallery = items.map(x => (typeof x === "string" ? ({ src: x, caption: "" }) : x));
  const g = document.getElementById("gallery");

  g.innerHTML = gallery.map((it, i) => `
    <button class="mThumbBtn" type="button" data-i="${i}" aria-label="Abrir imagen">
      <img class="mThumb" src="${it.src}" alt="" loading="lazy" draggable="false">
      ${it.caption ? `<div class="mCap">${escapeHtml(it.caption)}</div>` : ``}
    </button>
  `).join("");

  if (d.video?.youtubeEmbedUrl){
    document.getElementById("videoSection").hidden = false;
    const vf = document.getElementById("videoFrame");
    vf.src = d.video.youtubeEmbedUrl;
    vf.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
  }

  if (d.audio?.src){
    document.getElementById("audioSection").hidden = false;
    document.getElementById("audioPlayer").src = d.audio.src;
  }

  const memorialId = getMemorialId();
  setupModeratorPanel(memorialId);
  setupLightboxFirebase(d, gallery);
}

loadMemorial().catch(console.error);
