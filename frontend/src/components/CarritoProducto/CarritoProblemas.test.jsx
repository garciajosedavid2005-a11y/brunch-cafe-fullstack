// 1.14 · Si el servidor rechaza el pedido por una línea (opción agotada, producto agotado, nota larga…),
// el carrito marca esa línea con el motivo, como la comanda del salón; al cambiarla o quitarla se desmarca.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DialogoProvider } from "../../context/DialogoContext";
import { CarritoProvider, useCarrito } from "../../context/CarritoContext";

vi.mock("../../services/api", () => ({ apiRequest: vi.fn() }));
vi.mock("../../context/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1", nombre: "Ana", apellido: "Pérez", telefono: "300 123 4567" } }),
}));

import { apiRequest } from "../../services/api";
import { reiniciarHorarios } from "../../hooks/useHorarios";
import CarritoProducto from "./CarritoProducto";
import CarritoFormulario from "../CarritoFormulario/CarritoFormulario";

const HORARIOS = {
  domicilio: { desde: "08:00", hasta: "16:00", anticipacionMinutos: 60 },
  reservas: { entreSemana: { desde: "08:00", hasta: "19:00" }, finDeSemana: { desde: "08:00", hasta: "17:00" } },
};
const HUEVOS = { id: "h".repeat(24), nombre: "Huevos al gusto", precio: 15000, descripcion: "", imagen: "" };
const JUGO = { id: "j".repeat(24), nombre: "Jugo de naranja", precio: 7000, descripcion: "", imagen: "" };
const termino = (id, nombre) => [{ grupoId: "g1", grupo: "Término", opciones: [{ id, nombre, precioExtra: 0 }] }];

// Llena el carrito: jugo, huevos fritos y huevos pochados (líneas 0, 1 y 2)
const Llenar = () => {
  const { agregarProducto, productos } = useCarrito();
  if (!productos.length) {
    agregarProducto(JUGO);
    agregarProducto(HUEVOS, { modificadores: termino("o1", "Fritos") });
    agregarProducto(HUEVOS, { modificadores: termino("o2", "Pochados") });
  }
  return null;
};

let rechazo;
const montar = () => render(
  <MemoryRouter><DialogoProvider><CarritoProvider>
    <Llenar /><CarritoProducto /><CarritoFormulario />
  </CarritoProvider></DialogoProvider></MemoryRouter>,
);
const comprar = async () => {
  fireEvent.change(screen.getByPlaceholderText("Ej: Calle 8 # 12-34"), { target: { name: "direccion", value: "Cra 36b Oriente #30-06" } });
  fireEvent.change(screen.getByPlaceholderText("Barrio o conjunto..."), { target: { name: "barrio", value: "Centro" } });
  await within(screen.getByLabelText(/hora de entrega/i)).findByRole("option", { name: /10:00/ });
  fireEvent.change(screen.getByLabelText(/hora de entrega/i), { target: { name: "hora", value: "10:00" } });
  fireEvent.click(await screen.findByRole("button", { name: "FINALIZAR COMPRA" }));
  fireEvent.click(await screen.findByRole("button", { name: "Confirmar Pedido" }));
};
const lineas = () => screen.getAllByRole("heading", { level: 3 }).filter((h) => /Huevos|Jugo/.test(h.textContent)).map((h) => h.closest(".carrito-producto__item"));
const error = (status, code, message, details) => Object.assign(new Error(message), { status, code, details });

describe("Carrito: marca la línea que el servidor rechaza (1.14)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-05T07:30:00-05:00") });
    reiniciarHorarios();
    apiRequest.mockReset();
    apiRequest.mockImplementation((ruta) => {
      if (ruta === "/v1/horarios") return Promise.resolve({ horarios: HORARIOS });
      if (ruta === "/v1/cliente/metodos-pago") return Promise.resolve([{ id: "m1", nombre: "Contra entrega", descripcion: "" }]);
      return Promise.reject(rechazo);
    });
  });
  afterEach(() => vi.useRealTimers());

  it("una opción agotada marca solo su línea con el motivo; al quitarla, el aviso desaparece", async () => {
    rechazo = error(409, "OPCION_NO_DISPONIBLE", "«Pochados» ya no está disponible.", { linea: 2, lineas: [2], producto: "Huevos al gusto" });
    montar();
    await comprar();
    await waitFor(() => expect(lineas()[2]).toHaveClass("is-problema"));
    expect(within(lineas()[2]).getByText(/«Pochados» ya no está disponible\./)).toBeInTheDocument();
    expect(lineas()[0]).not.toHaveClass("is-problema");
    expect(lineas()[1]).not.toHaveClass("is-problema");
    // El mensaje general también lo dice y señala el carrito
    expect(screen.getAllByRole("alert").some((a) => /Revisa la línea marcada en el carrito/.test(a.textContent))).toBe(true);

    fireEvent.click(within(lineas()[2]).getByRole("button", { name: "Eliminar" }));
    expect(lineas()).toHaveLength(2);
    expect(document.querySelector(".is-problema")).toBeNull();
  });

  it("un error de validación de una línea (items.N) marca esa línea con su mensaje; sumar no la desmarca ni se puede (como la comanda)", async () => {
    rechazo = error(400, "VALIDATION_ERROR", "La nota no puede superar 140 caracteres", [{ campo: "items.1.nota", mensaje: "La nota no puede superar 140 caracteres" }]);
    montar();
    await comprar();
    await waitFor(() => expect(lineas()[1]).toHaveClass("is-problema"));
    expect(within(lineas()[1]).getByText(/La nota no puede superar 140 caracteres/)).toBeInTheDocument();
    expect(within(lineas()[1]).getByRole("button", { name: /Sumar uno de Huevos/ })).toBeDisabled();
    fireEvent.click(within(lineas()[1]).getByRole("button", { name: /Quitar uno de Huevos/ }));
    expect(lineas()[1]).toHaveClass("is-problema");
    expect(within(lineas()[0]).getByRole("button", { name: /Sumar uno de Jugo/ })).toBeEnabled();
  });

  it("un producto agotado en dos líneas marca las dos y el aviso va en plural", async () => {
    rechazo = error(409, "PRODUCT_UNAVAILABLE", "Este producto está agotado: Huevos al gusto. Quítalo del carrito para continuar.", { productos: [602], lineas: [1, 2] });
    montar();
    await comprar();
    await waitFor(() => expect(lineas()[1]).toHaveClass("is-problema"));
    expect(lineas()[2]).toHaveClass("is-problema");
    expect(screen.getAllByRole("alert").some((a) => /Revisa las líneas marcadas en el carrito/.test(a.textContent))).toBe(true);
  });

  it("un error que no es de una línea (hora) no marca ninguna", async () => {
    rechazo = error(400, "HORA_NO_DISPONIBLE", "Elige una hora de entrega disponible.", { horasDisponibles: ["11:00"] });
    montar();
    await comprar();
    await waitFor(() => expect(screen.getAllByRole("alert").some((a) => /Elige una hora de entrega disponible/.test(a.textContent))).toBe(true));
    expect(document.querySelector(".is-problema")).toBeNull();
  });
});
