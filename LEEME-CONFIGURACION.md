# 💛 Guía para dejar el memorial funcionando

Hola. Esta guía está pensada para que **no necesites saber nada técnico**. Son pasos cortos
y te digo exactamente dónde hacer clic. Tómate tu tiempo.

Con estos cambios, el memorial de Camilo ahora se ve más bonito y, sobre todo, tendrás un
**panel privado para subir fotos, videos y audios arrastrando**, sin tocar código nunca más.

Hay **2 servicios gratis** que ya estaban o que usaremos:

- **Firebase** (de Google): maneja el inicio de sesión, los mensajes y las velitas. *Ya existe.*
- **Cloudinary**: guarda las fotos/videos/audios que subas. *Es gratis y no pide tarjeta.*

Solo tienes que hacer la configuración **una vez**. Después, subir contenido es arrastrar y soltar.

---

## PASO 1 · Crear la cuenta de Cloudinary (5 minutos)

1. Entra a **https://cloudinary.com/users/register_free** y crea una cuenta gratis
   (puedes usar tu Google).
2. Cuando entres, arriba/al costado verás tu **Cloud name** (un nombre corto, ej: `dxxx1234`).
   Anótalo.
3. Ahora crea el "permiso de subida":
   - Haz clic en el **engranaje ⚙️ (Settings)** → pestaña **Upload**.
   - Baja hasta **Upload presets** → **Add upload preset**.
   - En **Signing Mode** elige **Unsigned** (¡importante!).
   - Guarda (**Save**) y copia el **nombre del preset** (ej: `ml_default` o el que te muestre).

4. Abre el archivo **`assets/js/firebase-config.js`** y reemplaza los dos valores:

   ```js
   export const cloudinaryConfig = {
     cloudName: "AQUÍ-TU-CLOUD-NAME",
     uploadPreset: "AQUÍ-TU-UPLOAD-PRESET"
   };
   ```

   *(Solo cambias el texto entre comillas. Nada más.)*

---

## PASO 2 · Reglas de seguridad en Firebase (3 minutos)

Esto evita que personas extrañas modifiquen el memorial.

1. Entra a **https://console.firebase.google.com** y abre el proyecto **imprimeturecuerdo**.
2. Menú izquierdo → **Firestore Database** → pestaña **Reglas (Rules)**.
3. Borra lo que haya y **pega TODO** el contenido del archivo **`firebase/firestore.rules`**.
4. Clic en **Publicar (Publish)**.

---

## PASO 3 · Hacerte administrador (para poder editar) (3 minutos)

El panel solo deja editar a administradores. Vamos a marcarte como administrador.

**3.1 · Consigue tu identificador (UID):**
- Abre el memorial en tu navegador y haz clic en **"Continuar con Google"**.
- Más abajo aparecerá **"Tu UID:"** con un código. Cópialo.
- *(Alternativa: Firebase Console → Authentication → Users → ahí está tu UID.)*

**3.2 · Créate como admin en Firebase:**
1. Firebase Console → **Firestore Database** → pestaña **Datos (Data)**.
2. Clic en **Iniciar colección (Start collection)**.
   - Collection ID: escribe **`admins`** → Siguiente.
   - **Document ID:** pega **tu UID**.
   - Agrega un campo cualquiera, por ejemplo: campo `rol` (tipo string) = `owner`.
   - **Guardar (Save)**.

Listo: con eso ya puedes entrar al panel y editar.

---

## PASO 4 · Autorizar el inicio de sesión en tu dirección web (2 minutos)

*(Si el login con Google ya funciona en tu sitio, sáltate este paso.)*

1. Firebase Console → **Authentication** → pestaña **Settings** → **Authorized domains**.
2. Si tu sitio está en GitHub Pages, agrega tu dominio (ej: `tu-usuario.github.io`).

---

## PASO 5 · Subir los cambios a GitHub

Sube **toda la carpeta** del proyecto a tu repositorio `GaBooHxX/imprimeturecuerdo`
(como haces normalmente). Los archivos nuevos/cambiados son:

- `assets/css/memorial.css`  *(diseño más bonito)*
- `memoriales/Camilo-Fuentes/index.html`  *(tipografía elegante)*
- `assets/js/firebase-config.js`  *(datos de Cloudinary)*
- `assets/js/memorial-page.js`, `assets/js/memorial-mod.js`, `admin/admin.js`  *(memorial dinámico)*
- `admin/editar.html`, `admin/editar.css`, `assets/js/editar.js`  *(el panel nuevo)*
- `firebase/firestore.rules`  *(reglas de seguridad)*

---

## ✅ Cómo usar el panel (lo divertido)

Entra a: **`https://TU-SITIO/admin/editar.html`**

1. **Continuar con Google** (con tu cuenta admin).
2. El memorial ya viene cargado como `Camilo-Fuentes`. Clic en **Cargar**.
3. Ahora puedes:
   - **📝 Textos:** cambiar nombre, fechas, dedicatoria, historia y frases → *Guardar textos*.
   - **🖼️ Portada:** *Cambiar portada* (la foto grande de arriba).
   - **📷 Galería:** **arrastra fotos** a la zona punteada o usa *Subir fotos*.
     Puedes ponerles texto, cambiarlas de orden (↑ ↓) o eliminarlas.
   - **🎬 Video:** pega un enlace de YouTube → *Guardar video*.
   - **🎵 Audio:** *Subir audio* (su voz, una canción…).

> **La primera vez**, en la galería verás el botón **"Importar las fotos actuales"**.
> Haz clic una sola vez: pasa las 9 fotos de Camilo a tu galería editable **sin perder
> los mensajes** que ya tengan. Desde ahí las manejas todas desde el panel.

Cada cambio se ve al instante en el memorial. **No necesitas volver a tocar código.**

---

## ¿Algo no funciona?

- *"No tienes permisos de administrador"* → revisa el **Paso 3** (tu UID en `admins`).
- *Las fotos no suben* → revisa el **Paso 1** (Cloudinary y el preset en **Unsigned**).
- *El login falla* → revisa el **Paso 4** (dominio autorizado).

Con cariño. Que este espacio honre bonito su memoria. 🕯️
