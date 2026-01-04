import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  getDocs,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { firebaseConfig } from "../assets/js/firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const memorialId = "Camilo-Fuentes";

const roleInfo = document.getElementById("roleInfo");
const usersSection = document.getElementById("usersSection");
const usersList = document.getElementById("usersList");
const commentsSection = document.getElementById("commentsSection");
const commentsList = document.getElementById("commentsList");

onAuthStateChanged(auth, async (user) => {
  if (!user){
    roleInfo.textContent = "Debes iniciar sesión.";
    return;
  }

  const uid = user.uid;

  const isAdmin =
    (await getDoc(doc(db, "admins", uid))).exists() ||
    (await getDoc(doc(db, "memorials", memorialId, "admin", uid))).exists();

  const isMod =
    (await getDoc(doc(db, "memorials", memorialId, "mods", uid))).exists();

  if (!isAdmin && !isMod){
    roleInfo.textContent = "No tienes permisos para ver este panel.";
    return;
  }

  roleInfo.textContent = isAdmin ? "Rol: ADMIN" : "Rol: MODERADOR";

  usersSection.hidden = false;
  commentsSection.hidden = false;

  if (isAdmin){
    loadUsers();
  }

  loadComments();
});

async function loadUsers(){
  usersList.innerHTML = "";

  const snap = await getDocs(collection(db, "memorials", memorialId, "mods"));

  snap.forEach(docu => {
    const li = document.createElement("li");
    li.textContent = `Moderador UID: ${docu.id}`;
    usersList.appendChild(li);
  });
}

async function loadComments(){
  commentsList.innerHTML = "";

  const photosSnap = await getDocs(
    collection(db, "memorials", memorialId, "photos")
  );

  for (const photo of photosSnap.docs){
    const commentsSnap = await getDocs(
      collection(db, "memorials", memorialId, "photos", photo.id, "comments")
    );

    commentsSnap.forEach(c => {
      const d = c.data();
      const div = document.createElement("div");
      div.innerHTML = `
        <p><strong>${d.name}</strong>: ${d.text}</p>
        <button data-photo="${photo.id}" data-comment="${c.id}">
          Ocultar
        </button>
      `;

      div.querySelector("button").onclick = async () => {
        await updateDoc(
          doc(db, "memorials", memorialId, "photos", photo.id, "comments", c.id),
          { hidden: true }
        );
        div.style.opacity = "0.4";
      };

      commentsList.appendChild(div);
    });
  }
}
