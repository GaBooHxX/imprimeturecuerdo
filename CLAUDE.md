# imprimeturecuerdo — Instrucciones del proyecto

Sistema de memoriales digitales con QR para lápidas. Stack: HTML/CSS/JS vanilla + Firebase + Cloudinary.

---

## Reglas de desarrollo

- **HTML semántico** — usar `<section>`, `<article>`, `<nav>`, `<header>`, `<footer>`, `<time>`, etc. No `<div>` para todo.
- **CSS modular** — cada vista tiene su propio `.css`. Variables globales en `assets/css/vars.css` o al inicio de `memorial.css`. No estilos inline salvo casos puntuales.
- **JavaScript Vanilla** — sin frameworks (sin React, Vue, Svelte, etc.). Módulos ES nativos (`type="module"`).
- **Evitar frameworks** — ni jQuery, ni Bootstrap, ni Tailwind. Solo librerías específicas con propósito claro (Firebase SDK, Cloudinary Widget, qrcode-generator).
- **Código simple y legible** — funciones cortas con un solo propósito, nombres descriptivos, sin abstracciones innecesarias.
- **No crear archivos innecesarios** — no archivos de prueba, no duplicados, no `backup_`, no `_old`. Si algo se elimina, se elimina completamente.
- **Sin `alert()`** — usar toasts o mensajes en el DOM.

---

## Estilo visual del memorial

- **Prioridad visual:** fotos > línea de tiempo > mensajes/condolencias.
- **Paleta:** fondo muy oscuro (`#070608`), texto claro, dorado cálido (`#d8b878`) como acento. Sin colores estridentes.
- **Tipografía:** `Cormorant Garamond` (serif, elegante) para títulos y citas. `Inter` para UI y textos funcionales.
- **Diseño limpio y respetuoso** — mucho espacio, sin saturación visual, sin elementos decorativos en exceso.
- **Fotos**: galería paginada (6 por página), lightbox con comentarios, slideshow "Modo homenaje" con música suave.
- **Línea de tiempo**: vertical con línea dorada, puntos marcadores, años destacados.
- **Mensajes / libro de condolencias**: formulario simple, listado cronológico, requiere login Google.
- **Velas**: muro de velitas con dedicatoria, animación suave de llama.

---

## Referencia de diseño para placa QR (lápida)

Estilo objetivo: placa pequeña (~90×120mm), contorno elegante, QR centrado, nombre y fechas bajo el código.
Variantes de referencia:
- Placa negra con QR dorado y marco circular/corazón → para versión premium / regalo.
- Placa metálica simple con QR y texto cursivo → para impresión 3D en PETG.

El SVG generado debe ser apto para extrusión en Tinkercad / Fusion 360: solo paths vectoriales, sin texto incrustado si se puede convertir a path, contraste claro entre módulos del QR y fondo.

---

## Estructura de archivos

```
/
├── index.html                  ← redirect a memorial principal
├── memoriales/Camilo-Fuentes/  ← memorial específico (HTML + data)
├── memorial/                   ← página genérica (?m=ID)
├── admin/                      ← panel de edición (editar.html + JS)
├── assets/
│   ├── css/memorial.css        ← estilos del memorial
│   ├── js/memorial-page.js     ← lógica del memorial (galería, guestbook, velas, slideshow)
│   ├── js/memorial-mod.js      ← moderación de comentarios
│   ├── js/editar.js            ← lógica del panel admin
│   └── js/firebase-config.js  ← config Firebase + Cloudinary + ownerEmails
├── firebase/firestore.rules
└── CLAUDE.md
```

---

## Roles y acceso

- **Owner** (`ownerEmails` en `firebase-config.js`) — acceso total al panel, todos los memoriales.
- **Visitante autenticado (Google)** — puede dejar comentarios, velas y condolencias.
- **Visitante anónimo** — solo lectura.

Validación de rol siempre en Firestore Rules. El frontend es cosmético.
