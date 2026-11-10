import { createElement } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";

const estado = vi.hoisted(() => ({ avisar: vi.fn(), apiRequest: vi.fn() }));
vi.mock("../../context/useDialogo", () => ({ useDialogo: () => ({ avisar: estado.avisar, confirmar: vi.fn() }) }));
vi.mock("../../context/useAuth", () => ({ useAuth: () => ({ login: vi.fn(), register: vi.fn(), consumirAviso: () => "" }) }));
vi.mock("../../services/api", () => ({ apiRequest: estado.apiRequest, api: { post: estado.apiRequest } }));

import BotonGoogle, { AVISO_GOOGLE } from "./BotonGoogle";
import Login from "../../pages/Login/Login";
import Registro from "../../pages/Registro/Registro";

// 1.5b · «Continuar con Google» sin integración real: no inicia sesión ni simula nada, solo avisa.
describe("Botón «Continuar con Google»", () => {
  beforeEach(() => {
    estado.avisar.mockReset().mockResolvedValue(undefined);
    estado.apiRequest.mockReset();
  });

  it("es un botón (no un enlace ni un envío de formulario) con el logo y el texto permitido", () => {
    render(<BotonGoogle />);
    const boton = screen.getByRole("button", { name: "Continuar con Google" });
    expect(boton).toHaveAttribute("type", "button");
    expect(boton.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("al pulsarlo abre el diálogo de la app con el aviso y no llama a la API", async () => {
    render(<BotonGoogle />);
    fireEvent.click(screen.getByRole("button", { name: "Continuar con Google" }));
    await waitFor(() => expect(estado.avisar).toHaveBeenCalledTimes(1));
    expect(estado.avisar.mock.calls[0][0].mensaje).toBe(AVISO_GOOGLE);
    expect(AVISO_GOOGLE).toBe("El inicio de sesión con Google estará disponible próximamente. Por ahora usa tu correo y contraseña.");
    expect(estado.apiRequest).not.toHaveBeenCalled();
  });

  it.each([{ nombre: "login", pagina: Login }, { nombre: "registro", pagina: Registro }])("está en la página de $nombre", ({ pagina }) => {
    render(<MemoryRouter>{createElement(pagina)}</MemoryRouter>);
    expect(screen.getByRole("button", { name: "Continuar con Google" })).toBeInTheDocument();
  });

  it("mide al menos 44 px de alto (guía de objetivos táctiles)", () => {
    const css = readFileSync(join(import.meta.dirname, "BotonGoogle.css"), "utf8");
    const alto = Number(css.match(/\.boton-google\s*\{[^}]*min-height:\s*(\d+)px/)?.[1]);
    expect(alto).toBeGreaterThanOrEqual(44);
  });
});
