// 2.0c · Logo nuevo: símbolo SVG (un color, currentColor) + nombre como texto HTML real, accesible como
// «Brunch Café». Aparece en el navbar (bordó sobre fondo claro, crema sobre la portada) y en /staff; el
// favicon usa el mismo trazado que el componente.
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("../../context/useAuth", () => ({ useAuth: () => ({ user: null, loading: false, logout: vi.fn() }) }));
vi.mock("../../context/useDialogo", () => ({ useDialogo: () => ({ avisar: vi.fn() }) }));
vi.mock("../../context/CarritoContext", () => ({ useCarrito: () => ({ productos: [] }) }));

import Logo from "./Logo";
import { SIMBOLO_TRAZADO, SIMBOLO_VIEWBOX } from "./simbolo";
import Navbar from "../Navbar/Navbar";
import { PortadaProvider } from "../../context/PortadaContext";
import { useMarcarPortada } from "../../context/usePortada";

const ConPortada = () => { useMarcarPortada(); return <section>Foto</section>; };
const pintarNavbar = (ruta) => render(
  <PortadaProvider>
    <MemoryRouter initialEntries={[ruta]}>
      <Navbar />
      <Routes>
        <Route path="/" element={<ConPortada />} />
        <Route path="/reservas" element={<main>Reservas</main>} />
      </Routes>
    </MemoryRouter>
  </PortadaProvider>,
);

describe("Logo (2.0c)", () => {
  it("es una imagen llamada «Brunch Café» con el símbolo en SVG y el nombre como texto real", () => {
    const { container } = render(<Logo />);
    const logo = screen.getByRole("img", { name: "Brunch Café" });
    expect(logo).toHaveTextContent("Brunch Café");
    expect(logo).toHaveTextContent("Neiva · Colombia");
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("fill", "currentColor");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("img")).toBeNull();
  });

  it("en el navbar: bordó sobre fondo claro y crema sobre la portada, enlazado al inicio", () => {
    pintarNavbar("/reservas");
    const claro = within(screen.getByRole("banner")).getByRole("img", { name: "Brunch Café" });
    expect(claro).toHaveTextContent("Brunch Café");
    expect(claro).toHaveClass("logo--bordo");
    expect(claro.closest("a")).toHaveAttribute("href", "/");
  });

  it("sobre la portada, la versión crema", () => {
    pintarNavbar("/");
    const logo = within(screen.getByRole("banner")).getByRole("img", { name: "Brunch Café" });
    expect(logo).toHaveClass("logo--crema");
  });

  it("el favicon SVG dibuja exactamente el mismo símbolo", () => {
    const favicon = readFileSync(join(import.meta.dirname, "../../../public/iconos/favicon.svg"), "utf8");
    expect(favicon).toContain(`d="${SIMBOLO_TRAZADO}"`);
    expect(favicon).toMatch(/:root\s*\{\s*color:\s*#890620/); // bordó de la marca (--color-primario)
    // Cuadrado y con el símbolo entero dentro (el contorno del favicon necesita margen)
    const [, , ancho, alto] = SIMBOLO_VIEWBOX.split(" ").map(Number);
    const [x, y, w, h] = favicon.match(/viewBox="([^"]+)"/)[1].split(" ").map(Number);
    expect(w).toBe(h);
    expect(x).toBeLessThanOrEqual(0);
    expect(x + w).toBeGreaterThanOrEqual(ancho);
    expect(y).toBeLessThanOrEqual(0);
    expect(y + h).toBeGreaterThanOrEqual(alto);
  });

  it("a 16 px el favicon cambia a la versión simplificada (y a 32 px o más, el símbolo completo)", () => {
    const favicon = readFileSync(join(import.meta.dirname, "../../../public/iconos/favicon.svg"), "utf8");
    // Dentro de un SVG usado como imagen, la media query mide el tamaño al que se dibuja el ícono
    expect(favicon).toMatch(/\.fav-simple\s*\{\s*display:\s*none/);
    expect(favicon).toMatch(/@media \(max-width: 24px\)\s*\{[^}]*\.fav-completo\s*\{\s*display:\s*none/);
    expect(favicon).toMatch(/<svg[^>]*class="fav-simple"[^>]*viewBox="0 0 16 16"/);
    // PNG de 16 px (versión simple) y de 32 px (completa) declarados en index.html
    const html = readFileSync(join(import.meta.dirname, "../../../index.html"), "utf8");
    expect(html).toContain('href="/iconos/favicon-16.png"');
    expect(html).toContain('sizes="16x16"');
    expect(html).toContain('href="/iconos/favicon-32.png"');
    for (const png of ["favicon-16.png", "favicon-32.png"]) {
      expect(existsSync(join(import.meta.dirname, "../../../public/iconos", png))).toBe(true);
    }
  });

  it("en una pestaña oscura el favicon pasa a crema, también la versión de 16 px", () => {
    const favicon = readFileSync(join(import.meta.dirname, "../../../public/iconos/favicon.svg"), "utf8");
    // El bordó #890620 sobre la pestaña oscura de Chrome (#35363a) apenas se ve: con el tema
    // oscuro del sistema el SVG cambia al marfil de la paleta (--color-primario sigue en claro)
    expect(favicon).toMatch(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{\s*color:\s*#F5EFE6/);
    // Ningún trazo lleva el color fijo: todos siguen a currentColor (completo y de 16 px)
    expect(favicon).not.toMatch(/(fill|stroke)="#890620"/);
    const completo = favicon.match(/<path class="fav-completo"[^>]*>/)[0];
    expect(completo).toContain('fill="currentColor"');
    expect(completo).toContain('stroke="currentColor"');
    const simple = favicon.slice(favicon.indexOf('class="fav-simple"'));
    expect(simple).toMatch(/<g fill="currentColor">/);
    expect(simple).toMatch(/<circle[^>]*stroke="currentColor"/);
    // Chrome se queda con el último ícono que le sirve: el SVG (que cambia de color) va tras los PNG
    const html = readFileSync(join(import.meta.dirname, "../../../index.html"), "utf8");
    const iconos = [...html.matchAll(/<link rel="icon"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
    expect(iconos.at(-1)).toBe("/iconos/favicon.svg");
  });

  it("la página se declara en español", () => {
    const html = readFileSync(join(import.meta.dirname, "../../../index.html"), "utf8");
    expect(html).toMatch(/<html lang="es">/);
  });
});
