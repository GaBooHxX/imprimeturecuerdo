async function loadMemorial(){
  const res = await fetch("data.json", { cache: "no-store" });
  if (!res.ok) throw new Error("No se pudo cargar data.json");
  const d = await res.json();

  document.title = (d.name || "Memorial") + " | Imprime tu Recuerdo";

  // Datos básicos
  const cover = document.getElementById("cover");
  cover.src = d.cover || "";
  cover.alt = d.name ? `Foto de ${d.name}` : "Foto";

  document.getElementById("name").textContent = d.name || "";
  document.getElementById("dates").textContent = d.dates || "";
  document.getElementById("bio").textContent = d.bio || "";

  // Galería (botones clickeables)
  const gallery = Array.isArray(d.gallery) ? d.gallery : [];
  const g = document.getElementById("gallery");

  g.innerHTML = gallery.map((src, i) => `
    <button class="mThumbBtn" type="button" data-i="${i}" aria-label="Abrir imagen">
      <img class="mThumb" src="${src}" alt="" loading="lazy" draggable="false">
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

  // Lightbox
  const lb = document.getElementById("lightbox");
  const lbImg = document.getElementById("lbImg");
  const lbClose = document.getElementById("lbClose");

  let current = 0;

  function openLb(i){
    if (!gallery[i]) return;
    current = i;
    lbImg.src = gallery[i];
    lb.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeLb(){
    lb.hidden = true;
    lbImg.src = "";
    document.body.style.overflow = "";
  }

  // Abrir al click en miniatura
  g.addEventListener("click", (e) => {
    const btn = e.target.closest(".mThumbBtn");
    if (!btn) return;
    openLb(Number(btn.dataset.i));
  });

  // Cerrar (botón)
  lbClose.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeLb();
  });

  // Cerrar tocando el fondo oscuro
  lb.addEventListener("click", (e) => {
    // si tocó la imagen, no cerrar
    if (e.target === lbImg) return;
    closeLb();
  });

  // Teclado (en PC)
  window.addEventListener("keydown", (e) => {
    if (lb.hidden) return;
    if (e.key === "Escape") closeLb();
    if (e.key === "ArrowRight" && gallery.length) openLb((current + 1) % gallery.length);
    if (e.key === "ArrowLeft" && gallery.length) openLb((current - 1 + gallery.length) % gallery.length);
  });
}

loadMemorial().catch(console.error);
