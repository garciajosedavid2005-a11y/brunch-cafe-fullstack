import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import DialogoProducto from "./DialogoProducto";

// 3.7.1 · Opción por defecto: en la toma de comanda (y en el carrito, que usa este mismo diálogo) Leche y
// Tamaño aparecen ya marcados en su opción por defecto y la ronda nunca sale con esos grupos vacíos.
const opcion = (id, nombre, extra = {}) => ({ id, nombre, precioExtra: 0, disponible: true, porDefecto: false, ...extra });
const LECHE = {
  id: "gl", nombre: "Leche", obligatorio: false, min: 0, max: 1,
  opciones: [opcion("entera", "Entera", { porDefecto: true }), opcion("deslac", "Deslactosada"), opcion("almendra", "Almendra", { precioExtra: 2000 })],
};
const TAMANO = { id: "gt", nombre: "Tamaño", obligatorio: false, min: 0, max: 1, opciones: [opcion("normal", "Normal", { porDefecto: true }), opcion("grande", "Grande", { precioExtra: 3000 })] };
const EXTRAS = { id: "ge", nombre: "Extras", obligatorio: false, min: 0, max: 2, opciones: [opcion("queso", "Queso", { precioExtra: 2000 })] };
const latte = (modificadores = [LECHE, TAMANO, EXTRAS]) => ({ id: "p1", nombre: "Latte", precio: 9000, modificadores });

const pintar = (producto = latte()) => {
  const onAgregar = vi.fn(() => Promise.resolve(null));
  render(<DialogoProducto producto={producto} onAgregar={onAgregar} onCerrar={() => {}} />);
  return { onAgregar, dialogo: screen.getByRole("dialog", { name: "Latte" }) };
};

describe("DialogoProducto · opción por defecto (3.7.1)", () => {
  it("Leche → Entera y Tamaño → Normal aparecen marcadas (no se pueden dejar vacías); Extras sin marcar", () => {
    const { dialogo } = pintar();
    expect(within(dialogo).getByRole("radio", { name: "Entera" })).toBeChecked();
    expect(within(dialogo).getByRole("radio", { name: "Normal" })).toBeChecked();
    expect(within(dialogo).getByRole("checkbox", { name: /Queso/ })).not.toBeChecked();
    // No dice «opcional»: el grupo no se puede dejar vacío
    expect(within(dialogo).getByRole("group", { name: "Leche (elige 1)" })).toBeInTheDocument();
  });

  it("al agregar sin tocar nada se envían las opciones por defecto; cambiar Leche reemplaza la por defecto", async () => {
    const { dialogo, onAgregar } = pintar();
    fireEvent.click(within(dialogo).getByRole("radio", { name: /Almendra/ }));
    fireEvent.click(within(dialogo).getByRole("button", { name: /^Agregar ·/ }));
    await vi.waitFor(() => expect(onAgregar).toHaveBeenCalled());
    expect(onAgregar.mock.calls[0][0].modificadores).toEqual([
      { grupoId: "gl", opcionIds: ["almendra"] },
      { grupoId: "gt", opcionIds: ["normal"] },
    ]);
  });

  it("si la opción por defecto está agotada, queda marcada la siguiente disponible", () => {
    const agotada = { ...LECHE, opciones: LECHE.opciones.map((o) => (o.id === "entera" ? { ...o, disponible: false } : o)) };
    const { dialogo } = pintar(latte([agotada]));
    expect(within(dialogo).getByRole("radio", { name: /Entera/ })).not.toBeChecked();
    expect(within(dialogo).getByRole("radio", { name: "Deslactosada" })).toBeChecked();
  });
});
