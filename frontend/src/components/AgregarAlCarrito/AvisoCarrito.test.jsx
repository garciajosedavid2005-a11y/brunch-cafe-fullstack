import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const estado = vi.hoisted(() => ({ agregarProducto: vi.fn() }));
vi.mock("../../context/CarritoContext", () => ({ useCarrito: () => ({ agregarProducto: estado.agregarProducto }) }));

import { AvisoCarritoProvider, DURACION_AVISO_MS } from "./AvisoCarrito";
import { DURACION_AGREGADO_MS } from "./useAgregarAlCarrito";
import TarjetaMenu from "../TarjetaMenu/TarjetaMenu";

// 7.1 · Agregar al carrito: aviso con «Ver carrito» (región viva), «✓ Agregado» y vuelo sin movimiento reducido
const TERMINO = {
  id: "g1", nombre: "Término del huevo", obligatorio: true, min: 1, max: 1,
  opciones: [{ id: "o1", nombre: "Fritos", precioExtra: 0, disponible: true }],
};

const pintar = (props = {}) => render(
  <MemoryRouter>
    <AvisoCarritoProvider>
      <button type="button" data-carrito-destino="icono">carrito</button>
      <TarjetaMenu id="p1" codigo={1} nombre="Café americano" descripcion="Filtrado" precio={6000} imagen="" {...props} />
    </AvisoCarritoProvider>
  </MemoryRouter>,
);

// La región viva del aviso (aria-live, sin role="status": cada página tiene el suyo)
const regionAviso = () => document.querySelector(".aviso-carrito__region");

const conMovimientoReducido = (reducido) => {
  window.matchMedia = vi.fn((consulta) => ({ matches: reducido && consulta.includes("reduce"), media: consulta }));
};

describe("Agregar al carrito · aviso y animación (7.1)", () => {
  let animate;
  beforeEach(() => {
    estado.agregarProducto.mockReset();
    vi.useFakeTimers();
    animate = vi.fn(() => ({}));
    Element.prototype.animate = animate;
    // jsdom no mide: el destino y el origen necesitan un tamaño para que haya vuelo
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ left: 10, top: 10, width: 40, height: 40, right: 50, bottom: 50 });
  });
  afterEach(() => {
    vi.useRealTimers();
    delete Element.prototype.animate;
    delete window.matchMedia;
  });

  it("muestra «Café americano agregado al carrito» con «Ver carrito» en una región viva y se va solo", () => {
    conMovimientoReducido(false);
    pintar();
    const region = regionAviso();
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole("button", { name: "Agregar al carrito" }));
    expect(estado.agregarProducto).toHaveBeenCalledTimes(1);
    expect(region).toHaveTextContent("Café americano agregado al carrito");
    expect(within(region).getByRole("link", { name: "Ver carrito" })).toHaveAttribute("href", "/domicilios");

    act(() => { vi.advanceTimersByTime(DURACION_AVISO_MS); });
    expect(region).toBeEmptyDOMElement();
  });

  it("el botón dice «✓ Agregado» durante 1,5 s y vuelve a «Agregar al carrito»", () => {
    conMovimientoReducido(false);
    pintar();
    fireEvent.click(screen.getByRole("button", { name: "Agregar al carrito" }));
    const boton = screen.getByRole("button", { name: "Agregado" });
    expect(boton.querySelector("svg[aria-hidden='true']")).not.toBeNull(); // el ✓ es un ícono que no se lee
    act(() => { vi.advanceTimersByTime(DURACION_AGREGADO_MS); });
    expect(screen.getByRole("button", { name: "Agregar al carrito" })).toBeInTheDocument();
  });

  it("sin movimiento reducido la miniatura vuela al carrito; con él, solo el aviso", () => {
    conMovimientoReducido(false);
    const { unmount } = pintar();
    fireEvent.click(screen.getByRole("button", { name: "Agregar al carrito" }));
    expect(animate).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".vuelo-carrito")).not.toBeNull();
    unmount();
    // El animate falso nunca termina: se quita a mano la miniatura del primer vuelo
    document.querySelectorAll(".vuelo-carrito").forEach((el) => el.remove());

    animate.mockClear();
    conMovimientoReducido(true);
    pintar();
    fireEvent.click(screen.getByRole("button", { name: "Agregar al carrito" }));
    expect(animate).not.toHaveBeenCalled();
    expect(document.querySelector(".vuelo-carrito")).toBeNull();
    expect(regionAviso()).toHaveTextContent("Café americano agregado al carrito");
  });

  it("al terminar el vuelo rebota el carrito; con movimiento reducido no hay rebote", () => {
    conMovimientoReducido(false);
    const animaciones = [];
    Element.prototype.animate = vi.fn(function animarFalso() {
      const animacion = { el: this };
      animaciones.push(animacion);
      return animacion;
    });
    pintar();
    fireEvent.click(screen.getByRole("button", { name: "Agregar al carrito" }));
    expect(animaciones).toHaveLength(1);
    expect(animaciones[0].el).toHaveClass("vuelo-carrito");
    act(() => { animaciones[0].onfinish(); });
    expect(document.querySelector(".vuelo-carrito")).toBeNull();
    expect(animaciones).toHaveLength(2);
    expect(animaciones[1].el).toHaveAttribute("data-carrito-destino", "icono");
  });

  it("si el carrito del navbar no está a la vista, la miniatura vuela al «Ver carrito» del aviso", () => {
    conMovimientoReducido(false);
    pintar();
    // El navbar se fue con la página: el ícono queda arriba, fuera de la pantalla
    const icono = document.querySelector('[data-carrito-destino="icono"]');
    icono.getBoundingClientRect = () => ({ left: 10, top: -900, width: 40, height: 40, right: 50, bottom: -860 });
    fireEvent.click(screen.getByRole("button", { name: "Agregar al carrito" }));
    expect(animate).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(0); });
    expect(animate).toHaveBeenCalledTimes(1);
    document.querySelectorAll(".vuelo-carrito").forEach((el) => el.remove());
  });

  it("con opciones, el aviso y la animación ocurren al confirmar el diálogo, no al abrirlo", () => {
    conMovimientoReducido(false);
    pintar({ nombre: "Huevos al gusto", modificadores: [TERMINO] });
    fireEvent.click(screen.getByRole("button", { name: "Agregar al carrito" }));
    expect(regionAviso()).toBeEmptyDOMElement();
    expect(animate).not.toHaveBeenCalled();

    const dialogo = screen.getByRole("dialog", { name: "Huevos al gusto" });
    fireEvent.click(within(dialogo).getByRole("radio", { name: "Fritos" }));
    fireEvent.click(within(dialogo).getByRole("button", { name: /^Agregar al carrito ·/ }));
    expect(estado.agregarProducto).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(regionAviso()).toHaveTextContent("Huevos al gusto agregado al carrito");
    expect(animate).toHaveBeenCalledTimes(1);
  });
});
