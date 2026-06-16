import { firebaseConfig, cloudinaryConfig, ownerEmails } from "./firebase-config.js";

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
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* ---------- init ---------- */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

await setPersistence(auth, browserLocalPersistence).catch(() => {});
await getRedirectResult(auth).catch(() => {});

/* ---------- estado ---------- */
let memorialId = null;
let isAdmin = false;
let galleryCache = []; // [{key, url, caption, order, ...}]
let audiosCache = []; // [{url, caption}]

/* ---------- refs ---------- */
const $ = (id) => document.getElementById(id);
const authStatus = $("authStatus");
const btnLogin = $("btnLogin");
const btnLogout = $("btnLogout");
const roleInfo = $("roleInfo");
const errorBox = $("errorBox");
const okBox = $("okBox");

const memorialPick = $("memorialPick");
const memorialIdInput = $("memorialIdInput");
const btnLoadMemorial = $("btnLoadMemorial");
const memorialActive = $("memorialActive");
const linkView = $("linkView");
const editor = $("editor");

const fName = $("fName");
const fDates = $("fDates");
const fBio = $("fBio");
const fHistory = $("fHistory");
const fQuotes = $("fQuotes");
const btnSaveText = $("btnSaveText");

const coverPreview = $("coverPreview");
const btnUploadCover = $("btnUploadCover");
const btnClearCover = $("btnClearCover");

const dropHint = $("dropHint");
const btnUploadPhotos = $("btnUploadPhotos");
const importBox = $("importBox");
const btnImport = $("btnImport");
const galleryGrid = $("galleryGrid");

const fVideo = $("fVideo");
const btnSaveVideo = $("btnSaveVideo");
const btnClearVideo = $("btnClearVideo");

const btnUploadAudio = $("btnUploadAudio");
const audioList = $("audioList");

/* ---------- helpers UI ---------- */
function showError(msg){
  if (!msg){ errorBox.hidden = true; errorBox.textContent = ""; return; }
  errorBox.hidden = false; errorBox.textContent = msg;
}
function showOk(msg){
  if (!msg){ okBox.hidden = true; okBox.textContent = ""; return; }
  okBox.hidden = false; okBox.textContent = msg;
  setTimeout(() => { okBox.hidden = true; }, 2600);
}
function cloudinaryReady(){
  return cloudinaryConfig
    && cloudinaryConfig.cloudName && cloudinaryConfig.cloudName !== "TU_CLOUD_NAME"
    && cloudinaryConfig.uploadPreset && cloudinaryConfig.uploadPreset !== "TU_UPLOAD_PRESET";
}
function previewSrc(url){
  // Los originales de data.json son relativos a la página del memorial (../../).
  // En este panel (un nivel menos profundo) los mostramos con un solo ../
  if (typeof url === "string" && url.startsWith("../../")) return url.replace("../../", "../");
  return url;
}

/* ---------- rutas Firestore ---------- */
const contentDoc = () => doc(db, "memorials", memorialId, "meta", "content");
const galleryCol = () => collection(db, "memorials", memorialId, "gallery");

/* ---------- auth ---------- */
btnLogin?.addEventListener("click", async () => {
  showError("");
  try{ await signInWithPopup(auth, provider); }
  catch(err){
    const code = err?.code || "";
    if (["auth/popup-blocked","auth/popup-closed-by-user","auth/operation-not-supported-in-this-environment"].includes(code)){
      await signInWithRedirect(auth, provider); return;
    }
    showError("No se pudo iniciar sesión: " + code);
  }
});
btnLogout?.addEventListener("click", () => signOut(auth));

function isOwnerEmail(email){
  const list = Array.isArray(ownerEmails) ? ownerEmails : [];
  return !!email && list.map(e => String(e).toLowerCase()).includes(String(email).toLowerCase());
}

async function checkAdmin(uid){
  // Dueño por correo (lo más simple: ni UID ni documentos)
  if (isOwnerEmail(auth.currentUser?.email)) return true;

  // O admin global / admin de este memorial (por si agregas a alguien sin tocar la lista)
  try{
    const g = await getDoc(doc(db, "admins", uid));
    if (g.exists()) return true;
  }catch(_){}
  try{
    const a = await getDoc(doc(db, "memorials", memorialId, "admin", uid));
    if (a.exists()) return true;
  }catch(_){}
  return false;
}

onAuthStateChanged(auth, async (user) => {
  if (!user){
    authStatus.textContent = "Invitado";
    btnLogin.hidden = false; btnLogout.hidden = true;
    roleInfo.textContent = "Inicia sesión con Google para editar el memorial.";
    memorialPick.hidden = true; editor.hidden = true;
    return;
  }

  authStatus.textContent = `${user.displayName || "Usuario"} (conectado)`;
  btnLogin.hidden = true; btnLogout.hidden = false;
  memorialPick.hidden = false;
  roleInfo.textContent = "Sesión iniciada. Carga un memorial para editar.";

  if (memorialId){
    isAdmin = await checkAdmin(user.uid);
    applyAdminUI();
    if (isAdmin) await loadAll();
  }
});

function applyAdminUI(){
  editor.hidden = !isAdmin;
  if (!auth.currentUser) return;
  roleInfo.textContent = isAdmin
    ? "✅ Eres administrador de este memorial. Puedes editarlo."
    : "No tienes permisos de administrador en este memorial. (Pídele al dueño que te agregue, o revisa LEEME-CONFIGURACION.md).";
}

/* ---------- cargar memorial ---------- */
btnLoadMemorial?.addEventListener("click", loadMemorial);
memorialIdInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") loadMemorial(); });

async function loadMemorial(){
  const v = (memorialIdInput.value || "").trim();
  if (!v) return;
  memorialId = v;
  memorialActive.textContent = v;
  linkView.href = `../memoriales/${encodeURIComponent(v)}/`;

  const user = auth.currentUser;
  if (!user) return;

  isAdmin = await checkAdmin(user.uid);
  applyAdminUI();
  if (isAdmin) await loadAll();
}

async function loadAll(){
  showError("");
  if (!cloudinaryReady()){
    showError("⚠️ Falta configurar Cloudinary en assets/js/firebase-config.js (cloudName y uploadPreset). Las subidas no funcionarán hasta completarlo. Mira LEEME-CONFIGURACION.md.");
  }
  await loadTextsAndMeta();
  await loadGallery();
}

/* ---------- textos + meta ---------- */
async function loadTextsAndMeta(){
  // Base: data.json del memorial
  let base = {};
  try{
    const res = await fetch(`../memoriales/${memorialId}/data.json`, { cache: "no-store" });
    if (res.ok) base = await res.json();
  }catch(_){}

  // Override: documento de contenido (lo que ya se editó)
  let c = {};
  try{
    const snap = await getDoc(contentDoc());
    if (snap.exists()) c = snap.data() || {};
  }catch(_){}

  const baseHistory = (Array.isArray(base.sections) ? base.sections : [])
    .find(s => String(s.title || "").toLowerCase().includes("historia"));

  fName.value = c.name ?? base.name ?? "";
  fDates.value = c.dates ?? base.dates ?? "";
  fBio.value = c.bio ?? base.bio ?? "";
  fHistory.value = c.history ?? (baseHistory?.content || "");
  const quotes = Array.isArray(c.quotes) ? c.quotes : (Array.isArray(base.quotes) ? base.quotes : []);
  fQuotes.value = quotes.join("\n");

  // Portada
  const coverUrl = c.coverUrl || base.cover || "";
  if (coverUrl){ coverPreview.src = previewSrc(coverUrl); coverPreview.hidden = false; }
  else { coverPreview.hidden = true; }

  // Videos (uno por línea)
  let videos = Array.isArray(c.videos) ? c.videos.filter(Boolean) : [];
  if (!videos.length){
    const single = c.videoUrl || base.video?.youtubeEmbedUrl;
    if (single) videos = [single];
  }
  fVideo.value = videos.join("\n");

  // Audios
  let audios = Array.isArray(c.audios) ? c.audios.filter(a => a && a.url) : [];
  if (!audios.length){
    const single = c.audioUrl || base.audio?.src;
    if (single) audios = [{ url: single, caption: base.audio?.caption || "" }];
  }
  audiosCache = audios;
  renderAudios();
}

function renderAudios(){
  if (!audioList) return;
  if (!audiosCache.length){
    audioList.innerHTML = `<div class="muted" style="margin-top:10px">Aún no hay audios.</div>`;
    return;
  }
  audioList.innerHTML = audiosCache.map((a, i) => `
    <div class="audioItem">
      <audio controls preload="metadata" src="${previewSrc(a.url)}"></audio>
      <button class="mini danger" type="button" data-act="delAudio" data-i="${i}">Eliminar</button>
    </div>
  `).join("");
}

async function saveAudios(){
  await setDoc(contentDoc(), { audios: audiosCache, audioUrl: "", updatedAt: serverTimestamp() }, { merge: true });
}

audioList?.addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-act='delAudio']");
  if (!b) return;
  if (!ensureAdmin()) return;
  const i = Number(b.dataset.i);
  audiosCache = audiosCache.filter((_, k) => k !== i);
  try{ await saveAudios(); renderAudios(); showOk("Audio eliminado"); }
  catch(err){ showError("No se pudo eliminar el audio: " + (err?.code || err)); }
});

btnSaveText?.addEventListener("click", async () => {
  if (!ensureAdmin()) return;
  const quotes = fQuotes.value.split("\n").map(s => s.trim()).filter(Boolean);
  try{
    await setDoc(contentDoc(), {
      name: fName.value.trim(),
      dates: fDates.value.trim(),
      bio: fBio.value.trim(),
      history: fHistory.value.trim(),
      quotes,
      updatedAt: serverTimestamp()
    }, { merge: true });
    showOk("Textos guardados ✅");
  }catch(e){ showError("No se pudieron guardar los textos: " + (e?.code || e)); }
});

/* ---------- Cloudinary ---------- */
async function uploadFile(file, resourceType = "auto"){
  const { cloudName, uploadPreset } = cloudinaryConfig;
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", uploadPreset);
  fd.append("folder", `memoriales/${memorialId}`);
  const res = await fetch(url, { method: "POST", body: fd });
  if (!res.ok) throw new Error("Cloudinary " + res.status);
  return res.json(); // { secure_url, public_id, resource_type, ... }
}

function openWidget(opts, onSuccess){
  if (!cloudinaryReady()){
    showError("Configura Cloudinary primero (firebase-config.js).");
    return;
  }
  if (!window.cloudinary){
    showError("No se cargó el componente de Cloudinary. Revisa tu conexión.");
    return;
  }
  const widget = window.cloudinary.createUploadWidget({
    cloudName: cloudinaryConfig.cloudName,
    uploadPreset: cloudinaryConfig.uploadPreset,
    folder: `memoriales/${memorialId}`,
    sources: ["local", "camera", "url"],
    showAdvancedOptions: false,
    language: "es",
    text: { es: { menu: { files: "Mis archivos", camera: "Cámara", url: "Enlace web" } } },
    ...opts
  }, async (error, result) => {
    if (error){ showError("Error al subir: " + (error?.message || error)); return; }
    if (result && result.event === "success"){
      try{ await onSuccess(result.info); }
      catch(e){ showError("Subió, pero no se pudo guardar: " + (e?.code || e)); }
    }
  });
  widget.open();
}

/* ---------- Portada ---------- */
btnUploadCover?.addEventListener("click", () => {
  if (!ensureAdmin()) return;
  openWidget({ multiple: false, resourceType: "image" }, async (info) => {
    await setDoc(contentDoc(), { coverUrl: info.secure_url, updatedAt: serverTimestamp() }, { merge: true });
    coverPreview.src = info.secure_url; coverPreview.hidden = false;
    showOk("Portada actualizada ✅");
  });
});
btnClearCover?.addEventListener("click", async () => {
  if (!ensureAdmin()) return;
  await setDoc(contentDoc(), { coverUrl: "", updatedAt: serverTimestamp() }, { merge: true });
  coverPreview.hidden = true;
  showOk("Portada restablecida a la original ✅");
  loadTextsAndMeta();
});

/* ---------- Galería: subir ---------- */
btnUploadPhotos?.addEventListener("click", () => {
  if (!ensureAdmin()) return;
  openWidget({ multiple: true, resourceType: "image" }, async (info) => {
    await addPhoto(info.secure_url, info.public_id);
  });
});

async function addPhoto(url, publicId = ""){
  const nextOrder = galleryCache.length
    ? Math.max(...galleryCache.map(g => Number(g.order || 0))) + 1
    : 0;
  await addDoc(galleryCol(), {
    url,
    caption: "",
    order: nextOrder,
    publicId,
    createdAt: serverTimestamp()
  });
  await loadGallery();
  showOk("Foto agregada ✅");
}

/* Drag & drop directo sobre la zona */
["dragenter", "dragover"].forEach(ev =>
  dropHint?.addEventListener(ev, (e) => { e.preventDefault(); dropHint.classList.add("is-over"); })
);
["dragleave", "drop"].forEach(ev =>
  dropHint?.addEventListener(ev, (e) => { e.preventDefault(); dropHint.classList.remove("is-over"); })
);
dropHint?.addEventListener("drop", async (e) => {
  if (!ensureAdmin()) return;
  if (!cloudinaryReady()){ showError("Configura Cloudinary primero (firebase-config.js)."); return; }
  const files = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith("image/"));
  if (!files.length) return;
  dropHint.classList.add("spin");
  showOk(`Subiendo ${files.length} foto(s)…`);
  try{
    for (const f of files){
      const info = await uploadFile(f, "image");
      await addPhoto(info.secure_url, info.public_id);
    }
  }catch(err){ showError("No se pudo subir: " + (err?.message || err)); }
  finally{ dropHint.classList.remove("spin"); }
});

/* ---------- Galería: importar originales ---------- */
btnImport?.addEventListener("click", async () => {
  if (!ensureAdmin()) return;
  try{
    const res = await fetch(`../memoriales/${memorialId}/data.json`, { cache: "no-store" });
    if (!res.ok) throw new Error("No se pudo leer data.json");
    const d = await res.json();
    const items = Array.isArray(d.gallery) ? d.gallery : [];
    if (!items.length){ showError("No hay fotos originales para importar."); return; }

    for (let i = 0; i < items.length; i++){
      const it = (typeof items[i] === "string") ? { src: items[i], caption: "" } : items[i];
      // Mismo id que el índice → conserva los comentarios existentes.
      await setDoc(doc(galleryCol(), String(i)), {
        url: it.src,
        caption: it.caption || "",
        order: i,
        publicId: "",
        imported: true,
        createdAt: serverTimestamp()
      }, { merge: true });
    }
    showOk("Fotos actuales importadas ✅");
    await loadGallery();
  }catch(e){ showError("No se pudieron importar: " + (e?.code || e)); }
});

/* ---------- Galería: render ---------- */
async function loadGallery(){
  galleryGrid.innerHTML = `<div class="muted">Cargando fotos…</div>`;
  let docs = [];
  try{
    const snap = await getDocs(query(galleryCol(), orderBy("order", "asc")));
    docs = snap.docs.map(x => ({ key: x.id, ...(x.data() || {}) }));
  }catch(e){ showError("No se pudo leer la galería: " + (e?.code || e)); }

  galleryCache = docs;
  importBox.hidden = docs.length > 0;

  if (!docs.length){
    galleryGrid.innerHTML = `<div class="muted">Todavía no hay fotos en tu galería editable. Sube nuevas o importa las actuales.</div>`;
    return;
  }

  galleryGrid.innerHTML = docs.map((g, i) => `
    <div class="gCard" data-key="${g.key}">
      <img src="${previewSrc(g.url)}" alt="" loading="lazy">
      <div class="gBody">
        <span class="gIndex">Posición ${i + 1} de ${docs.length}</span>
        <input class="capInput" data-key="${g.key}" value="${(g.caption || "").replace(/"/g, "&quot;")}" placeholder="Texto bajo la foto (opcional)">
        <div class="gActions">
          <button class="mini" data-act="up" data-key="${g.key}" ${i === 0 ? "disabled" : ""}>↑ Subir</button>
          <button class="mini" data-act="down" data-key="${g.key}" ${i === docs.length - 1 ? "disabled" : ""}>↓ Bajar</button>
        </div>
        <div class="gActions">
          <button class="mini save" data-act="caption" data-key="${g.key}">Guardar texto</button>
          <button class="mini danger" data-act="del" data-key="${g.key}">Eliminar</button>
        </div>
      </div>
    </div>
  `).join("");
}

galleryGrid?.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  if (!ensureAdmin()) return;

  const key = btn.dataset.key;
  const act = btn.dataset.act;
  const item = galleryCache.find(g => g.key === key);
  if (!item) return;

  if (act === "del"){
    if (!confirm("¿Eliminar esta foto del memorial?")) return;
    try{ await deleteDoc(doc(galleryCol(), key)); showOk("Foto eliminada"); await loadGallery(); }
    catch(err){ showError("No se pudo eliminar: " + (err?.code || err)); }
    return;
  }

  if (act === "caption"){
    const input = galleryGrid.querySelector(`input.capInput[data-key="${CSS.escape(key)}"]`);
    try{
      await updateDoc(doc(galleryCol(), key), { caption: (input?.value || "").trim() });
      showOk("Texto guardado ✅");
    }catch(err){ showError("No se pudo guardar el texto: " + (err?.code || err)); }
    return;
  }

  if (act === "up" || act === "down"){
    const idx = galleryCache.findIndex(g => g.key === key);
    const swapIdx = act === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= galleryCache.length) return;
    const a = galleryCache[idx], b = galleryCache[swapIdx];
    try{
      await Promise.all([
        updateDoc(doc(galleryCol(), a.key), { order: Number(b.order || 0) }),
        updateDoc(doc(galleryCol(), b.key), { order: Number(a.order || 0) })
      ]);
      await loadGallery();
    }catch(err){ showError("No se pudo reordenar: " + (err?.code || err)); }
  }
});

/* ---------- Videos (varios) ---------- */
btnSaveVideo?.addEventListener("click", async () => {
  if (!ensureAdmin()) return;
  const videos = fVideo.value.split("\n").map(s => s.trim()).filter(Boolean);
  try{
    await setDoc(contentDoc(), { videos, videoUrl: "", updatedAt: serverTimestamp() }, { merge: true });
    showOk(videos.length > 1 ? "Videos guardados ✅" : "Video guardado ✅");
  }catch(e){ showError("No se pudieron guardar los videos: " + (e?.code || e)); }
});
btnClearVideo?.addEventListener("click", async () => {
  if (!ensureAdmin()) return;
  fVideo.value = "";
  await setDoc(contentDoc(), { videos: [], videoUrl: "", updatedAt: serverTimestamp() }, { merge: true });
  showOk("Videos quitados");
});

/* ---------- Audios (varios) ---------- */
btnUploadAudio?.addEventListener("click", () => {
  if (!ensureAdmin()) return;
  openWidget({
    multiple: false,
    resourceType: "auto",
    clientAllowedFormats: ["mp3", "m4a", "wav", "ogg", "aac", "mpeg"]
  }, async (info) => {
    audiosCache = [...audiosCache, { url: info.secure_url, caption: "" }];
    await saveAudios();
    renderAudios();
    showOk("Audio agregado ✅");
  });
});

/* ---------- util ---------- */
function ensureAdmin(){
  if (!auth.currentUser){ showError("Inicia sesión primero."); return false; }
  if (!isAdmin){ showError("No tienes permisos de administrador en este memorial."); return false; }
  return true;
}
