async function loadMemorial(){
  const res = await fetch("data.json", { cache: "no-store" });
  const d = await res.json();

  document.title = (d.name || "Memorial") + " | Imprime tu Recuerdo";

  const cover = document.getElementById("cover");
  cover.src = d.cover || "";
  cover.alt = d.name ? `Foto de ${d.name}` : "Foto";

  document.getElementById("name").textContent = d.name || "";
  document.getElementById("dates").textContent = d.dates || "";
  document.getElementById("bio").textContent = d.bio || "";

  const gallery = Array.isArray(d.gallery) ? d.gallery : [];
  const g = document.getElementById("gallery");

  // Render galería como botones clickeables
  g.innerHTML = gallery.map((src, i) => `
    <button class="mThumbBtn" type="button" data-i="${i}" aria-label="Abrir imagen">
      <img class="mThumb" src="${src}" alt="" loading="lazy">
    </button>
  `).join("");

  // Video
  if (d.video?.youtubeEmbedUrl){
    document.getElementById("videoSection").hidden = false;
    document.getElementById("videoFrame").src = d.video.youtubeEmbedUrl;
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

  g.addEventListener("click", (e) => {
    const btn = e.target.closest(".mThumbBtn");
    if (!btn) return;
    openLb(Number(btn.dataset.i));
  });

  lbClose.addEventListener("click", closeLb);

  lb.addEventListener("click", (e) => {
    if (e.target === lb) closeLb();
  });

  // Teclado: ESC cierra, flechas navegan
  window.addEventListener("keydown", (e) => {
    if (lb.hidden) return;

    if (e.key === "Escape") closeLb();
    if (e.key === "ArrowRight") openLb((current + 1) % gallery.length);
    if (e.key === "ArrowLeft") openLb((current - 1 + gallery.length) % gallery.length);
  });
}

loadMemorial();
