// 3.6 · Barrido de textos de la interfaz: mayúsculas de oración (no «Mayúscula En Cada Palabra»), sin emojis
// usados como iconos (se usan los iconos de línea del sitio) y sin guiones dobles. Lee el JSX de src/ y los
// textos de src/data/*.json (el carrusel del inicio, las secciones de experiencia…).
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC = join(import.meta.dirname, "..");
const archivos = (dir, extension) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  if (statSync(p).isDirectory()) return n === "test" ? [] : archivos(p, extension);
  return extension.test(n) && !/\.test\./.test(n) ? [p] : [];
});
// ★ y ☆ (U+2605, U+2606) son las estrellas de calificación: tipografía, no emoji
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{2604}\u{2607}-\u{26FF}]/u;
// Nombres propios y siglas que sí van con mayúscula
const PROPIOS = /^(Brunch|Café|Cafe|Bogotá|Neiva|Huila|Google|Colombia|DIAN|COP|KDS|Facebook|Instagram|TikTok|TripAdvisor|Gourmet|Mesa|Mesas|CSV)$/;
// Artículos, preposiciones y posesivos: en mayúsculas de oración van en minúscula y no cuentan
const CONECTORES = /^(de|del|la|las|el|los|en|y|o|a|al|por|para|con|sin|tu|tus|su|sus|mi|mis|un|una|e|u|que|se)$/i;
// Pantallas que se corrigen en un grupo posterior (se quitan de aquí al corregirlas)
const PENDIENTES = [];

const textosJsx = (linea) => [
  ...[...linea.matchAll(/>([^<>{}]{3,80})[<{]/g)].map((m) => m[1]),
  // Cadenas en expresiones (ternarios) y plantillas (sin sus variables)
  ...[...linea.matchAll(/[?:]\s*"([^"]{3,80})"/g)].map((m) => m[1]),
  ...[...linea.matchAll(/`([^`]{3,80})`/g)].map((m) => m[1].replace(/\$\{[^}]*\}/g, "").trim()),
  ...[...linea.matchAll(/(?:label|title|titulo|etiqueta|aria-label)\s*[:=]\s*"([^"]{3,80})"/g)].map((m) => m[1]),
  ...(/^[^<>{}=;()]{3,80}$/.test(linea.trim()) ? [linea.trim()] : []),
];
const textosJson = (valor) => (typeof valor === "string" ? [valor]
  : Array.isArray(valor) ? valor.flatMap(textosJson)
    : valor && typeof valor === "object" ? Object.values(valor).flatMap(textosJson) : []);

/** «Mi Perfil», «Nuevo Rol», «Estados de Pedidos»: todas las palabras con contenido tras la primera, en mayúscula. */
const enCadaPalabra = (t) => {
  if (/^\w+: \w+,?$/.test(t)) return false; // código (objetos de iconos)
  if (/^Ej[.:]|^\d|[#@/]|\$\{|^[A-ZÁÉÍÓÚÑ0-9 ·.,:¿?¡!-]+$/.test(t)) return false; // ejemplos, direcciones, rutas, MAYÚSCULAS
  if (!/^[¿¡]?[A-ZÁÉÍÓÚÑ]/.test(t)) return false;
  const palabras = t.split(/\s+/).map((w) => w.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "")).filter((w) => w.length >= 2);
  const contenido = palabras.slice(1).filter((w) => !CONECTORES.test(w));
  return contenido.length >= 1 && contenido.every((w) => /^[A-ZÁÉÍÓÚÑ]/.test(w) && !PROPIOS.test(w));
};

const hallazgos = () => {
  const salida = { mayusculas: [], emojis: [], guiones: [] };
  const revisar = (t, lugar) => {
    if (EMOJI.test(t)) salida.emojis.push(lugar);
    if (/—\s*—/.test(t)) salida.guiones.push(lugar);
    if (enCadaPalabra(t)) salida.mayusculas.push(lugar);
  };
  for (const archivo of archivos(SRC, /\.jsx$/)) {
    const ruta = relative(SRC, archivo).split(sep).join("/");
    if (PENDIENTES.some((p) => ruta.startsWith(p))) continue;
    readFileSync(archivo, "utf8").split("\n").forEach((linea, i) => {
      if (/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(linea) || /^\s*import /.test(linea)) return;
      for (const bruto of textosJsx(linea)) revisar(bruto.trim(), `${ruta}:${i + 1} «${bruto.trim()}»`);
    });
  }
  for (const archivo of archivos(join(SRC, "data"), /\.json$/)) {
    const ruta = relative(SRC, archivo).split(sep).join("/");
    for (const t of textosJson(JSON.parse(readFileSync(archivo, "utf8")))) {
      if (/\.(png|jpe?g|webp|svg)$|^\//.test(t)) continue; // rutas de imágenes y enlaces
      revisar(t.trim(), `${ruta} «${t.trim()}»`);
    }
  }
  return salida;
};

describe("Textos de la interfaz (3.6)", () => {
  const { mayusculas, emojis, guiones } = hallazgos();
  it("títulos, botones y etiquetas en mayúsculas de oración", () => expect(mayusculas).toEqual([]));
  it("sin emojis como iconos (se usan los iconos de línea)", () => expect(emojis).toEqual([]));
  it("sin guiones dobles", () => expect(guiones).toEqual([]));
});
