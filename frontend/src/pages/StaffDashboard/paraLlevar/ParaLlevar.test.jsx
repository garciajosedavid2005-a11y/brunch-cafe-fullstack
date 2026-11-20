import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { permisosEnCuenta } from "../../../utils/permisos";
import { origenCuenta } from "../caja/cobro";
import { TarjetaRonda } from "../../Kds/TarjetasKds";

// 6.3 (F6-3) · Pestaña «Para llevar»: abrir con nombre o teléfono (Idempotency-Key), lista en curso con lo que falta y
// la misma toma de comanda al abrir una; textos «Para llevar · nombre» en la caja y el KDS; permisos solo en la cuenta
// para llevar.
const estado = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("../../../services/api", () => ({ apiRequest: estado.apiRequest, API_URL: "http://api.test" }));
// La toma de comanda tiene sus propios tests: aquí basta saber qué cuenta abre y con qué texto de volver
vi.mock("../comanda/TomaComanda", () => ({
  default: ({ cuentaId, textoVolver, onVolver }) => (
    <div>
      <p>Comanda {cuentaId}</p>
      <button type="button" onClick={onVolver}>{textoVolver}</button>
    </div>
  ),
}));

import ParaLlevar from "./ParaLlevar";

// Nombre accesible exacto con cualquier espacio (el formato de moneda usa un espacio no separable)
const re = (texto) => new RegExp(`^${texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s")}$`);

class FakeEventSource {
  static instancias = [];
  static CLOSED = 2;
  constructor(url) { this.url = url; FakeEventSource.instancias.push(this); }
  addEventListener() {}
  close() {}
}

const CUENTA = {
  id: "p1", codigo: "C-000010", estado: "abierta", cobrada: false, nombre: "Ana", telefono: "3001234567", total: 30000, version: 3,
  abiertaEn: "2026-11-20T15:00:00Z", responsable: { nombre: "Carla C." }, enBorrador: 0, porPreparar: 1, listos: 2, entregados: 0,
};
let lista;
beforeEach(() => {
  FakeEventSource.instancias = [];
  globalThis.EventSource = FakeEventSource;
  lista = [CUENTA];
  estado.apiRequest.mockReset().mockImplementation((ruta, opciones = {}) => {
    if (ruta === "/v1/staff/salon/para-llevar" && opciones.method === "POST") return Promise.resolve({ id: "p2", canal: "para_llevar" });
    if (ruta === "/v1/staff/salon/para-llevar") return Promise.resolve({ cuentas: lista });
    return Promise.reject(new Error(`Ruta inesperada ${ruta}`));
  });
});

describe("6.3 · Pestaña Para llevar", () => {
  it("lista las cuentas en curso con su estado y lo que falta, y en vivo por el canal para_llevar", async () => {
    render(<ParaLlevar permisos={["cuenta:para_llevar"]} />);
    const tarjeta = await screen.findByRole("button", { name: re("Abrir Ana, Abierta, 2 listos para entregar, 1 en cocina, $ 30.000") });
    expect(tarjeta).toHaveTextContent("1 en cocina");
    expect(tarjeta).toHaveTextContent("2 para entregar");
    expect(tarjeta).toHaveTextContent("C-000010");
    await waitFor(() => expect(FakeEventSource.instancias.some((e) => e.url.includes("para_llevar"))).toBe(true));
  });

  it("sin nombre ni teléfono no envía nada y lo dice", async () => {
    render(<ParaLlevar permisos={["cuenta:para_llevar"]} />);
    fireEvent.click(await screen.findByRole("button", { name: /Abrir y tomar pedido/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Indica el nombre o el teléfono de quien recoge el pedido.");
    expect(estado.apiRequest.mock.calls.some(([, o]) => o?.method === "POST")).toBe(false);
  });

  it("abre con el nombre (Idempotency-Key) y pasa a la toma de comanda; «Volver a Para llevar» regresa a la lista", async () => {
    render(<ParaLlevar permisos={["cuenta:para_llevar"]} />);
    fireEvent.change(await screen.findByLabelText("Nombre"), { target: { value: "  Beto " } });
    fireEvent.click(screen.getByRole("button", { name: /Abrir y tomar pedido/ }));
    expect(await screen.findByText("Comanda p2")).toBeInTheDocument();
    const [, opciones] = estado.apiRequest.mock.calls.find(([, o]) => o?.method === "POST");
    expect(JSON.parse(opciones.body)).toEqual({ nombre: "Beto" });
    expect(opciones.headers["Idempotency-Key"]).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Volver a Para llevar" }));
    expect(await screen.findByRole("heading", { name: "Para llevar" })).toBeInTheDocument();
  });

  it("una cobrada se marca «Cobrada»; sin cuentas, el aviso de vacío", async () => {
    lista = [{ ...CUENTA, estado: "cerrada", cobrada: true, listos: 0, nombre: "", telefono: "3001234567" }];
    const { unmount } = render(<ParaLlevar permisos={["cuenta:para_llevar"]} />);
    expect(await screen.findByRole("button", { name: re("Abrir 3001234567, Cobrada, 1 en cocina, $ 30.000") })).toBeInTheDocument();
    unmount();
    lista = [];
    render(<ParaLlevar permisos={["cuenta:para_llevar"]} />);
    expect(await screen.findByText("No hay pedidos para llevar en curso.")).toBeInTheDocument();
  });
});

describe("6.3 · Textos y permisos de una cuenta para llevar", () => {
  it("cuenta:para_llevar suma tomar, enviar, pasar a caja y entregar SOLO en una para llevar", () => {
    const cajero = ["cuenta:cobrar", "cuenta:para_llevar"];
    expect(permisosEnCuenta(cajero, "salon")).toEqual(cajero);
    expect(permisosEnCuenta(cajero, "para_llevar")).toEqual(expect.arrayContaining(["comanda:tomar", "comanda:enviar", "cuenta:solicitar", "item:servir"]));
    expect(permisosEnCuenta(["cuenta:cobrar"], "para_llevar")).toEqual(["cuenta:cobrar"]);
  });

  it("caja: «Para llevar · nombre» (o el teléfono); salón: la mesa", () => {
    expect(origenCuenta({ mesas: [], paraLlevar: { nombre: "Ana", telefono: "300" } })).toBe("Para llevar · Ana");
    expect(origenCuenta({ mesas: [], paraLlevar: { nombre: "", telefono: "3001234567" } })).toBe("Para llevar · 3001234567");
    expect(origenCuenta({ mesas: [3, 4], paraLlevar: null })).toBe("Mesas 3 + 4");
  });

  it("KDS: la tarjeta de una para llevar se titula «Para llevar · nombre»", () => {
    const ronda = { comandaId: "r1", cuentaId: "p1", numeroRonda: 1, mesas: [], paraLlevar: { nombre: "Ana" }, mesero: "Carla C.", enviadaEn: new Date().toISOString(), items: [] };
    render(<TarjetaRonda ronda={ronda} minutos={2} nivel="normal" ahora={Date.now()} usuarioId="u1" puedePreparar={false} ocupado={false} onMarcarItem={() => {}} onTodoListo={() => {}} />);
    expect(screen.getByText("Para llevar · Ana")).toBeInTheDocument();
  });
});
