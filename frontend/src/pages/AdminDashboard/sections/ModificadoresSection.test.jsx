import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { DialogoProvider } from "../../../context/DialogoContext";
import { formatearCOP } from "../../../utils/moneda";

vi.mock("../../../services/api", () => ({
  apiRequest: vi.fn(),
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

import { api } from "../../../services/api";
import ModificadoresSection from "./ModificadoresSection";

// formatearCOP usa un espacio duro (U+00A0); Testing Library compara el texto con espacios normales
const cop = (n) => formatearCOP(n).replace(/\s/g, " ");

// 1.3 · Admin › Modificadores: grupos reutilizables con sus opciones (F1-4)
const LECHE = {
  id: "g1", nombre: "Leche", obligatorio: false, min: 0, max: 1, activo: true, ejemplo: true, productos: 1,
  opciones: [
    { id: "o1", nombre: "Entera", precioExtra: 0, disponible: true },
    { id: "o2", nombre: "Almendra", precioExtra: 2000, disponible: false },
  ],
};
const HUEVO = {
  id: "g2", nombre: "Término del huevo", obligatorio: true, min: 1, max: 1, activo: false, ejemplo: false, productos: 0,
  opciones: [{ id: "o3", nombre: "Yema líquida", precioExtra: 0, disponible: true }, { id: "o4", nombre: "Bien cocido", precioExtra: 0, disponible: true }],
};

const montar = async () => {
  api.get.mockResolvedValue([LECHE, HUEVO]);
  render(<DialogoProvider><ModificadoresSection /></DialogoProvider>);
  return screen.findByRole("table", { name: "Grupos de modificadores" });
};
const filaDe = (tabla, nombre) => within(tabla).getByText(nombre).closest("tr");

describe("Admin › Modificadores", () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
  });

  it("lista los grupos con sus reglas, opciones con recargo en COP, uso y estado en texto", async () => {
    const tabla = await montar();
    const leche = filaDe(tabla, "Leche");
    expect(leche).toHaveTextContent("Opcional · hasta 1");
    expect(leche).toHaveTextContent(`Almendra (+${cop(2000)})`);
    expect(leche).toHaveTextContent("Agotada");
    expect(leche).toHaveTextContent("1 producto");
    expect(within(leche).getByText("Ejemplo")).toBeInTheDocument();
    expect(within(leche).getByText("Activo")).toBeInTheDocument();
    const huevo = filaDe(tabla, "Término del huevo");
    expect(huevo).toHaveTextContent("Obligatorio · elige 1");
    expect(within(huevo).getByText("Inactivo")).toBeInTheDocument();
  });

  it("crea un grupo: «obligatorio» ajusta el mínimo y se envían enteros", async () => {
    await montar();
    api.post.mockResolvedValue({ ...HUEVO, id: "g9", nombre: "Tamaño" });
    fireEvent.click(screen.getByRole("button", { name: "Nuevo grupo" }));
    const dialogo = screen.getByRole("dialog", { name: "Nuevo grupo" });
    fireEvent.change(within(dialogo).getByLabelText("Nombre *"), { target: { value: "Tamaño" } });
    fireEvent.change(within(dialogo).getByLabelText("Nombre de la opción 1"), { target: { value: "Normal" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Agregar opción" }));
    fireEvent.change(within(dialogo).getByLabelText("Nombre de la opción 2"), { target: { value: "Grande" } });
    fireEvent.change(within(dialogo).getByLabelText("Recargo de la opción 2 (COP)"), { target: { value: "3000" } });
    fireEvent.click(within(dialogo).getByLabelText(/^Obligatorio/));
    expect(within(dialogo).getByLabelText("Mínimo")).toHaveValue(1);
    fireEvent.click(within(dialogo).getByRole("button", { name: "Crear grupo" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/v1/admin/grupos-modificadores", {
      nombre: "Tamaño", obligatorio: true, min: 1, max: 1, activo: true,
      opciones: [
        { nombre: "Normal", precioExtra: 0, disponible: true },
        { nombre: "Grande", precioExtra: 3000, disponible: true },
      ],
    }));
  });

  it("muestra las reglas incumplidas y no deja guardar (máximo > opciones, recargo con decimales)", async () => {
    await montar();
    fireEvent.click(within(screen.getByRole("table", { name: "Grupos de modificadores" })).getByRole("button", { name: "Editar grupo Leche" }));
    const dialogo = screen.getByRole("dialog", { name: "Editar grupo" });
    fireEvent.change(within(dialogo).getByLabelText("Máximo"), { target: { value: "3" } });
    fireEvent.change(within(dialogo).getByLabelText("Recargo de la opción 2 (COP)"), { target: { value: "2000.5" } });
    expect(within(dialogo).getByText("El máximo no puede superar el número de opciones (2).")).toBeInTheDocument();
    expect(within(dialogo).getByText("Opción 2: el recargo debe ser un número entero de pesos (0 o más).")).toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    expect(api.put).not.toHaveBeenCalled();
  });

  it("un grupo nuevo dice desde el principio qué falta para poder crearlo", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo grupo" }));
    const dialogo = screen.getByRole("dialog", { name: "Nuevo grupo" });
    expect(within(dialogo).getByRole("button", { name: "Crear grupo" })).toBeDisabled();
    expect(within(dialogo).getByText("El nombre debe tener entre 2 y 40 caracteres.")).toBeInTheDocument();
  });

  it("un recargo no válido no se muestra como «Sin recargo»", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Editar grupo Leche" }));
    const dialogo = screen.getByRole("dialog", { name: "Editar grupo" });
    fireEvent.change(within(dialogo).getByLabelText("Recargo de la opción 2 (COP)"), { target: { value: "-5" } });
    expect(within(dialogo).getByText("Recargo no válido")).toBeInTheDocument();
    expect(within(dialogo).getAllByText("Sin recargo")).toHaveLength(1); // solo la opción 1 (0 pesos)
  });

  it("al editar conserva el id de cada opción y muestra el recargo formateado", async () => {
    await montar();
    api.put.mockResolvedValue(LECHE);
    fireEvent.click(screen.getByRole("button", { name: "Editar grupo Leche" }));
    const dialogo = screen.getByRole("dialog", { name: "Editar grupo" });
    expect(within(dialogo).getByText(`+${cop(2000)}`)).toBeInTheDocument();
    fireEvent.change(within(dialogo).getByLabelText("Nombre de la opción 2"), { target: { value: "Leche de almendra" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/v1/admin/grupos-modificadores/g1", {
      nombre: "Leche", obligatorio: false, min: 0, max: 1, activo: true,
      opciones: [
        { id: "o1", nombre: "Entera", precioExtra: 0 },
        { id: "o2", nombre: "Leche de almendra", precioExtra: 2000 },
      ],
    }));
  });

  // 2.7b · Si la cocina agotó o reactivó una opción con el diálogo abierto, guardar no la pisa: «Disponible»
  // solo se envía de las opciones en que el admin lo cambió (el backend lo pasa por el servicio de agotados)
  it("envía «Disponible» solo de la opción en que se cambió", async () => {
    await montar();
    api.put.mockResolvedValue(LECHE);
    fireEvent.click(screen.getByRole("button", { name: "Editar grupo Leche" }));
    const dialogo = screen.getByRole("dialog", { name: "Editar grupo" });
    fireEvent.click(within(dialogo).getByLabelText("Disponible: opción 2"));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/v1/admin/grupos-modificadores/g1", expect.objectContaining({
      opciones: [
        { id: "o1", nombre: "Entera", precioExtra: 0 },
        { id: "o2", nombre: "Almendra", precioExtra: 2000, disponible: true },
      ],
    })));
  });

  it("quitar una opción y desactivar un grupo en uso piden confirmación", async () => {
    await montar();
    api.put.mockResolvedValue({ ...LECHE, activo: false });
    fireEvent.click(screen.getByRole("button", { name: "Editar grupo Leche" }));
    const dialogo = screen.getByRole("dialog", { name: "Editar grupo" });

    fireEvent.click(within(dialogo).getByRole("button", { name: "Quitar opción 2" }));
    fireEvent.click(await screen.findByRole("button", { name: "Conservar opción" }));
    await waitFor(() => expect(within(dialogo).getByLabelText("Nombre de la opción 2")).toBeInTheDocument());

    fireEvent.click(within(dialogo).getByLabelText(/^Activo/));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByText(/dejará de ofrecerse/i)).toHaveTextContent(/lo usa 1 producto/i);
    expect(api.put).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Desactivar grupo" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/v1/admin/grupos-modificadores/g1", expect.objectContaining({ activo: false })));
  });

  it("eliminar pide confirmación; al cancelar no borra y al confirmar sí", async () => {
    await montar();
    api.delete.mockResolvedValue({});
    fireEvent.click(screen.getByRole("button", { name: "Eliminar grupo Término del huevo" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(api.delete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Eliminar grupo Término del huevo" }));
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar grupo" }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/v1/admin/grupos-modificadores/g2"));
  });
});
