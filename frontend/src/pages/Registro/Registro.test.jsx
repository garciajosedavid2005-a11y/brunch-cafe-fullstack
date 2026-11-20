import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DialogoProvider } from "../../context/DialogoContext";

// 6.4 (F6-8) · Registro: la casilla de la política de datos es obligatoria y viaja como aceptaDatos.
const estado = vi.hoisted(() => ({ register: vi.fn() }));
vi.mock("../../context/useAuth", () => ({ useAuth: () => ({ register: estado.register }) }));

import Registro from "./Registro";

beforeEach(() => estado.register.mockReset().mockResolvedValue({}));

const llenar = () => {
  fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: "Ana" } });
  fireEvent.change(screen.getByLabelText(/^Apellido/), { target: { value: "Ruiz" } });
  fireEvent.change(screen.getByLabelText(/^Correo/), { target: { value: "ana@example.com" } });
  fireEvent.change(screen.getByLabelText(/^Teléfono/), { target: { value: "3001234567" } });
  fireEvent.change(screen.getByLabelText(/^Contraseña/), { target: { value: "secreta123" } });
};

describe("6.4 · Registro con la política de datos", () => {
  it("sin la casilla no registra y lo dice; con ella envía aceptaDatos", async () => {
    const { container } = render(<MemoryRouter><DialogoProvider><Registro /></DialogoProvider></MemoryRouter>);
    llenar();
    fireEvent.submit(container.querySelector("form"));
    expect(await screen.findByText("Debes aceptar la política de tratamiento de datos para crear tu cuenta.")).toBeInTheDocument();
    expect(estado.register).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("checkbox", { name: /Autorizo el tratamiento de mis datos/ }));
    fireEvent.submit(container.querySelector("form"));
    await screen.findByText("¡Cuenta creada exitosamente!");
    expect(estado.register).toHaveBeenCalledWith(expect.objectContaining({ aceptaDatos: true, email: "ana@example.com" }));
    expect(screen.getByRole("link", { name: "Leer la política de tratamiento de datos" })).toHaveAttribute("href", "/politica-datos");
  });
});
