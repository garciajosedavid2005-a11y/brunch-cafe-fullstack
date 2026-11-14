import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// 3.6 · «Lo que dicen nuestros clientes»: un solo guion antes del nombre, cita con comilla tipográfica
// grande y el enlace con el bordó de la marca (también con el puntero y el foco, que Foundation pintaba azul)
vi.mock("../../services/api", () => ({
  apiRequest: vi.fn(() => Promise.resolve({
    reviews: [{ _id: "r1", nombre: "Emperatriz Gonzalez", comentario: "Todo delicioso.", calificacion: 5, tipo: "general" }],
  })),
}));

import Testimonios from "./Testimonios";

const css = readFileSync(join(import.meta.dirname, "Testimonios.css"), "utf8").replace(/\r\n/g, "\n");
const bloque = (selector) => css.match(new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";

describe("Testimonios (3.6)", () => {
  it("el nombre no lleva guion en el texto (lo pone el CSS una sola vez) y la cita no repite comillas", async () => {
    render(<MemoryRouter><Testimonios /></MemoryRouter>);
    const nombre = await screen.findByText("Emperatriz Gonzalez");
    expect(nombre.tagName).toBe("CITE");
    expect(nombre.textContent).toBe("Emperatriz Gonzalez");
    expect(screen.getByText("Todo delicioso.").textContent).toBe("Todo delicioso.");
    // Foundation añade «— » a todo <cite>: el propio ::before lo reemplaza (un solo guion)
    expect(bloque(".testimonios__nombre::before")).toMatch(/content:\s*"— "/);
  });

  it("comilla tipográfica grande en la tipografía de títulos y la cita en esa misma tipografía", () => {
    const comilla = bloque(".testimonios__blockquote::before");
    expect(comilla).toMatch(/content:\s*"“"/);
    expect(comilla).toMatch(/--fuente-titulos/);
    expect(bloque(".testimonios__comentario")).toMatch(/font-family:\s*var\(--fuente-titulos\)/);
  });

  it("«Leer todos los comentarios» en bordó en reposo, hover y foco", async () => {
    render(<MemoryRouter><Testimonios /></MemoryRouter>);
    expect(await screen.findByRole("link", { name: "Leer todos los comentarios" })).toHaveClass("testimonios__enlace");
    expect(bloque(".testimonios__enlace,\n.testimonios__enlace:visited")).toMatch(/color:\s*var\(--color-primario\)/);
    expect(bloque(".testimonios__enlace:hover,\n.testimonios__enlace:focus")).toMatch(/color:\s*#6e0519/);
  });
});
