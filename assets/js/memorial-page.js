async function loadMemorial(){
  const res = await fetch("data.json", { cache: "no-store" });
  if (!res.ok) throw new Error("No se pudo cargar data.json");
  const d = await res.json();

  // Título
  document.title = (d.name || "Memorial") + " | Imprime tu Recuerdo";

  // Datos básicos
  const cover = document.getElementById("cover");
  cover.src = d.cover || "";
  cover.alt = d.name ? `Foto de ${d.name}` : "Foto";

  document.getElementById("name").textContent = d.name || "";
  document.getElementById("dates").textContent = d.dates || "";
  document.getElementById("bio").textContent = d.bio || "";

  // Galería
  const gallery = Array.isArray(d.gallery) ? d.gallery : [];
  const g = document.getElementById("gallery");

  // IMPORTANTE: renderiza como BOTONES clickeables
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

  // Click en miniaturas
  g.addEventListener("click", (e) => {
    const btn = e.target.closest(".mThumbBtn");
    if (!btn) return;
    openLb(Number(btn.dataset.i));
  });

  // Cerrar
  lbClose.addEventListener("click", closeLb);

  // Click fuera de la imagen
  lb.addEventListener("click", (e) => {
    if (e.target === lb) closeLb();
  });

  // Teclado
  window.addEventListener("keydown", (e) => {
    if (lb.hidden) return;
    if (e.key === "Escape") closeLb();
    if (e.key === "ArrowRight") openLb((current + 1) % gallery.length);
    if (e.key === "ArrowLeft") openLb((current - 1 + gallery.length) % gallery.length);
  });
}

loadMemorial().catch((err) => {
  console.error(err);
});
