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
let timelineCache = []; // [{year, title, text}]

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

const btnUploadHomage = $("btnUploadHomage");
const btnClearHomage = $("btnClearHomage");
const homagePreview = $("homagePreview");

const tlList = $("tlList");
const btnAddTL = $("btnAddTL");
const btnSaveTL = $("btnSaveTL");

const qrBox = $("qrBox");
const btnDownloadQR = $("btnDownloadQR");
const btnDownloadQRSVG = $("btnDownloadQRSVG");
const btnDownloadPlaque = $("btnDownloadPlaque");
const btnDownloadPlaque3D = $("btnDownloadPlaque3D");
const qrUrl = $("qrUrl");

const SITE_BASE = "https://gaboohxx.github.io/imprimeturecuerdo";
function publicMemorialUrl(id){
  return (id === "Camilo-Fuentes")
    ? `${SITE_BASE}/memoriales/Camilo-Fuentes/`
    : `${SITE_BASE}/memorial/?m=${encodeURIComponent(id)}`;
}

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
    if (isAdmin){ await loadAll(); renderQR(); }
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

function slugify(s){
  return String(s)
    .normalize("NFD")                 // separa letras de sus acentos
    .replace(/[^\x00-\x7F]/g, "")     // elimina los acentos (no-ASCII)
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

const btnNewMemorial = $("btnNewMemorial");
btnNewMemorial?.addEventListener("click", async () => {
  if (!auth.currentUser){ showError("Inicia sesión primero."); return; }
  const name = (window.prompt("Nombre de la persona (ej: María González Pérez):") || "").trim();
  if (!name) return;
  const slug = slugify(name);
  if (!slug){ showError("Ese nombre no genera un identificador válido."); return; }
  memorialIdInput.value = slug;
  await loadMemorial();
  if (isAdmin && fName){ fName.value = name; } // prellena el nombre para ahorrar pasos
  showOk("✨ Memorial nuevo listo. Completa los datos, sube fotos y pulsa Guardar.");
});

async function loadMemorial(){
  const v = (memorialIdInput.value || "").trim();
  if (!v) return;
  memorialId = v;
  memorialActive.textContent = v;
  // Camilo tiene carpeta propia; los memoriales nuevos usan la página genérica.
  linkView.href = (v === "Camilo-Fuentes")
    ? "../memoriales/Camilo-Fuentes/"
    : `../memorial/?m=${encodeURIComponent(v)}`;

  const user = auth.currentUser;
  if (!user) return;

  isAdmin = await checkAdmin(user.uid);
  applyAdminUI();
  if (isAdmin){ await loadAll(); renderQR(); }
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

  // Música del Modo homenaje
  const homageUrl = c.homageMusicUrl || "";
  if (homageUrl){ homagePreview.src = previewSrc(homageUrl); homagePreview.hidden = false; }
  else if (homagePreview){ homagePreview.hidden = true; }

  // Línea de tiempo
  const timeline = Array.isArray(c.timeline) ? c.timeline : (Array.isArray(base.timeline) ? base.timeline : []);
  timelineCache = timeline.map(t => ({ year: t.year || "", title: t.title || "", text: t.text || "" }));
  renderTimelineEditor();
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

/* ---------- Código QR (generamos la matriz y dibujamos PNG/SVG/placa) ---------- */
function buildQrMatrix(text){
  const qr = window.qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const m = [];
  for (let r = 0; r < n; r++){
    const row = [];
    for (let c = 0; c < n; c++) row.push(qr.isDark(r, c));
    m.push(row);
  }
  return m;
}

function drawQrCanvas(canvas, m, targetPx, quiet){
  const n = m.length;
  const total = n + quiet * 2;
  const cell = Math.max(2, Math.floor(targetPx / total));
  const dim = cell * total;
  canvas.width = dim; canvas.height = dim;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, dim, dim);
  ctx.fillStyle = "#000000";
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (m[r][c]) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
}

function qrOnlySvg(m, quiet, unit){
  const n = m.length;
  const total = (n + quiet * 2) * unit;
  let rects = "";
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (m[r][c]) rects += `<rect x="${(c + quiet) * unit}" y="${(r + quiet) * unit}" width="${unit}" height="${unit}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}mm" height="${total}mm" viewBox="0 0 ${total} ${total}"><rect width="${total}" height="${total}" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
}

// Placa memorial limpia: borde doble, cruz religiosa, medallón circular, nombre auto-ajustado
function buildPlaqueSvg(m, name, dates){
  const W = 90, H = 120, quiet = 2;
  const n = m.length;
  const cx = W / 2; // 45

  // Medallón: QR centered at cy=46, circle r=26
  const cy = 46, circR = 26;
  const qrSize = 36; // cabe en el círculo: diagonal = 36*√2 ≈ 50.9mm > 2*26 = 52mm ✓
  const qx = cx - qrSize / 2;
  const qy = cy - qrSize / 2;
  const cell = qrSize / (n + quiet * 2);

  let qrRects = "";
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (m[r][c]){
        const x = (qx + (c + quiet) * cell).toFixed(2);
        const y = (qy + (r + quiet) * cell).toFixed(2);
        qrRects += `<rect x="${x}" y="${y}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}"/>`;
      }

  // Borde exterior doble (fino y elegante, solo trazo)
  const border = `
    <rect x="3.5" y="3.5" width="83" height="113" rx="5.5" ry="5.5" fill="none" stroke="#1a1a1a" stroke-width="1.4"/>
    <rect x="6"   y="6"   width="78" height="108" rx="3.5" ry="3.5" fill="none" stroke="#1a1a1a" stroke-width="0.35"/>`;

  // Cruz religiosa proporcional (brazo vertical más largo, cruceta a 1/3 desde arriba)
  const cTop = 9, cH = 13, cW = 8.5, cT = 1.5, cBarY = cTop + cH * 0.32;
  const cross = `
    <rect x="${(cx - cT/2).toFixed(2)}" y="${cTop}" width="${cT}" height="${cH}" rx="0.5" fill="#1a1a1a"/>
    <rect x="${(cx - cW/2).toFixed(2)}" y="${(cBarY - cT/2).toFixed(2)}" width="${cW}" height="${cT}" rx="0.5" fill="#1a1a1a"/>`;

  // Círculo medallón: anillo fino (doble línea concéntrica)
  const circle = `
    <circle cx="${cx}" cy="${cy}" r="${circR + 1.5}" fill="none" stroke="#1a1a1a" stroke-width="0.9"/>
    <circle cx="${cx}" cy="${cy}" r="${circR - 1.5}" fill="none" stroke="#1a1a1a" stroke-width="0.3"/>`;

  // 4 puntos cardinales simples (solo N/E/S/W, sin diagonales)
  const dOff = circR + 3.8;
  const dots = `
    <circle cx="${cx}"          cy="${(cy - dOff).toFixed(1)}" r="1.3" fill="#1a1a1a"/>
    <circle cx="${(cx+dOff).toFixed(1)}" cy="${cy}"          r="1.3" fill="#1a1a1a"/>
    <circle cx="${cx}"          cy="${(cy + dOff).toFixed(1)}" r="1.3" fill="#1a1a1a"/>
    <circle cx="${(cx-dOff).toFixed(1)}" cy="${cy}"          r="1.3" fill="#1a1a1a"/>`;

  // Nombre: auto-divide si es muy largo (evita desbordamiento)
  const nm   = (name  || "").trim();
  const dt   = (dates || "").trim();
  const words = nm.split(" ");
  const tooWide = nm.length * 4.5 * 0.56 > 76; // estimación ancho Georgia
  let nameLines = [nm];
  if (tooWide && words.length > 2){
    const mid = Math.ceil(words.length / 2);
    nameLines = [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
  }

  // Construye los textos de forma acumulativa desde textTop
  const nameFontSize = 4.5, lineGap = 2;
  let curY = cy + dOff + 8; // punto de partida bajo el punto S

  const nameEls = nameLines.map(line => {
    const el = `<text x="${cx}" y="${curY.toFixed(1)}" text-anchor="middle" font-family="Georgia,serif" font-size="${nameFontSize}" font-weight="600" fill="#1a1a1a">${escTxt(line)}</text>`;
    curY += nameFontSize + lineGap;
    return el;
  }).join("\n  ");

  curY += 1.5; // pequeña pausa antes de las fechas
  const datesEl = dt
    ? `<text x="${cx}" y="${curY.toFixed(1)}" text-anchor="middle" font-family="Georgia,serif" font-size="3.1" fill="#1a1a1a">${escTxt(dt)}</text>`
    : "";
  if (dt) curY += 3.1 + 2;

  curY += 4; // espacio antes del separador
  const divider = `<line x1="${(cx-20).toFixed(1)}" y1="${curY.toFixed(1)}" x2="${(cx+20).toFixed(1)}" y2="${curY.toFixed(1)}" stroke="#1a1a1a" stroke-width="0.5"/>`;
  curY += 6;

  const verse = `<text x="${cx}" y="${curY.toFixed(1)}" text-anchor="middle" font-family="Georgia,serif" font-size="2.8" font-style="italic" fill="#1a1a1a">Siempre en nuestro corazón</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#fff"/>
  ${border}
  ${cross}
  ${circle}
  ${dots}
  <g fill="#1a1a1a">${qrRects}</g>
  ${nameEls}
  ${datesEl}
  ${divider}
  ${verse}
</svg>`;
}

// Versión 3D para Tinkercad: solo formas con fill (sin stroke-only, sin texto)
function buildPlaqueSvg3D(m){
  const W = 90, H = 120, quiet = 2;
  const n = m.length;
  const cx = W / 2;
  const cy = 46, circR = 26;
  const qrSize = 36;
  const qx = cx - qrSize / 2;
  const qy = cy - qrSize / 2;
  const cell = qrSize / (n + quiet * 2);

  let qrRects = "";
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (m[r][c]){
        const x = (qx + (c + quiet) * cell).toFixed(2);
        const y = (qy + (r + quiet) * cell).toFixed(2);
        qrRects += `<rect x="${x}" y="${y}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}"/>`;
      }

  // Marco: 4 barras rellenas (Tinkercad no soporta stroke-only)
  const ft = 1.5;
  const border3d = `
    <rect x="3" y="3" width="84" height="${ft}" fill="#000"/>
    <rect x="3" y="${H - 3 - ft}" width="84" height="${ft}" fill="#000"/>
    <rect x="3" y="3" width="${ft}" height="114" fill="#000"/>
    <rect x="${W - 3 - ft}" y="3" width="${ft}" height="114" fill="#000"/>`;

  // Cruz religiosa (rects rellenos)
  const cTop = 9, cH = 13, cW = 8.5, cT = 1.5, cBarY = cTop + cH * 0.32;
  const cross = `
    <rect x="${(cx - cT/2).toFixed(2)}" y="${cTop}" width="${cT}" height="${cH}" rx="0.5" fill="#000"/>
    <rect x="${(cx - cW/2).toFixed(2)}" y="${(cBarY - cT/2).toFixed(2)}" width="${cW}" height="${cT}" rx="0.5" fill="#000"/>`;

  // Anillo circular: path fill-rule evenodd (dos círculos como subpaths)
  const oR = circR + 2.5;
  const iR = circR - 2;
  const ring = `<path fill="#000" fill-rule="evenodd" d="M ${cx} ${cy - oR} A ${oR} ${oR} 0 1 0 ${cx} ${cy + oR} A ${oR} ${oR} 0 1 0 ${cx} ${cy - oR} Z M ${cx} ${cy - iR} A ${iR} ${iR} 0 1 0 ${cx} ${cy + iR} A ${iR} ${iR} 0 1 0 ${cx} ${cy - iR} Z"/>`;

  // 4 puntos cardinales (círculos rellenos)
  const dOff = circR + 3.8;
  const dots = `
    <circle cx="${cx}"                     cy="${(cy - dOff).toFixed(1)}" r="1.3" fill="#000"/>
    <circle cx="${(cx + dOff).toFixed(1)}" cy="${cy}"                     r="1.3" fill="#000"/>
    <circle cx="${cx}"                     cy="${(cy + dOff).toFixed(1)}" r="1.3" fill="#000"/>
    <circle cx="${(cx - dOff).toFixed(1)}" cy="${cy}"                     r="1.3" fill="#000"/>`;

  // Separador: rect fino en lugar de <line>
  const divY = 102;
  const divider = `<rect x="${(cx - 20).toFixed(1)}" y="${divY}" width="40" height="0.6" fill="#000"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">
  ${border3d}
  ${cross}
  ${ring}
  ${dots}
  <g fill="#000">${qrRects}</g>
  ${divider}
</svg>`;
}

function renderQR(){
  if (!qrBox || !window.qrcode || !memorialId) return;
  const url = publicMemorialUrl(memorialId);
  const m = buildQrMatrix(url);
  qrBox.innerHTML = "";
  const canvas = document.createElement("canvas");
  qrBox.appendChild(canvas);
  drawQrCanvas(canvas, m, 280, 4);
  if (qrUrl) qrUrl.textContent = url;
}

function downloadBlob(content, type, filename){
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

btnDownloadQR?.addEventListener("click", () => {
  const canvas = qrBox?.querySelector("canvas");
  if (!canvas){ showError("El QR aún no está listo."); return; }
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `QR-${memorialId}.png`;
  document.body.appendChild(a); a.click(); a.remove();
});

btnDownloadQRSVG?.addEventListener("click", () => {
  if (!window.qrcode || !memorialId){ showError("El QR aún no está listo."); return; }
  const m = buildQrMatrix(publicMemorialUrl(memorialId));
  downloadBlob(qrOnlySvg(m, 4, 4), "image/svg+xml", `QR-${memorialId}.svg`);
});

btnDownloadPlaque?.addEventListener("click", () => {
  if (!window.qrcode || !memorialId){ showError("El QR aún no está listo."); return; }
  const m = buildQrMatrix(publicMemorialUrl(memorialId));
  const svg = buildPlaqueSvg(m, fName?.value, fDates?.value);
  downloadBlob(svg, "image/svg+xml", `Placa-${memorialId}.svg`);
});

btnDownloadPlaque3D?.addEventListener("click", () => {
  if (!window.qrcode || !memorialId){ showError("El QR aún no está listo."); return; }
  const m = buildQrMatrix(publicMemorialUrl(memorialId));
  const svg = buildPlaqueSvg3D(m);
  downloadBlob(svg, "image/svg+xml", `Placa3D-${memorialId}.svg`);
});

/* ---------- Línea de tiempo ---------- */
function escTxt(s){ return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function escAttr(s){ return String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"); }

function renderTimelineEditor(){
  if (!tlList) return;
  if (!timelineCache.length){
    tlList.innerHTML = `<div class="muted">Aún no hay hitos. Usa “+ Agregar hito”.</div>`;
    return;
  }
  tlList.innerHTML = timelineCache.map((t, i) => `
    <div class="tlRow" data-i="${i}">
      <input class="input tlYear" placeholder="Año" value="${escAttr(t.year)}">
      <input class="input tlTitle" placeholder="Título (ej: Nació en Santiago)" value="${escAttr(t.title)}">
      <textarea class="input tlText" rows="2" placeholder="Descripción breve…">${escTxt(t.text)}</textarea>
      <button class="mini danger" type="button" data-act="delTL">Eliminar</button>
    </div>
  `).join("");
}

function collectTimeline(keepEmpty){
  if (!tlList) return [];
  const rows = [...tlList.querySelectorAll(".tlRow")].map(row => ({
    year: (row.querySelector(".tlYear")?.value || "").trim(),
    title: (row.querySelector(".tlTitle")?.value || "").trim(),
    text: (row.querySelector(".tlText")?.value || "").trim()
  }));
  return keepEmpty ? rows : rows.filter(t => t.year || t.title || t.text);
}

btnAddTL?.addEventListener("click", () => {
  if (!ensureAdmin()) return;
  timelineCache = collectTimeline(true);
  timelineCache.push({ year: "", title: "", text: "" });
  renderTimelineEditor();
});

tlList?.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-act='delTL']");
  if (!b) return;
  const i = Number(b.closest(".tlRow")?.dataset.i);
  timelineCache = collectTimeline(true).filter((_, k) => k !== i);
  renderTimelineEditor();
});

btnSaveTL?.addEventListener("click", async () => {
  if (!ensureAdmin()) return;
  timelineCache = collectTimeline(false);
  try{
    await setDoc(contentDoc(), { timeline: timelineCache, updatedAt: serverTimestamp() }, { merge: true });
    showOk("Línea de tiempo guardada ✅");
  }catch(e){ showError("No se pudo guardar la línea de tiempo: " + (e?.code || e)); }
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

/* ---------- Música del Modo homenaje ---------- */
btnUploadHomage?.addEventListener("click", () => {
  if (!ensureAdmin()) return;
  openWidget({
    multiple: false,
    resourceType: "auto",
    clientAllowedFormats: ["mp3", "m4a", "wav", "ogg", "aac", "mpeg"]
  }, async (info) => {
    await setDoc(contentDoc(), { homageMusicUrl: info.secure_url, updatedAt: serverTimestamp() }, { merge: true });
    homagePreview.src = info.secure_url; homagePreview.hidden = false;
    showOk("Música de homenaje guardada ✅");
  });
});
btnClearHomage?.addEventListener("click", async () => {
  if (!ensureAdmin()) return;
  await setDoc(contentDoc(), { homageMusicUrl: "", updatedAt: serverTimestamp() }, { merge: true });
  if (homagePreview) homagePreview.hidden = true;
  showOk("Música quitada");
});

/* ---------- util ---------- */
function ensureAdmin(){
  if (!auth.currentUser){ showError("Inicia sesión primero."); return false; }
  if (!isAdmin){ showError("No tienes permisos de administrador en este memorial."); return false; }
  return true;
}
