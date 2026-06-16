// assets/js/firebase-config.js
export const firebaseConfig = {
  apiKey: "AIzaSyBYCf3adJckWwR0IQlQsU-rzBya2rta89Q",
  authDomain: "imprimeturecuerdo.firebaseapp.com",
  projectId: "imprimeturecuerdo",
  storageBucket: "imprimeturecuerdo.firebasestorage.app",
  messagingSenderId: "960020060014",
  appId: "1:960020060014:web:41385e1a91a62cb921137f"
};

/* ============================================================
   Cloudinary — para subir fotos, videos y audios (gratis).
   Reemplaza los DOS valores de abajo con los de tu cuenta:
   1) cloudName: aparece en Cloudinary → Settings → "Cloud name".
   2) uploadPreset: créalo en Settings → Upload → "Add upload preset",
      con "Signing Mode" = Unsigned, y copia aquí su nombre.
   (Está todo explicado paso a paso en LEEME-CONFIGURACION.md)
   ============================================================ */
export const cloudinaryConfig = {
  cloudName: "dlt6g7azz",
  uploadPreset: "ml_default"
};

/* ============================================================
   Dueños / administradores principales (por correo de Google).
   Quien inicie sesión con uno de estos correos es ADMINISTRADOR
   automáticamente: puede subir fotos y editar TODOS los memoriales,
   sin tocar la base de datos ni buscar "UID".
   Para sumar otro familiar como administrador, agrega su correo
   de Google a esta lista (y vuelve a publicar las reglas).
   ============================================================ */
export const ownerEmails = [
  "gabriel.amadorf@gmail.com"
];
