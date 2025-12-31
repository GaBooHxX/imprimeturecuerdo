import { firebaseConfig } from "./firebase-config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
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
  // Usa la carpeta como ID: /memoriales/Camilo-Fuentes-Covarrubias/
  const parts = location.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("memoriales");
  return (idx >= 0 && parts[idx + 1]) ? parts[idx + 1] : "memorial";
}

function photoDoc(memorialId, photoIndex){
  return doc(db, "memorials", memorialId, "photos", String(photoIndex));
}
function commentsCol(memorialId, photoIndex){
  return collection(db, "memorials", memorialId, "photos", String(photoIndex), "comments");
}
function reactionsCol(memorialId, photoIndex){
  return collection(db, "memorials", memorialId, "photos", String(photoIndex), "reactions");
}

/* ---------------- Main ---------------- */
async function loadMemorial(){
  // Completa el login si venía de redirect
  await getRedirectResult(auth).catch(() => {});

  const res = await fetch("data.json", { cache: "no-store" });
  if (!res.ok) throw new Error("No se pudo cargar data.json");
  const d = await res.json();

  document.title = (d.name || "Memorial") + " | Imprime tu Recuerdo";

  // Básicos
  const cover = document.getElementById("cover");
  cover.src = d.cover || "";
  cover.alt = d.name ? `Foto de ${d.name}` : "Foto";

  document.getElementById("name").textContent = d.name || "";
  document.getElementById("dates").textContent = d.dates || "";
  document.getElementById("bio").textContent = d.bio || "";

  // Secciones emocionales
  injectEmotionalBlocks(d);

  // Galería
  const items = Array.isArray(d.gallery) ? d.gallery : [];
  const gallery = items.map(x => (typeof x === "string" ? ({ src: x, caption: "" }) : x));
  const g = document.getElementById("gallery");

  g.innerHTML = gallery.map((it, i) => `
    <button class="mThumbBtn" type="button" data-i="${i}" aria-label="Abrir imagen">
      <img class="mThumb" src="${it.src}" alt="" loading="lazy" draggable="false">
      ${it.caption ? `<div class="mCap">${escapeHtml(it.caption)}</div>` : ``}
    </button>
  `).join("");

  // Video
  if (d.video?.youtubeEmbedUrl){
    document.getElementById("videoSection").hidden = false;
    const vf = document.getElementById("videoFrame");
    vf.src = d.video.youtubeEmbedUrl;
    vf.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
  }

  // Audio
  if (d.audio?.src){
    document.getElementById("audioSection").hidden = false;
    document.getElementById("audioPlayer").src = d.audio.src;
  }

  // Lightbox + Firebase features
  setupLightboxFirebase(d, gallery);
}

/* ---------------- Emotional blocks (mantiene tu versión) ---------------- */
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

  // Vela local (después la hacemos global con Firebase si quieres)
  const btn = document.getElementById("candleBtn");
  const out = document.getElementById("candleCount");
  if (btn && out){
    const key = "candles_" + (d.name || "memorial");
    const current = Number(localStorage.getItem(key) || "0");
    out.textContent = `Velas encendidas en este dispositivo: ${current}`;
    btn.addEventListener("click", () => {
      const next = Number(localStorage.getItem(key) || "0") + 1;
      localStorage.setItem(key, String(next));
      out.textContent = `Velas encendidas en este dispositivo: ${next}`;
    });
  }
}

/* ---------------- Lightbox + Firebase comments/reactions ---------------- */
function setupLightboxFirebase(d, gallery){
  const memorialId = getMemorialId();

  // Lightbox elements
  const lb = document.getElementById("lightbox");
  const lbImg = document.getElementById("lbImg");
  const lbClose = document.getElementById("lbClose");

  // Panel elements (deben existir en el HTML del lightbox PRO)
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

  // Si no existe el panel, avisamos en consola
  if (!btnLogin || !commentText || !commentsList){
    console.error("Falta el lightbox PRO en index.html (panel de login/comentarios/reacciones).");
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

  async function openLb(i){
    if (!gallery[i]?.src) return;
    current = i;

    lbImg.src = gallery[i].src;
    lb.hidden = false;
    document.body.style.overflow = "hidden";

    // cortar listeners previos
    if (unsubComments) unsubComments();
    if (unsubReactions) unsubReactions();

    // crear doc base (merge)
    await setDoc(photoDoc(memorialId, i), {
      memorialName: d.name || "",
      updatedAt: serverTimestamp()
    }, { merge: true });

    // COMMENTS realtime
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

    // REACTIONS realtime (suma por usuario)
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

  // abrir al tocar foto
  document.getElementById("gallery").addEventListener("click", (e) => {
    const btn = e.target.closest(".mThumbBtn");
    if (!btn) return;
    openLb(Number(btn.dataset.i));
  });

  // cerrar (X)
  lbClose.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeLb();
  });

  // cerrar clic fuera (fondo)
  lb.addEventListener("click", (e) => {
    if (e.target === lb) closeLb();
  });

  // ESC
  window.addEventListener("keydown", (e) => {
    if (lb.hidden) return;
    if (e.key === "Escape") closeLb();
  });

  // Login/logout
  btnLogin.addEventListener("click", async () => {
    await signInWithRedirect(auth, provider);
  });

  btnLogout.addEventListener("click", async () => {
    await signOut(auth);
  });

  onAuthStateChanged(auth, (user) => setAuthUI(user));

  // Publicar comentario
  btnComment.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;

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

  // Reacciones toggle por usuario (1 doc por usuario)
  document.querySelectorAll(".rBtn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const user = auth.currentUser;
      if (!user) return;

      const emo = btn.dataset.r;

      const ref = doc(reactionsCol(memorialId, current), user.uid);
      const snap = await getDoc(ref);
      const data = snap.exists() ? snap.data() : {};

      const next = (Number(data[emo] || 0) === 1) ? 0 : 1;

      await setDoc(ref, {
        [emo]: next,
        updatedAt: serverTimestamp()
      }, { merge: true });
    });
  });
}

loadMemorial().catch(console.error);

