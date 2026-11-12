import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

const estado = vi.hoisted(() => ({ agregarProducto: vi.fn() }));
vi.mock("../../context/CarritoContext", () => ({ useCarrito: () => ({ agregarProducto: estado.agregarProducto }) }));

import TarjetaMenu from "./TarjetaMenu";

// 1.12 · Un plato con opciones abre el mismo diálogo que la toma de comanda del salón
const TERMINO = {
  id: "g1", nombre: "Término del huevo", obligatorio: true, min: 1, max: 1,
  opciones: [{ id: "o1", nombre: "Revueltos", precioExtra: 0, disponible: true }, { id: "o2", nombre: "Fritos", precioExtra: 0, disponible: true }],
};
const EXTRAS = {
  id: "g2", nombre: "Extras", obligatorio: false, min: 0, max: 2,
  opciones: [{ id: "o3", nombre: "Tocineta", precioExtra: 3000, disponible: true }, { id: "o4", nombre: "Queso", precioExtra: 2000, disponible: false }],
};
const pintar = (extra = {}) => render(
  <TarjetaMenu id="p1" codigo={1} nombre="Huevos al gusto" descripcion="Dos huevos" precio={15000} imagen="" modificadores={[TERMINO, EXTRAS]} {...extra} />,
);

describe("TarjetaMenu · opciones del plato (1.12)", () => {
  beforeEach(() => estado.agregarProducto.mockReset());

  it("sin grupos de opciones agrega directo al carrito", () => {
    pintar({ modificadores: [] });
    fireEvent.click(screen.getByRole("button", { name: "Agregar al carrito" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(estado.agregarProducto).toHaveBeenCalledWith(expect.objectContaining({ id: "p1", precio: 15000 }));
  });

  it("con grupos abre el diálogo: obligatorio, recargo visible, agotado deshabilitado y nota", () => {
    pintar();
    fireEvent.click(screen.getByRole("button", { name: "Agregar al carrito" }));
    const dialogo = screen.getByRole("dialog", { name: "Huevos al gusto" });
    expect(within(dialogo).getByRole("group", { name: /Término del huevo.*obligatorio, elige 1/ })).toBeInTheDocument();
    expect(within(dialogo).getByText("+ $ 3.000")).toBeInTheDocument();
    expect(within(dialogo).getByRole("checkbox", { name: /Queso/ })).toBeDisabled();
    // Sin el obligatorio no se agrega
    fireEvent.click(within(dialogo).getByRole("button", { name: /^Agregar al carrito ·/ }));
    expect(within(dialogo).getByRole("alert")).toHaveTextContent("Elige una opción de Término del huevo.");
    expect(estado.agregarProducto).not.toHaveBeenCalled();

    fireEvent.click(within(dialogo).getByRole("radio", { name: "Fritos" }));
    fireEvent.click(within(dialogo).getByRole("checkbox", { name: /Tocineta/ }));
    fireEvent.change(within(dialogo).getByRole("textbox"), { target: { value: "Sin sal" } });
    // formatearCOP separa «$» del número con un espacio no separable
    const agregar = within(dialogo).getByRole("button", { name: /^Agregar al carrito · \$\s18\.000$/ });
    fireEvent.click(agregar);
    expect(estado.agregarProducto).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p1", nombre: "Huevos al gusto", precio: 15000 }),
      {
        cantidad: 1, nota: "Sin sal",
        modificadores: [
          { grupoId: "g1", grupo: "Término del huevo", opciones: [{ id: "o2", nombre: "Fritos", precioExtra: 0 }] },
          { grupoId: "g2", grupo: "Extras", opciones: [{ id: "o3", nombre: "Tocineta", precioExtra: 3000 }] },
        ],
      },
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("la cantidad del diálogo llega hasta 20 (el máximo del pedido a domicilio)", () => {
    pintar({ modificadores: [EXTRAS] });
    fireEvent.click(screen.getByRole("button", { name: "Agregar al carrito" }));
    const sumar = screen.getByRole("button", { name: "Sumar uno" });
    for (let i = 0; i < 25; i += 1) fireEvent.click(sumar);
    expect(screen.getByText("20", { selector: "output" })).toBeInTheDocument();
    expect(sumar).toBeDisabled();
  });
});
