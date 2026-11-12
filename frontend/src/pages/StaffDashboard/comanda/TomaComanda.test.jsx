import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DialogoProvider } from "../../../context/DialogoContext";

const estado = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("../../../services/api", () => ({ apiRequest: estado.apiRequest }));

import TomaComanda from "./TomaComanda";

// 1.7 · Toma de comanda en tablet (PLAN_FASE_1 §1.7, F1-5, F1-6, D1–D4, F1-18).
const BASE = "/v1/staff/salon";
const GRUPO_TAMANO = {
  id: "g-tam", nombre: "Tamaño", obligatorio: true, min: 1, max: 1,
  opciones: [{ id: "o-normal", nombre: "Normal", precioExtra: 0, disponible: true }, { id: "o-grande", nombre: "Grande", precioExtra: 3000, disponible: true }],
};
const GRUPO_EXTRAS = {
  id: "g-ext", nombre: "Extras", obligatorio: false, min: 0, max: 2,
  opciones: [
    { id: "o-toc", nombre: "Tocineta", precioExtra: 3000, disponible: true },
    { id: "o-agu", nombre: "Aguacate", precioExtra: 2500, disponible: true },
    { id: "o-hue", nombre: "Huevo extra", precioExtra: 2000, disponible: true },
    { id: "o-que", nombre: "Queso", precioExtra: 2500, disponible: false },
  ],
};
const CATALOGO = {
  categorias: [{ id: "cat-beb", nombre: "Bebidas" }, { id: "cat-des", nombre: "Desayunos" }],
  productos: [
    { id: "p-latte", nombre: "Latte", precio: 9000, categoriaId: "cat-beb", disponible: true, modificadores: [GRUPO_TAMANO] },
    { id: "p-jugo", nombre: "Jugo de naranja", precio: 7000, categoriaId: "cat-beb", disponible: false, modificadores: [] },
    { id: "p-agua", nombre: "Agua", precio: 4000, categoriaId: "cat-beb", disponible: true, modificadores: [] },
    { id: "p-des", nombre: "Desayuno clásico", precio: 18000, categoriaId: "cat-des", disponible: true, modificadores: [GRUPO_EXTRAS] },
  ],
};
const item = (id, nombre, extra = {}) => ({
  id, productoId: `p-${id}`, nombre, precioBase: 18000, modificadores: [], cantidad: 1, nota: "",
  precioUnitario: 18000, subtotal: 18000, estado: "enviado", anulacion: null, ...extra,
});
const CUENTA = (extra = {}) => ({
  id: "c1", codigo: "C-000001", estado: "abierta", version: 4, comensales: 2, ultimaRonda: 1,
  mesero: { id: "u1", nombre: "Ana P." }, mesas: [{ id: "m1", numero: 1, nombre: "", zona: { id: "z1", nombre: "Interior" } }],
  subtotal: 36000, pendiente: 9000, total: 36000, impuestos: null, propina: null, descuento: null,
  rondas: [
    { id: "r1", numeroRonda: 1, estado: "enviada", enviadaEn: "2026-11-11T17:00:00Z", subtotal: 36000,
      items: [item("i1", "Desayuno clásico", { cantidad: 2, subtotal: 36000, modificadores: [{ grupoId: "g-ext", grupo: "Extras", opcionId: "o-toc", opcion: "Tocineta", precioExtra: 0 }] }), item("i2", "Agua", { estado: "listo", subtotal: 0, precioUnitario: 0 })] },
    { id: "r2", numeroRonda: 2, estado: "borrador", enviadaEn: null, subtotal: 9000,
      items: [item("i3", "Latte", { estado: "borrador", precioBase: 9000, precioUnitario: 9000, subtotal: 9000, nota: "Sin azúcar",
        modificadores: [{ grupoId: "g-tam", grupo: "Tamaño", opcionId: "o-normal", opcion: "Normal", precioExtra: 0 }] })] },
  ],
  historial: [],
  ...extra,
});

const MESERO = ["mesa:ver", "mesa:operar", "cuenta:abrir", "cuenta:ver", "comanda:tomar", "comanda:enviar", "cuenta:solicitar", "cuenta:transferir"];
const ADMIN = ["*"];

let respuestas;
let onVolver;
beforeEach(() => {
  respuestas = { cuenta: CUENTA(), post: () => Promise.resolve({}) };
  onVolver = vi.fn();
  estado.apiRequest.mockReset();
  estado.apiRequest.mockImplementation((ruta, opciones = {}) => {
    if (ruta === `${BASE}/catalogo`) return Promise.resolve(CATALOGO);
    if (ruta === `${BASE}/cuentas/c1` && !opciones.method) return Promise.resolve(respuestas.cuenta);
    return respuestas.post(ruta, opciones);
  });
});

const pintar = async (permisos = MESERO) => {
  render(<DialogoProvider><TomaComanda cuentaId="c1" permisos={permisos} onVolver={onVolver} /></DialogoProvider>);
  await screen.findByRole("heading", { name: /Mesa 1/ });
  await screen.findByRole("button", { name: /^Latte/ });
};
const llamadas = (ruta, metodo) => estado.apiRequest.mock.calls.filter(([r, o = {}]) => r === ruta && (!metodo || o.method === metodo));
const cuerpo = (ruta, metodo) => JSON.parse(llamadas(ruta, metodo)[0][1].body);
const error = (status, code, message, details) => Object.assign(new Error(message), { status, code, details });
const confirmarDialogo = async (nombre, boton, rol = "dialog") => {
  const dialogo = await screen.findByRole(rol, { name: nombre });
  fireEvent.click(within(dialogo).getByRole("button", { name: boton }));
};

describe("Toma de comanda: cabecera y catálogo", () => {
  it("muestra la mesa, la cuenta y vuelve al plano", async () => {
    await pintar();
    expect(screen.getByRole("heading", { name: /Mesa 1/ })).toBeInTheDocument();
    expect(screen.getAllByText(/C-000001/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Volver al plano" }));
    expect(onVolver).toHaveBeenCalled();
  });

  it("categorías en botones; productos con precio en COP; los agotados deshabilitados y dicen «Agotado»", async () => {
    await pintar();
    const categorias = screen.getByRole("group", { name: "Categorías" });
    expect(within(categorias).getByRole("button", { name: "Bebidas" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^Latte, \$\s9\.000/ })).toBeEnabled();
    const jugo = screen.getByRole("button", { name: /^Jugo de naranja/ });
    expect(jugo).toBeDisabled();
    expect(jugo).toHaveAccessibleName(/agotado/i);
    expect(within(jugo).getByText("Agotado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Desayuno clásico/ })).not.toBeInTheDocument();
    fireEvent.click(within(categorias).getByRole("button", { name: "Desayunos" }));
    expect(screen.getByRole("button", { name: /^Desayuno clásico, \$\s18\.000/ })).toBeInTheDocument();
  });

  it("sin comanda:tomar no se ve el menú ni la ronda en curso (solo la cuenta)", async () => {
    render(<DialogoProvider><TomaComanda cuentaId="c1" permisos={["cuenta:ver"]} onVolver={onVolver} /></DialogoProvider>);
    await screen.findByRole("heading", { name: /Mesa 1/ });
    expect(screen.queryByRole("group", { name: "Categorías" })).not.toBeInTheDocument();
    expect(llamadas(`${BASE}/catalogo`)).toHaveLength(0);
    expect(screen.getByRole("region", { name: "Rondas enviadas" })).toBeInTheDocument();
  });
});

describe("Diálogo del producto: modificadores, cantidad y nota", () => {
  it("un grupo obligatorio sin elegir no deja agregar; el recargo se ve y suma al total", async () => {
    await pintar();
    fireEvent.click(screen.getByRole("button", { name: /^Latte/ }));
    const dialogo = screen.getByRole("dialog", { name: "Latte" });
    expect(within(dialogo).getByRole("group", { name: /Tamaño.*obligatorio/i })).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: /^Agregar/ }));
    expect(within(dialogo).getByRole("alert")).toHaveTextContent(/Elige.*Tamaño/);
    expect(llamadas(`${BASE}/cuentas/c1/items`, "POST")).toHaveLength(0);

    const grande = within(dialogo).getByRole("radio", { name: /Grande/ });
    expect(grande).toHaveAccessibleName(/\+ \$\s3\.000/);
    fireEvent.click(grande);
    expect(within(dialogo).getByRole("button", { name: /^Agregar/ })).toHaveTextContent(/\$\s12\.000/);
  });

  it("respeta el máximo, deshabilita las opciones agotadas y envía cantidad, modificadores, nota e Idempotency-Key", async () => {
    await pintar();
    fireEvent.click(screen.getByRole("button", { name: "Desayunos" }));
    fireEvent.click(screen.getByRole("button", { name: /^Desayuno clásico/ }));
    const dialogo = screen.getByRole("dialog", { name: "Desayuno clásico" });
    expect(within(dialogo).getByRole("checkbox", { name: /Queso/ })).toBeDisabled();
    fireEvent.click(within(dialogo).getByRole("checkbox", { name: /Tocineta/ }));
    fireEvent.click(within(dialogo).getByRole("checkbox", { name: /Aguacate/ }));
    expect(within(dialogo).getByRole("checkbox", { name: /Huevo extra/ })).toBeDisabled(); // máximo 2
    fireEvent.click(within(dialogo).getByRole("button", { name: "Sumar uno" }));
    const nota = within(dialogo).getByRole("textbox", { name: /Nota/ });
    expect(nota).toHaveAttribute("maxLength", "140");
    fireEvent.change(nota, { target: { value: "Sin cebolla" } });
    expect(within(dialogo).getByRole("button", { name: /^Agregar/ })).toHaveTextContent(/\$\s47\.000/); // (18.000 + 5.500) × 2

    fireEvent.click(within(dialogo).getByRole("button", { name: /^Agregar/ }));
    await waitFor(() => expect(llamadas(`${BASE}/cuentas/c1/items`, "POST")).toHaveLength(1));
    expect(cuerpo(`${BASE}/cuentas/c1/items`, "POST")).toEqual({
      productoId: "p-des", cantidad: 2, nota: "Sin cebolla", modificadores: [{ grupoId: "g-ext", opcionIds: ["o-toc", "o-agu"] }],
    });
    expect(llamadas(`${BASE}/cuentas/c1/items`, "POST")[0][1].headers["Idempotency-Key"]).toMatch(/^[A-Za-z0-9_-]{8,100}$/);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Desayuno clásico" })).not.toBeInTheDocument());
    expect(llamadas(`${BASE}/cuentas/c1`).length).toBeGreaterThanOrEqual(2); // recarga la cuenta
  });

  it("si el producto se agotó al agregarlo, lo dice en el diálogo y recarga el menú", async () => {
    respuestas.post = () => Promise.reject(error(409, "PRODUCT_UNAVAILABLE", "«Agua» está agotado."));
    await pintar();
    fireEvent.click(screen.getByRole("button", { name: /^Agua/ }));
    const dialogo = screen.getByRole("dialog", { name: "Agua" });
    fireEvent.click(within(dialogo).getByRole("button", { name: /^Agregar/ }));
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("«Agua» está agotado.");
    await waitFor(() => expect(llamadas(`${BASE}/catalogo`).length).toBeGreaterThanOrEqual(2));
  });
});

describe("Ronda en curso (borrador)", () => {
  it("lista los ítems con modificadores, nota, cantidad y total parcial; cambia la cantidad y quita", async () => {
    await pintar();
    const ronda = screen.getByRole("region", { name: "Ronda en curso" });
    expect(within(ronda).getByText("Latte")).toBeInTheDocument();
    expect(within(ronda).getByText(/Tamaño: Normal/)).toBeInTheDocument();
    expect(within(ronda).getByText(/Sin azúcar/)).toBeInTheDocument();
    expect(within(ronda).getByText(/Total de la ronda/).closest("p")).toHaveTextContent(/\$\s9\.000/);

    fireEvent.click(within(ronda).getByRole("button", { name: "Sumar uno de Latte" }));
    await waitFor(() => expect(llamadas(`${BASE}/cuentas/c1/items/i3`, "PATCH")).toHaveLength(1));
    expect(cuerpo(`${BASE}/cuentas/c1/items/i3`, "PATCH")).toEqual({ cantidad: 2 });

    fireEvent.click(within(ronda).getByRole("button", { name: "Quitar Latte de la ronda" }));
    await waitFor(() => expect(llamadas(`${BASE}/cuentas/c1/items/i3`, "DELETE")).toHaveLength(1));
  });

  it("enviar ronda pide confirmación y manda la versión de la cuenta con Idempotency-Key", async () => {
    await pintar();
    fireEvent.click(screen.getByRole("button", { name: "Enviar ronda 2" }));
    await confirmarDialogo("Enviar la ronda 2", "Enviar");
    const ruta = `${BASE}/cuentas/c1/rondas/2/enviar`;
    await waitFor(() => expect(llamadas(ruta, "POST")).toHaveLength(1));
    expect(cuerpo(ruta, "POST")).toEqual({ versionEsperada: 4 });
    expect(llamadas(ruta, "POST")[0][1].headers["Idempotency-Key"]).toMatch(/^[A-Za-z0-9_-]{8,100}$/);
  });

  // 1.7b · Otro mesero sumó un ítem a la misma ronda: el envío choca (409), se avisa, se recarga la
  // cuenta (versión 5) y el borrador sigue ahí, con lo suyo y lo del otro; el reintento va con la versión nueva
  it("409 CUENTA_MODIFICADA al enviar: avisa, recarga la cuenta y no pierde el borrador", async () => {
    respuestas.post = () => Promise.reject(error(409, "CUENTA_MODIFICADA", "La cuenta cambió mientras la editabas."));
    await pintar();
    const cargas = llamadas(`${BASE}/cuentas/c1`).length;
    const deOtro = item("i4", "Agua", { estado: "borrador", precioBase: 4000, precioUnitario: 4000, subtotal: 4000 });
    const vigente = CUENTA({ version: 5, pendiente: 13000 });
    vigente.rondas[1] = { ...vigente.rondas[1], subtotal: 13000, items: [...vigente.rondas[1].items, deOtro] };
    respuestas.cuenta = vigente;

    fireEvent.click(screen.getByRole("button", { name: "Enviar ronda 2" }));
    await confirmarDialogo("Enviar la ronda 2", "Enviar");
    const aviso = await screen.findByRole("dialog", { name: /La cuenta cambió/ });
    expect(aviso).toHaveTextContent(/otra persona/i);
    await waitFor(() => expect(llamadas(`${BASE}/cuentas/c1`).length).toBeGreaterThan(cargas));
    fireEvent.click(within(aviso).getByRole("button", { name: "Entendido" }));

    const ronda = screen.getByRole("region", { name: "Ronda en curso" });
    await waitFor(() => expect(within(ronda).getByText("Agua")).toBeInTheDocument());
    expect(within(ronda).getByText("Latte")).toBeInTheDocument();
    expect(within(ronda).getByText("Sin azúcar", { exact: false })).toBeInTheDocument();
    expect(llamadas(`${BASE}/cuentas/c1/items/i3`, "DELETE")).toHaveLength(0);

    respuestas.post = () => Promise.resolve({});
    fireEvent.click(screen.getByRole("button", { name: "Enviar ronda 2" }));
    await confirmarDialogo("Enviar la ronda 2", "Enviar");
    const ruta = `${BASE}/cuentas/c1/rondas/2/enviar`;
    await waitFor(() => expect(llamadas(ruta, "POST")).toHaveLength(2));
    expect(JSON.parse(llamadas(ruta, "POST")[1][1].body)).toEqual({ versionEsperada: 5 });
  });

  it("PRODUCT_UNAVAILABLE: marca los ítems afectados de la ronda", async () => {
    respuestas.post = () => Promise.reject(error(409, "PRODUCT_UNAVAILABLE", "No se envió la ronda: Latte ya no está disponible.",
      { items: [{ itemId: "i3", nombre: "Latte", motivo: "producto_agotado" }] }));
    await pintar();
    fireEvent.click(screen.getByRole("button", { name: "Enviar ronda 2" }));
    await confirmarDialogo("Enviar la ronda 2", "Enviar");
    await confirmarDialogo(/No se envió la ronda/, "Entendido", "alertdialog");
    const ronda = screen.getByRole("region", { name: "Ronda en curso" });
    const fila = within(ronda).getByText("Latte").closest("li");
    expect(fila).toHaveTextContent(/No disponible: agotado/);
    // No se puede sumar más de lo que no hay; la vista «Cuenta» avisa del problema (en vertical)
    expect(within(fila).getByRole("button", { name: "Sumar uno de Latte" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Cuenta.*con problema/ })).toBeInTheDocument();
  });

  it("sin ítems en borrador no hay botón de enviar", async () => {
    respuestas.cuenta = CUENTA({ pendiente: 0, rondas: [CUENTA().rondas[0]] });
    await pintar();
    expect(screen.queryByRole("button", { name: /^Enviar ronda/ })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Ronda en curso" })).toHaveTextContent(/Toca un producto/);
  });
});

describe("Idempotency-Key del envío", () => {
  const clavesDeEnvio = () => llamadas(`${BASE}/cuentas/c1/rondas/2/enviar`, "POST").map(([, o]) => o.headers["Idempotency-Key"]);
  const enviar = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Enviar ronda 2" }));
    await confirmarDialogo("Enviar la ronda 2", "Enviar");
  };

  it("se reutiliza si no llegó respuesta (corte de red): el reintento no envía dos veces", async () => {
    respuestas.post = () => Promise.reject(new Error("No se pudo conectar con el servidor."));
    await pintar();
    await enviar();
    await confirmarDialogo(/No se envió la ronda/, "Entendido", "alertdialog");
    await enviar();
    await waitFor(() => expect(clavesDeEnvio()).toHaveLength(2));
    expect(clavesDeEnvio()[1]).toBe(clavesDeEnvio()[0]);
  });

  it("se renueva tras una respuesta del servidor (p. ej. 409)", async () => {
    respuestas.post = () => Promise.reject(error(409, "RONDA_NO_COINCIDE", "La ronda por enviar es la 3."));
    await pintar();
    await enviar();
    await confirmarDialogo(/No se envió la ronda/, "Entendido", "alertdialog");
    await enviar();
    await waitFor(() => expect(clavesDeEnvio()).toHaveLength(2));
    expect(clavesDeEnvio()[1]).not.toBe(clavesDeEnvio()[0]);
  });
});

describe("Refresco de la cuenta (polling)", () => {
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });

  it("recarga cada 15 s con la pestaña visible y no con la pestaña oculta", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await pintar();
    const cargas = () => llamadas(`${BASE}/cuentas/c1`).filter(([, o = {}]) => !o.method).length;
    const inicial = cargas();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_500); });
    expect(cargas()).toBe(inicial + 1);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    await act(async () => { await vi.advanceTimersByTimeAsync(31_000); });
    expect(cargas()).toBe(inicial + 1);
  });

  // 1.7b · Como el plano: también al volver a la pestaña, al enfocar la ventana y al recuperar la red
  it("recarga al volver a la pestaña, al enfocar la ventana y al recuperar la conexión", async () => {
    await pintar();
    const cargas = () => llamadas(`${BASE}/cuentas/c1`).filter(([, o = {}]) => !o.method).length;
    const inicial = cargas();
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    await waitFor(() => expect(cargas()).toBe(inicial + 1));
    act(() => { window.dispatchEvent(new Event("focus")); });
    await waitFor(() => expect(cargas()).toBe(inicial + 2));
    act(() => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(cargas()).toBe(inicial + 3));
  });
});

describe("Rondas enviadas y anulación", () => {
  it("se ven en solo lectura con su estado; sin item:anular no se puede anular", async () => {
    await pintar();
    const enviadas = screen.getByRole("region", { name: "Rondas enviadas" });
    expect(within(enviadas).getByText(/Ronda 1/)).toBeInTheDocument();
    expect(within(enviadas).getByText("Desayuno clásico").closest("li")).toHaveTextContent("Enviado");
    expect(within(enviadas).getByText("Agua").closest("li")).toHaveTextContent("Listo");
    expect(within(enviadas).queryByRole("button", { name: /^Anular/ })).not.toBeInTheDocument();
    expect(within(enviadas).queryByRole("button", { name: /^Sumar/ })).not.toBeInTheDocument();
  });

  it("con item:anular: motivo del catálogo; «Otro» exige el detalle", async () => {
    await pintar(ADMIN);
    fireEvent.click(screen.getByRole("button", { name: "Anular Desayuno clásico" }));
    const dialogo = screen.getByRole("dialog", { name: "Anular Desayuno clásico" });
    for (const motivo of ["Error de toma", "El cliente cambió el pedido", "Producto defectuoso", "Demora", "Otro"]) {
      expect(within(dialogo).getByRole("radio", { name: motivo })).toBeInTheDocument();
    }
    fireEvent.click(within(dialogo).getByRole("radio", { name: "Otro" }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Anular ítem" }));
    expect(within(dialogo).getByRole("alert")).toHaveTextContent(/Describe el motivo/);
    fireEvent.change(within(dialogo).getByRole("textbox", { name: /Detalle/ }), { target: { value: "Se cayó al servir" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Anular ítem" }));
    const ruta = `${BASE}/cuentas/c1/items/i1/anular`;
    await waitFor(() => expect(llamadas(ruta, "POST")).toHaveLength(1));
    expect(cuerpo(ruta, "POST")).toEqual({ motivo: "otro", detalle: "Se cayó al servir", versionEsperada: 4 });
  });

  it("un ítem anulado se ve tachado con su motivo y no suma", async () => {
    const cuenta = CUENTA();
    cuenta.rondas[0].items[0] = item("i1", "Desayuno clásico", { estado: "anulado", anulacion: { motivo: "demora", detalle: "" } });
    respuestas.cuenta = cuenta;
    await pintar(ADMIN);
    const fila = within(screen.getByRole("region", { name: "Rondas enviadas" })).getByText("Desayuno clásico").closest("li");
    expect(fila).toHaveTextContent(/Anulado · Demora/);
    expect(within(fila).queryByRole("button", { name: /^Anular/ })).not.toBeInTheDocument();
  });
});

describe("Cuenta: subtotal, solicitar y cancelar", () => {
  it("muestra el subtotal sin impuestos ni propina", async () => {
    await pintar();
    const resumen = screen.getByRole("region", { name: "Resumen de la cuenta" });
    expect(within(resumen).getByText("Subtotal").closest("div")).toHaveTextContent(/\$\s36\.000/);
    expect(resumen).toHaveTextContent(/sin impuestos ni propina/i);
    expect(resumen).not.toHaveTextContent(/IVA|propina:\s*\$/i);
  });

  it("solicitar la cuenta: confirmación y versión; los 409 muestran el mensaje del servidor", async () => {
    respuestas.post = () => Promise.reject(error(409, "RONDA_PENDIENTE", "Hay ítems sin enviar: envíalos o quítalos antes de pedir la cuenta."));
    await pintar();
    fireEvent.click(screen.getByRole("button", { name: "Solicitar cuenta" }));
    await confirmarDialogo("Solicitar la cuenta", "Solicitar");
    await waitFor(() => expect(llamadas(`${BASE}/cuentas/c1/solicitar`, "POST")).toHaveLength(1));
    expect(cuerpo(`${BASE}/cuentas/c1/solicitar`, "POST")).toEqual({ versionEsperada: 4 });
    expect(await screen.findByRole("alertdialog", { name: /No se pudo solicitar/ })).toHaveTextContent("Hay ítems sin enviar");
  });

  it("CUENTA_SIN_CONSUMO: avisa y sugiere cancelar", async () => {
    respuestas.post = () => Promise.reject(error(409, "CUENTA_SIN_CONSUMO", "La cuenta no tiene ítems enviados. Si los clientes se fueron sin pedir o se abrió por error, cancela la cuenta."));
    await pintar();
    fireEvent.click(screen.getByRole("button", { name: "Solicitar cuenta" }));
    await confirmarDialogo("Solicitar la cuenta", "Solicitar");
    expect(await screen.findByRole("alertdialog", { name: /No se pudo solicitar/ })).toHaveTextContent(/cancela la cuenta/);
  });

  it("con ítems enviados (aunque estén todos anulados) no se ofrece cancelar (D4, F1-18)", async () => {
    await pintar();
    expect(screen.queryByRole("button", { name: "Cancelar cuenta" })).not.toBeInTheDocument();
    const cuenta = CUENTA({ subtotal: 0 });
    cuenta.rondas[0].items = cuenta.rondas[0].items.map((i) => ({ ...i, estado: "anulado", anulacion: { motivo: "demora", detalle: "" } }));
    respuestas.cuenta = cuenta;
    fireEvent.click(screen.getByRole("button", { name: "Actualizar la cuenta" }));
    await waitFor(() => expect(screen.getAllByText(/Anulado · Demora/)).toHaveLength(2));
    expect(screen.queryByRole("button", { name: "Cancelar cuenta" })).not.toBeInTheDocument();
  });

  it("si otra persona canceló la cuenta, el estado se lee en español y no se ofrecen acciones", async () => {
    respuestas.cuenta = CUENTA({ estado: "cancelada" });
    render(<DialogoProvider><TomaComanda cuentaId="c1" permisos={MESERO} onVolver={onVolver} /></DialogoProvider>);
    expect(await screen.findByText("Cancelada")).toBeInTheDocument();
    expect(screen.getByText(/ya no admite cambios/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Enviar ronda|Solicitar cuenta/ })).not.toBeInTheDocument();
  });

  it("cancelar: motivo obligatorio, versión y vuelta al plano", async () => {
    respuestas.cuenta = CUENTA({ subtotal: 0, ultimaRonda: 0, rondas: [CUENTA().rondas[1]] });
    await pintar();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar cuenta" }));
    const dialogo = await screen.findByRole("dialog", { name: "Cancelar la cuenta" });
    fireEvent.change(within(dialogo).getByRole("textbox"), { target: { value: "Se fueron sin pedir" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar cuenta" }));
    await waitFor(() => expect(llamadas(`${BASE}/cuentas/c1/cancelar`, "POST")).toHaveLength(1));
    expect(cuerpo(`${BASE}/cuentas/c1/cancelar`, "POST")).toEqual({ motivo: "Se fueron sin pedir", versionEsperada: 4 });
    await waitFor(() => expect(onVolver).toHaveBeenCalled());
  });

  it("con la cuenta pedida avisa que agregar un ítem la reabre y no ofrece solicitarla otra vez", async () => {
    respuestas.cuenta = CUENTA({ estado: "cuenta_pedida", pendiente: 0, rondas: [CUENTA().rondas[0]] });
    await pintar();
    expect(screen.getByText("Cuenta pedida")).toBeInTheDocument();
    expect(screen.getByText(/agregar un ítem la vuelve a abrir/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Solicitar cuenta" })).not.toBeInTheDocument();
  });
});
