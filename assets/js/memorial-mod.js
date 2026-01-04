import { firebaseConfig } from "./firebase-config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

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
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* Firebase init (separado, no toca tu memorial-page.js) */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* Helpers */
function getMemorialId(){
  const parts = location.pathname.split("/").filter(Boolean);
  const keys = ["memoriales", "memorial", "memorials"];
  for (const k of keys){
    const idx = parts.indexOf(k);
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  }
  return parts[0] || "memorial";
}

function esc(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* Rutas roles */
function adminGlobalDoc(uid){ return doc(db, "admins", uid); }
function memorialAdminDoc(memorialId, uid){ return doc(db, "memorials", memorialId, "admin", uid); }
function memorialModDoc(memorialId, uid){ return doc(db, "memorials", memorialId, "mods", uid); }

async function getMyRole(memorialId, uid){
  // global admin?
  const g = await getDoc(adminGlobalDoc(uid));
  if (g.exists()) return "global-admin";

  // memorial admin?
  const a = await getDoc(memorialAdminDoc(memorialId, uid));
  if (a.exists()) return "memorial-admin";

  // mod?
  const m = await getDoc(memorialModDoc(memorialId, uid));
  if (m.exists()) return "mod";

  return "none";
}

/* UI refs */
const modEntry = document.getElementById("modEntry");
const btnOpenMod = document.getElementById("btnOpenMod");
const modModal = document.getElementById("modModal");
const modClose = document.getElementById("modClose");
const modRefresh = document.getElementById("modRefresh");
const modShowHidden = document.getElementById("modShowHidden");
const modList = document.getElementById("modList");

const uidRow = document.getElementById("uidRow");
const myUid = document.getElementById("myUid");
const copyUid = document.getElementById("copyUid");

const promoteUid = document.getElementById("promoteUid");
const btnMakeMod = document.getElementById("btnMakeMod");
const btnRemoveMod = document.getElementById("btnRemoveMod");
const promoteMsg = document.getElementById("promoteMsg");

const modRoleText = document.getElementById("modRoleText");

/* Estado */
let currentRole = "none"; // "global-admin" | "memorial-admin" | "mod" | "none"

/* Modal */
function openModal(){
  if (!modModal) return;
  modModal.hidden = false;
  document.body.style.overflow = "hidden";
}
function closeModal(){
  if (!modModal) return;
  modModal.hidden = true;
  document.body.style.overflow = "";
}

/* photos count desde data.json (gallery length) */
async function getPhotoCount(){
  const res = await fetch("data.json", { cache: "no-store" });
  if (!res.ok) return 0;
  const d = await res.json();
  const items = Array.isArray(d.gallery) ? d.gallery : [];
  return items.length;
}

/* Cargar lista de comentarios (por foto) */
async function loadModerationList(memorialId){
  if (!modList) return;

  const showHidden = !!modShowHidden?.checked;
  modList.innerHTML = `<div class="lb__hint">Cargando…</div>`;

  const photoCount = await getPhotoCount();
  if (!photoCount){
    modList.innerHTML = `<div class="lb__hint">No se detectaron fotos en gallery.</div>`;
    return;
  }

  const rows = [];

  for (let i = 0; i < photoCount; i++){
    const colRef = collection(db, "memorials", memorialId, "photos", String(i), "comments");
    const qy = query(colRef, orderBy("createdAt", "desc"), limit(50));
    const snap = await getDocs(qy);

    snap.forEach((d) => {
      const c = d.data() || {};
      const hidden = !!c.hidden;

      if (!showHidden && hidden) return;

      rows.push({
        photoId: String(i),
        commentId: d.id,
        name: c.name || "Usuario",
        text: c.text || "",
        uid: c.uid || "",
        hidden
      });
    });
  }

  if (!rows.length){
    modList.innerHTML = `<div class="lb__hint">No hay comentarios para mostrar.</div>`;
    return;
  }

  modList.innerHTML = rows.map(r => {
    const badge = r.hidden ? `<span class="lb__hint">Oculto</span>` : `<span class="lb__hint">Visible</span>`;
    const btnText = r.hidden ? "Mostrar" : "Ocultar";

    return `
      <div class="cItem" style="display:grid; gap:8px">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:center; flex-wrap:wrap">
          <div><strong>${esc(r.name)}</strong> <span class="lb__hint">(foto ${esc(r.photoId)})</span></div>
          ${badge}
        </div>

        <div>${esc(r.text)}</div>

        <div class="authRow" style="justify-content:space-between">
          <div class="lb__hint">UID: <code>${esc(r.uid)}</code></div>
          <button class="lb__btn primary" data-act="toggle" data-photo="${esc(r.photoId)}" data-id="${esc(r.commentId)}">
            ${btnText}
          </button>
        </div>
      </div>
    `;
  }).join("");

  // toggle hide/show
  modList.querySelectorAll('button[data-act="toggle"]').forEach(btn => {
    btn.addEventListener("click", async () => {
      const user = auth.currentUser;
      if (!user) return;

      const photoId = btn.dataset.photo;
      const commentId = btn.dataset.id;

      const ref = doc(db, "memorials", memorialId, "photos", String(photoId), "comments", commentId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;

      const cur = snap.data() || {};
      const nextHidden = !cur.hidden;

      await updateDoc(ref, {
        hidden: nextHidden,
        hiddenBy: user.uid,
        hiddenAt: serverTimestamp()
      });

      await loadModerationList(memorialId);
    });
  });
}

/* Habilitar / bloquear herramientas de “hacer mod” */
function applyPromotePermissions(){
  const canPromote = (currentRole === "global-admin" || currentRole === "memorial-admin");

  if (btnMakeMod) btnMakeMod.disabled = !canPromote;
  if (btnRemoveMod) btnRemoveMod.disabled = !canPromote;
  if (promoteUid) promoteUid.disabled = !canPromote;

  if (promoteMsg){
    if (!auth.currentUser){
      promoteMsg.textContent = "";
    } else if (!canPromote){
      promoteMsg.textContent = "Solo el admin (global o del memorial) puede asignar o quitar moderadores.";
    } else {
      promoteMsg.textContent = "";
    }
  }
}

/* Mostrar rol en pantalla */
function paintRole(){
  if (!modRoleText) return;

  if (!auth.currentUser){
    modRoleText.textContent = "";
    return;
  }

  const map = {
    "global-admin": "Rol: Admin global ✅",
    "memorial-admin": "Rol: Admin del memorial ✅",
    "mod": "Rol: Moderador ✅",
    "none": "Rol: Usuario (sin permisos)"
  };
  modRoleText.textContent = map[currentRole] || "";
}

/* UI hooks */
function setupUIHooks(memorialId){
  // UID row
  onAuthStateChanged(auth, (user) => {
    if (uidRow && myUid && copyUid){
      if (user){
        uidRow.hidden = false;
        myUid.textContent = user.uid;
        copyUid.onclick = async () => {
          await navigator.clipboard.writeText(user.uid);
          copyUid.textContent = "Copiado ✅";
          setTimeout(() => copyUid.textContent = "Copiar UID", 1200);
        };
      } else {
        uidRow.hidden = true;
      }
    }
  });

  // modal open/close
  btnOpenMod?.addEventListener("click", async () => {
    openModal();
    await loadModerationList(memorialId);
  });
  modClose?.addEventListener("click", closeModal);
  modModal?.addEventListener("click", (e) => {
    if (e.target === modModal) closeModal();
  });

  modRefresh?.addEventListener("click", async () => {
    await loadModerationList(memorialId);
  });
  modShowHidden?.addEventListener("change", async () => {
    await loadModerationList(memorialId);
  });

  // promote mod (solo admin)
  btnMakeMod?.addEventListener("click", async () => {
    const me = auth.currentUser;
    const target = (promoteUid?.value || "").trim();
    if (!me || !target) return;

    if (!(currentRole === "global-admin" || currentRole === "memorial-admin")){
      if (promoteMsg) promoteMsg.textContent = "No tienes permisos para asignar moderadores.";
      return;
    }

    if (promoteMsg) promoteMsg.textContent = "Aplicando…";

    try{
      await setDoc(memorialModDoc(memorialId, target), {
        role: "mod",
        createdBy: me.uid,
        createdAt: serverTimestamp()
      }, { merge: true });

      if (promoteMsg) promoteMsg.textContent = "Listo: ahora ese UID es moderador ✅";
    }catch(err){
      if (promoteMsg) promoteMsg.textContent = `Error: ${err?.code || err}`;
    }
  });

  btnRemoveMod?.addEventListener("click", async () => {
    const me = auth.currentUser;
    const target = (promoteUid?.value || "").trim();
    if (!me || !target) return;

    if (!(currentRole === "global-admin" || currentRole === "memorial-admin")){
      if (promoteMsg) promoteMsg.textContent = "No tienes permisos para quitar moderadores.";
      return;
    }

    if (promoteMsg) promoteMsg.textContent = "Quitando…";

    try{
      await deleteDoc(memorialModDoc(memorialId, target));
      if (promoteMsg) promoteMsg.textContent = "Listo: moderador removido ✅";
    }catch(err){
      if (promoteMsg) promoteMsg.textContent = `Error: ${err?.code || err}`;
    }
  });
}

async function boot(){
  const memorialId = getMemorialId();

  setupUIHooks(memorialId);

  onAuthStateChanged(auth, async (user) => {
    if (!modEntry) return;

    if (!user){
      currentRole = "none";
      modEntry.hidden = true;
      paintRole();
      applyPromotePermissions();
      return;
    }

    try{
      currentRole = await getMyRole(memorialId, user.uid);
    }catch(e){
      currentRole = "none";
    }

    // Mostrar botón de moderación a admin/mod
    modEntry.hidden = (currentRole === "none");

    paintRole();
    applyPromotePermissions();
  });
}

boot().catch(console.error);
