import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";

// Revisión de 1.6 · Todos los campos de contraseña de la app tienen el mismo botón para mostrarla u
// ocultarla (un solo componente): 44×44 px, aria-label «Mostrar contraseña» / «Ocultar contraseña» y aria-pressed.
vi.mock("../../context/useDialogo", () => ({ useDialogo: () => ({ avisar: vi.fn(), confirmar: vi.fn() }) }));
vi.mock("../../context/useAuth", () => ({
  useAuth: () => ({ user: { nombre: "Ana" }, setUser: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn(), consumirAviso: () => "" }),
}));
vi.mock("../../services/api", () => ({
  apiRequest: vi.fn(() => Promise.resolve({ perfil: { nombre: "Ana", apellido: "P", correo: "ana@example.com", rol: { nombre: "cliente" } } })),
  api: { post: vi.fn(), get: vi.fn(), put: vi.fn() },
}));

import InputContrasena from "./InputContrasena";
import Login from "../../pages/Login/Login";
import Registro from "../../pages/Registro/Registro";
import RecuperarContrasena from "../../pages/RecuperarContrasena/RecuperarContrasena";
import SecuritySection from "../../pages/CustomerDashboard/sections/SecuritySection";
import ProfileSection from "../../pages/AdminDashboard/sections/ProfileSection";

const PANTALLAS = [
  { nombre: "Crea tu contraseña (enlace)", ruta: "/restablecer-contrasena?token=abc&tipo=crear", pagina: RecuperarContrasena, campos: 2 },
  { nombre: "Nueva contraseña (recuperación)", ruta: "/restablecer-contrasena?token=abc", pagina: RecuperarContrasena, campos: 2 },
  { nombre: "login", ruta: "/login", pagina: Login, campos: 1 },
  { nombre: "registro", ruta: "/registro", pagina: Registro, campos: 1 },
  { nombre: "Seguridad › Cambiar contraseña", ruta: "/cuenta", pagina: SecuritySection, campos: 3 },
  { nombre: "perfil del admin › Cambiar contraseña", ruta: "/admin", pagina: ProfileSection, campos: 3 },
];

const camposDeContrasena = (contenedor) => contenedor.querySelectorAll('input[type="password"]');

describe("Mostrar u ocultar la contraseña", () => {
  it.each(PANTALLAS)("$nombre: cada campo tiene su botón y cambia de visible a oculto", ({ ruta, pagina, campos }) => {
    const { container } = render(<MemoryRouter initialEntries={[ruta]}>{createElement(pagina)}</MemoryRouter>);
    const inputs = [...camposDeContrasena(container)];
    expect(inputs).toHaveLength(campos);
    const botones = screen.getAllByRole("button", { name: "Mostrar contraseña" });
    expect(botones).toHaveLength(campos);

    for (const [i, input] of inputs.entries()) {
      const boton = within(input.closest(".input-contrasena")).getByRole("button", { name: "Mostrar contraseña" });
      expect(boton).toBe(botones[i]);
      expect(boton).toHaveAttribute("type", "button"); // no envía el formulario
      expect(boton).toHaveAttribute("aria-pressed", "false");
      fireEvent.click(boton);
      expect(input).toHaveAttribute("type", "text");
      expect(boton).toHaveAccessibleName("Ocultar contraseña");
      expect(boton).toHaveAttribute("aria-pressed", "true");
      fireEvent.click(boton);
      expect(input).toHaveAttribute("type", "password");
      expect(boton).toHaveAttribute("aria-pressed", "false");
    }
  });

  // El botón no debe quedar dentro de la <label>: el nombre del campo sería «Contraseña actual Mostrar contraseña»
  it.each(PANTALLAS)("$nombre: el nombre accesible del campo es solo su etiqueta", ({ ruta, pagina }) => {
    const { container } = render(<MemoryRouter initialEntries={[ruta]}>{createElement(pagina)}</MemoryRouter>);
    for (const input of camposDeContrasena(container)) {
      expect(input.closest("label")).toBeNull();
      expect(input.labels?.length).toBeGreaterThan(0);
    }
  });

  it("cada campo se muestra por separado (mostrar la contraseña no revela la confirmación)", () => {
    render(<MemoryRouter initialEntries={["/restablecer-contrasena?token=abc"]}><RecuperarContrasena /></MemoryRouter>);
    const nueva = screen.getByLabelText("Nueva contraseña", { exact: true });
    const confirmacion = screen.getByLabelText(/confirma la nueva contraseña/i);
    fireEvent.click(within(nueva.closest(".input-contrasena")).getByRole("button"));
    expect(nueva).toHaveAttribute("type", "text");
    expect(confirmacion).toHaveAttribute("type", "password");
  });

  it("pasa los atributos al campo (id, autocompletado, límites) y la etiqueta sigue asociada", () => {
    render(<label>Clave<InputContrasena id="c" autoComplete="new-password" minLength={6} maxLength={128} value="" onChange={() => {}} /></label>);
    const input = screen.getByLabelText("Clave");
    expect(input).toHaveAttribute("id", "c");
    expect(input).toHaveAttribute("autocomplete", "new-password");
    expect(input).toHaveAttribute("minlength", "6");
    expect(input).toHaveAttribute("maxlength", "128");
  });

  it("el botón mide 44×44 px y el campo deja sitio para él (CSS)", () => {
    const css = readFileSync(join(import.meta.dirname, "InputContrasena.css"), "utf8");
    const boton = css.match(/\.input-contrasena__boton\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(boton).toMatch(/width:\s*44px/);
    expect(boton).toMatch(/height:\s*44px/);
    const campo = css.match(/\.input-contrasena__campo[^{]*\{([^}]*)\}/)?.[1] ?? "";
    expect(campo).toMatch(/padding-right:\s*(4[4-9]|[5-9]\d)px/);
    // Sin margen del campo dentro del contenedor: con el de Foundation (1rem) el botón quedaba bajo el centro
    expect(campo).toMatch(/margin-bottom:\s*0/);
  });

  // El contenedor (position: relative) se pinta sobre los iconos absolutos que van antes: necesitan z-index
  it("los iconos de la izquierda de los campos quedan por encima del campo (login y admin)", () => {
    const admin = readFileSync(join(import.meta.dirname, "../../pages/AdminDashboard/AdminDashboard.css"), "utf8");
    const auth = readFileSync(join(import.meta.dirname, "../../pages/Auth/Auth.css"), "utf8");
    expect(admin.match(/\.admin-input-icon\s*\{([^}]*)\}/)?.[1]).toMatch(/z-index:\s*[1-9]/);
    expect(auth.match(/\.auth-input-icono\s*\{([^}]*)\}/)?.[1]).toMatch(/z-index:\s*[1-9]/);
  });
});
