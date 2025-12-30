document.getElementById("year").textContent = new Date().getFullYear();

const wa = document.getElementById("wa");
const waLink = ""; // luego lo pones
if (waLink) wa.href = waLink;
else wa.style.display = "none";
