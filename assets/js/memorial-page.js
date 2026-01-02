import { firebaseConfig } from "./firebase-config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
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
  return String(s)
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

function commentsCol(memorialId, photoIndex){
  return collection(db, "memorials", memorialId, "photos", String(photoIndex), "comments");
}
function reactionsCol(memorialId, photoIndex){
  return collection(db, "memorials", memorialId, "photos", String(photoIndex), "reactions");
}

// ✅ Velas globales (a nivel memorial)
function candlesCol(memorialId){
  return collection(db, "memorials", memorialId, "candles");
}
function candleDoc(memorialId, uid){
  return doc(db, "memorials", memorialId, "candles", uid);
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

/* ---------------- Login (POPUP + fallback REDIRECT) ---------------- */
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

/* ---------------- Global auth UI (solo 1 vez) ---------------- */
let globalAuthReady = false;

function setupGlobalAuthUI(){
  if (globalAuthReady) return;
  globalAuthReady = true;

  const btnLoginMain = document.getElementById("btnLoginMain");
  const btnLogoutMain = document.getElementById("btnLogoutMain");
  const authStatus = document.getElementById("authStatus");

  if (btnLoginMain){
    btnLoginMain.addEventListener("click", async () => {
      try{ await loginGoogle(); } catch(e){}
    });
  }

  if (btnLogoutMain){
    btnLogoutMain.addEventListener("click", async () => {
      showAuthError("");
      try{ await signOut(auth); }
      catch(err){ showAuthError(`No se pudo cerrar sesión. Error: ${err?.code || "desconocido"}`); }
    });
  }

  onAuthStateChanged(auth, (user) => {
    if (authStatus){
      authStatus.textContent = user ? `${user.displayName || "Usuario"} (conectado)` : "Invitado";
    }
    if (btnLoginMain) btnLoginMain.hidden = !!user;
    if (btnLogoutMain) btnLogoutMain.hidden = !user;
    if (user) showAuthError("");
  });
}

/* ---------------- Efecto vela bonito ---------------- */
function candleBurst(){
  const host = document.getElementById("extraBlocks") || document.body;
  const n = 18;
  for (let i = 0; i < n; i++){
    const p = document.createElement("div");
    p.className = "cSpark";
    p.style.left = (50 + (Math.random()*20 - 10)) + "%";
    p.style.top = (Math.random()*6 + 2) + "px";
    p.style.setProperty("--dx", (Math.random()*220 - 110) + "px");
    p.style.setProperty("--dy", (Math.random()*-160 - 40) + "px");
    p.style.setProperty("--d", (700 + Math.random()*500) + "ms");
    host.appendChild(p);
    setTimeout(() => p.remove(), 1400);
  }
}

/* ---------------- Velas globales ---------------- */
function setupGlobalCandles(memorialId){
  const btn = document.getElementById("candleBtn");
  const out = document.getElementById("candleCount");
  if (!btn || !out) return;

  // Total velas realtime
  onSnapshot(candlesCol(memorialId), (snap) => {
    out.textContent = `🕯️ ${snap.size} velas encendidas`;
  });

  let unsubUserDoc = null;

  onAuthStateChanged(auth, (user) => {
    if (unsubUserDoc) { unsubUserDoc(); unsubUserDoc = null; }

    if (!user){
      btn.disabled = true;
      btn.textContent = "Inicia sesión para encender una vela";
      btn.onclick = null;
      return;
    }

    btn.disabled = false;

    const ref = candleDoc(memorialId, user.uid);

    // Escuchar si el usuario ya encendió (realtime)
    unsubUserDoc = onSnapshot(ref, (snap) => {
      btn.textContent = snap.exists() ? "🕯️ Apagar vela" : "🕯️ Encender vela";
    });

    btn.onclick = async () => {
      const snap = await getDoc(ref);
      if (snap.exists()){
        await deleteDoc(ref);
      } else {
        await setDoc(ref, {
          uid: user.uid,
          name: user.displayName || "Usuario",
          createdAt: serverTimestamp()
        });
      }
      candleBurst();
    };
  });
}

/* ---------------- Emotional blocks ---------------- */
function injectEmotionalBlocks(d){
  let host = document.getElementById("extraBlocks");
  if (!host){
    host = document.createElement("div");
    host.id = "extraBlocks";
    const bio = document.getElementById("bio");
    bio.parentNode.insertBefore(host, bio.nextSibling);
  }

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

/* ---------------- Lightbox + Firebase comments/reactions ---------------- */
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

  function setAuthUI(user){
    const reactBtns = document.querySelectorAll(".rBtn");

    if (user){
      userInfo.textContent = `${user.displayName || "Usuario"} (conectado)`;
      btnLogin.hidden = true;
      btnLogout.hidden = false;

      commentText.disabled = false;
      btnComment.disabled = false;
      commentHint.style.display = "none";
      reactBtns.forEach(b => b.disabled = false);
    } else {
      userInfo.textContent = "Invitado";
      btnLogin.hidden = false;
      btnLogout.hidden = true;

      commentText.disabled = true;
      btnComment.disabled = true;
      commentHint.style.display = "block";
      reactBtns.forEach(b => b.disabled = true);
    }
  }

  onAuthStateChanged(auth, (user) => setAuthUI(user));

  async function openLb(i){
    if (!gallery[i]?.src) return;
    current = i;

    lbImg.src = gallery[i].src;
    lb.hidden = false;
    document.body.style.overflow = "hidden";

    setAuthUI(auth.currentUser);

    if (unsubComments) unsubComments();
    if (unsubReactions) unsubReactions();

    unsubComments = onSnapshot(
      query(commentsCol(memorialId, i), orderBy("createdAt", "desc")),
      (snap) => {
        if (snap.empty){
          commentsList.innerHTML = `<div class="lb__hint">Aún no hay comentarios en esta foto.</div>`;
          return;
        }
        commentsList.innerHTML = snap.docs.map(x => {
          const c = x.data();
          const ts = c.createdAt?.toDate ? c.createdAt.toDate().toLocaleString() : "";
          return `
            <div class="cItem">
              <div><strong>${escapeHtml(c.name || "Anónimo")}</strong></div>
              <div>${escapeHtml(c.text || "")}</div>
              <div class="cMeta">${escapeHtml(ts)}</div>
            </div>
          `;
        }).join("");
      }
    );

    unsubReactions = onSnapshot(
      reactionsCol(memorialId, i),
      (snap) => {
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
    try{ await loginGoogle(); } catch(e){}
  });

  btnLogout.addEventListener("click", async () => {
    showAuthError("");
    try{ await signOut(auth); }
    catch(err){ showAuthError(`No se pudo cerrar sesión. Error: ${err?.code || "desconocido"}`); }
  });

  btnComment.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user){
      showAuthError("Debes iniciar sesión para comentar.");
      return;
    }

    const text = (commentText.value || "").trim();
    if (!text) return;

    await addDoc(commentsCol(memorialId, current), {
      uid: user.uid,
      name: user.displayName || "Usuario",
      text: text.slice(0, 500),
      createdAt: serverTimestamp()
    });

    commentText.value = "";
  });

  document.querySelectorAll(".rBtn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const user = auth.currentUser;
      if (!user){
        showAuthError("Debes iniciar sesión para reaccionar.");
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
}

/* ---------------- Main ---------------- */
async function loadMemorial(){
  await initAuthPersistence();
  setupGlobalAuthUI();

  // si venías de redirect
  try{ await getRedirectResult(auth); } catch(e){}

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

  setupLightboxFirebase(d, gallery);

  // ✅ después de inyectar el HTML (porque recién ahí existe #candleBtn)
  setupGlobalCandles(getMemorialId());
}

loadMemorial().catch(console.error);


loadMemorial().catch(console.error);

