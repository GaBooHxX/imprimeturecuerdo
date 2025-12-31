async function loadMemorial(){
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

  // Inyectar contenido emocional (si existe)
  injectEmotionalBlocks(d);

  // Galería con caption + lightbox
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

  // Lightbox
  const lb = document.getElementById("lightbox");
  const lbImg = document.getElementById("lbImg");
  const lbClose = document.getElementById("lbClose");

  let current = 0;

  function openLb(i){
    if (!gallery[i]?.src) return;
    current = i;
    lbImg.src = gallery[i].src;
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

  lbClose.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeLb();
  });

  lb.addEventListener("click", (e) => {
    if (e.target === lbImg) return;
    closeLb();
  });

  window.addEventListener("keydown", (e) => {
    if (lb.hidden) return;
    if (e.key === "Escape") closeLb();
    if (e.key === "ArrowRight" && gallery.length) openLb((current + 1) % gallery.length);
    if (e.key === "ArrowLeft" && gallery.length) openLb((current - 1 + gallery.length) % gallery.length);
  });
}

function injectEmotionalBlocks(d){
  // Creamos un contenedor debajo de bio (si no existe)
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
    // default text
    return `
      <section class="mSection">
        <h2>${title}</h2>
        <p class="meta">${escapeHtml(sec.content || "")}</p>
      </section>
    `;
  }).join("");

  host.innerHTML = heroHtml + quotesHtml + sectionsHtml;

  // Vela simple (local en el navegador). En Fase 2 lo haremos global con Firebase.
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

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

loadMemorial().catch(console.error);
