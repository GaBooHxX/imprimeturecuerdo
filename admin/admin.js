import { firebaseConfig } from "../assets/js/firebase-config.js";

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
  getDocs,
  query,
  orderBy,
  limit,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* ---------- init ---------- */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

await setPersistence(auth, browserLocalPersistence).catch(()=>{});
await getRedirectResult(auth).catch(()=>{});

/* ---------- UI refs ---------- */
const authStatus = document.getElementById("authStatus");
const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");

const roleInfo = document.getElementById("roleInfo");
const errorBox = document.getElementById("errorBox");

const memorialPick = document.getElementById("memorialPick");
const memorialIdInput = document.getElementById("memorialIdInput");
const btnLoadMemorial = document.getElementById("btnLoadMemorial");
const memorialActive = document.getElementById("memorialActive");

const adminTools = document.getElementById("adminTools");
const uidInput = document.getElementById("uidInput");
const btnMakeMod = document.getElementById("btnMakeMod");
const btnRemoveMod = document.getElementById("btnRemoveMod");
const modResult = document.getElementById("modResult");

const commentsSection = document.getElementById("commentsSection");
const btnRefresh = document.getElementById("btnRefresh");
const showHidden = document.getElementById("showHidden");
const commentsList = document.getElementById("commentsList");

/* ---------- state ---------- */
let currentMemorialId = null;
let isAdminGlobal = false;
let isAdminOfMemorial = false; // solo para asignar mods

/* ---------- helpers ---------- */
function showError(msg){
  if (!msg){
    errorBox.hidden = true;
    errorBox.textContent = "";
    return;
  }
  errorBox.hidden = false;
  errorBox.textContent = msg;
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

async function login(){
  showError("");
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
    showError("No se pudo iniciar sesión: " + code);
  }
}

/* Admin global */
async function checkGlobalAdmin(uid){
  const snap = await getDoc(doc(db, "admins", uid));
  return snap.exists();
}

/* Admin del memorial (solo para permitir asignar moderadores desde este panel) */
async function checkMemorialAdmin(uid, memorialId){
  const snap = await getDoc(doc(db, "memorials", memorialId, "admin", uid));
  return snap.exists();
}

/* Sacar cantidad de fotos desde data.json del memorial */
async function getPhotoCountFromDataJson(memorialId){
  // Probamos rutas típicas (ajusta si tu sitio usa otra)
  const candidates = [
    `/memoriales/${memorialId}/data.json`,
    `/memorial/${memorialId}/data.json`,
    `/memorials/${memorialId}/data.json`,
    `../memoriales/${memorialId}/data.json`,
    `../memorial/${memorialId}/data.json`,
    `../memorials/${memorialId}/data.json`,
  ];

  for (const url of candidates){
    try{
      const res = await fetch(url, { cache:"no-store" });
      if (!res.ok) continue;
      const d = await res.json();
      const items = Array.isArray(d.gallery) ? d.gallery : [];
      return { count: items.length, urlUsed: url };
    }catch(_){}
  }
  return { count: 0, urlUsed: null };
}

/* ---------- events ---------- */
btnLogin?.addEventListener("click", login);

btnLogout?.addEventListener("click", async () => {
  await signOut(auth);
});

btnLoadMemorial?.addEventListener("click", async () => {
  const v = (memorialIdInput.value || "").trim();
  if (!v) return;

  currentMemorialId = v;
  memorialActive.textContent = v;

  await refreshRoleAndUI();
  await loadComments();
});

btnRefresh?.addEventListener("click", loadComments);
showHidden?.addEventListener("change", loadComments);

btnMakeMod?.addEventListener("click", async () => {
  if (!currentMemorialId) return showError("Primero carga un memorial.");

  // 👇 Como pediste: solo ADMIN del memorial asigna moderadores (no moderador).
  if (!isAdminOfMemorial) return showError("Solo un ADMIN de este memorial puede asignar moderadores.");

  const uid = (uidInput.value || "").trim();
  if (!uid) return showError("Pega un UID válido.");

  showError("");
  try{
    await setDoc(doc(db, "memorials", currentMemorialId, "mods", uid), {
      role: "mod",
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser.uid
    }, { merge:true });

    modResult.textContent = `✅ Moderador asignado: ${uid}`;
  }catch(e){
    showError("No se pudo asignar moderador: " + (e?.code || e));
  }
});

btnRemoveMod?.addEventListener("click", async () => {
  if (!currentMemorialId) return showError("Primero carga un memorial.");

  if (!isAdminOfMemorial) return showError("Solo un ADMIN de este memorial puede quitar moderadores.");

  const uid = (uidInput.value || "").trim();
  if (!uid) return showError("Pega un UID válido.");

  showError("");
  try{
    await deleteDoc(doc(db, "memorials", currentMemorialId, "mods", uid));
    modResult.textContent = `🗑️ Moderador removido: ${uid}`;
  }catch(e){
    showError("No se pudo quitar moderador: " + (e?.code || e));
  }
});

/* ---------- auth state ---------- */
onAuthStateChanged(auth, async (user) => {
  if (!user){
    authStatus.textContent = "Invitado";
    btnLogin.hidden = false;
    btnLogout.hidden = true;

    roleInfo.textContent = "Debes iniciar sesión para usar el panel.";
    memorialPick.hidden = true;
    adminTools.hidden = true;
    commentsSection.hidden = true;
    showError("");
    return;
  }

  authStatus.textContent = `${user.displayName || "Usuario"} (conectado)`;
  btnLogin.hidden = true;
  btnLogout.hidden = false;

  isAdminGlobal = await checkGlobalAdmin(user.uid);

  if (!isAdminGlobal){
    roleInfo.textContent = "No tienes permisos: debes ser admin global (/admins/{uid}).";
    memorialPick.hidden = true;
    adminTools.hidden = true;
    commentsSection.hidden = true;
    return;
  }

  roleInfo.textContent = "Admin global OK. Carga un memorial para moderar.";
  memorialPick.hidden = false;

  if (currentMemorialId){
    await refreshRoleAndUI();
    await loadComments();
  }
});

/* ---------- functions ---------- */
async function refreshRoleAndUI(){
  const user = auth.currentUser;
  if (!user || !currentMemorialId) return;

  // Global admin siempre puede ver/moderar comentarios
  commentsSection.hidden = false;

  // Pero para asignar mods desde este panel: solo admin del memorial
  isAdminOfMemorial = await checkMemorialAdmin(user.uid, currentMemorialId);

  adminTools.hidden = !isAdminOfMemorial;
  roleInfo.textContent =
    isAdminOfMemorial
      ? "Rol en memorial: ADMIN (además eres admin global)"
      : "Eres admin global. En este memorial NO eres admin (puedes moderar comentarios, pero no asignar mods).";
}

async function loadComments(){
  const user = auth.currentUser;
  if (!user) return;
  if (!currentMemorialId) return;
  if (!isAdminGlobal) return;

  commentsList.innerHTML = "Cargando…";

  try{
    const { count: photoCount, urlUsed } = await getPhotoCountFromDataJson(currentMemorialId);

    if (!photoCount){
      commentsList.innerHTML = `<div class="muted">
        No pude leer gallery desde data.json del memorial.<br>
        Revisa que exista: <code>/memoriales/${escapeHtml(currentMemorialId)}/data.json</code> (o ruta equivalente).
      </div>`;
      return;
    }

    const blocks = [];

    for (let i = 0; i < photoCount; i++){
      const commentsSnap = await getDocs(
        query(
          collection(db, "memorials", currentMemorialId, "photos", String(i), "comments"),
          orderBy("createdAt", "desc"),
          limit(200)
        )
      );

      commentsSnap.forEach(c => {
        const d = c.data() || {};
        const hidden = !!d.hidden;

        if (hidden && !showHidden.checked) return;

        blocks.push({
          photoId: String(i),
          commentId: c.id,
          name: d.name || "Anónimo",
          text: d.text || "",
          hidden
        });
      });
    }

    if (!blocks.length){
      commentsList.innerHTML = `<div class="muted">No hay comentarios (o están ocultos).</div>`;
      return;
    }

    commentsList.innerHTML = "";
    for (const b of blocks){
      const el = document.createElement("div");
      el.className = "item";
      el.style.opacity = b.hidden ? "0.55" : "1";

      el.innerHTML = `
        <div>
          <strong>${escapeHtml(b.name)}</strong>
          <span class="muted">(foto ${escapeHtml(b.photoId)})</span>
        </div>
        <div>${escapeHtml(b.text)}</div>
        <div class="actions">
          <button class="small ${b.hidden ? "" : "danger"}" type="button">
            ${b.hidden ? "Mostrar" : "Ocultar"}
          </button>
        </div>
      `;

      el.querySelector("button").onclick = async () => {
        await toggleHidden(b.photoId, b.commentId, !b.hidden);
        await loadComments();
      };

      commentsList.appendChild(el);
    }

    // opcional: debug ruta usada
    // console.log("data.json usado:", urlUsed);

  }catch(e){
    showError("No se pudieron cargar comentarios: " + (e?.code || e));
    commentsList.innerHTML = "";
  }
}

async function toggleHidden(photoId, commentId, hide){
  try{
    await setDoc(
      doc(db, "memorials", currentMemorialId, "photos", String(photoId), "comments", commentId),
      {
        hidden: hide,
        hiddenAt: serverTimestamp(),
        hiddenBy: auth.currentUser.uid
      },
      { merge:true }
    );
  }catch(e){
    showError("No se pudo ocultar/mostrar: " + (e?.code || e));
  }
}
