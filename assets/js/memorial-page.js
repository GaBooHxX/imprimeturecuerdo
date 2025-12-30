async function loadMemorial(){
  const res = await fetch("data.json");
  const d = await res.json();

  document.title = d.name + " | Imprime tu Recuerdo";

  document.getElementById("cover").src = d.cover;
  document.getElementById("name").textContent = d.name;
  document.getElementById("dates").textContent = d.dates;
  document.getElementById("bio").textContent = d.bio;

  const g = document.getElementById("gallery");
  g.innerHTML = d.gallery.map(src =>
    `<img class="mThumb" src="${src}" loading="lazy">`
  ).join("");

  if(d.video?.youtubeEmbedUrl){
    document.getElementById("videoSection").hidden = false;
    document.getElementById("videoFrame").src = d.video.youtubeEmbedUrl;
  }

  if(d.audio?.src){
    document.getElementById("audioSection").hidden = false;
    document.getElementById("audioPlayer").src = d.audio.src;
  }
}

loadMemorial();
