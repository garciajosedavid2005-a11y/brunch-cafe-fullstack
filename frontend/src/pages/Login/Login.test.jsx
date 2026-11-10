import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const auth = vi.hoisted(() => ({ avisoLogin: "" }));
vi.mock("../../context/useAuth", () => ({ useAuth: () => ({ login: vi.fn(), avisoLogin: auth.avisoLogin }) }));

import Login from "./Login";
import { DialogoProvider } from "../../context/DialogoContext";

const abrir = () => render(<MemoryRouter initialEntries={["/login"]}><DialogoProvider><Login /></DialogoProvider></MemoryRouter>);

describe("Login", () => {
  it("muestra el aviso de «Cambiar de usuario» y deja el formulario vacío con el foco en el correo (1.1, F1-10)", () => {
    auth.avisoLogin = "La sesión anterior se cerró. Ingresa con tu usuario.";
    abrir();
    expect(screen.getByRole("status")).toHaveTextContent("La sesión anterior se cerró. Ingresa con tu usuario.");
    expect(screen.getByLabelText("Correo electrónico")).toHaveValue("");
    expect(screen.getByLabelText("Correo electrónico")).toHaveFocus();
  });

  it("sin aviso no muestra nada", () => {
    auth.avisoLogin = "";
    abrir();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
