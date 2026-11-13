import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const state = vi.hoisted(() => ({
  user: {
    nombre: "Ana",
    role: "mesero",
    roleLabel: "Mesero",
    permisos: ["pedido:ver", "pedido:cambiar_estado", "reserva:ver", "reserva:crear"],
  },
  apiRequest: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("../../context/useAuth", () => ({
  useAuth: () => ({ user: state.user, logout: state.logout }),
}));

vi.mock("../../services/api", () => ({
  apiRequest: state.apiRequest,
}));

import StaffDashboard from "./StaffDashboard";
import { DialogoProvider } from "../../context/DialogoContext";

describe("Panel de mesero", () => {
  beforeEach(() => {
    state.user = {
      nombre: "Ana",
      role: "mesero",
      roleLabel: "Mesero",
      permisos: ["pedido:ver", "pedido:cambiar_estado", "reserva:ver", "reserva:crear"],
    };
    state.apiRequest.mockReset();
    state.logout.mockReset();
    state.apiRequest.mockImplementation((path) => {
      if (path === "/v1/staff/reservas") {
        return Promise.resolve([{
          id: "res-1",
          codigo: "RES-000001",
          cliente: "Lucía Pérez",
          correo: "lucia@example.com",
          personas: 3,
          fecha: new Date().toISOString(),
          hora: "13:00",
          estado: "Pendiente",
          estadoCodigo: "pendiente",
        }]);
      }
      if (path === "/v1/staff/pedidos?limite=20") {
        return Promise.resolve([{
          id: "ped-1",
          codigo: "PED-000001",
          cliente: "Carlos Gómez",
          fecha: new Date().toISOString(),
          estado: "Pendiente",
          estadoCodigo: "pendiente",
          total: 25000,
          transiciones: [],
          items: [
            { nombre: "Huevos al gusto", cantidad: 1, precio: 18000, subtotal: 18000, nota: "Sin sal",
              modificadores: [{ grupo: "Término del huevo", opcion: "Fritos", precioExtra: 0 }] },
            { nombre: "Huevos al gusto", cantidad: 1, precio: 15000, subtotal: 15000, nota: "",
              modificadores: [{ grupo: "Término del huevo", opcion: "Revueltos", precioExtra: 0 }] },
          ],
        }]);
      }
      if (path === "/v1/cliente/perfil") {
        return Promise.resolve({
          perfil: {
            nombre: "Ana",
            apellido: "Pérez",
            correo: "ana@example.com",
            telefono: "3001234567",
            rol: { nombre: "mesero", etiqueta: "Mesero" },
            createdAt: new Date().toISOString(),
          },
        });
      }
      return Promise.reject(new Error(`Ruta inesperada: ${path}`));
    });
  });

  it("muestra primero el resumen con datos reales y permite entrar a las reservas y pedidos", async () => {
    render(<MemoryRouter><StaffDashboard /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: /resumen del turno/i })).toBeInTheDocument();
    expect(state.apiRequest).toHaveBeenCalledWith("/v1/staff/reservas");
    expect(state.apiRequest).toHaveBeenCalledWith("/v1/staff/pedidos?limite=20");

    const navigation = screen.getByRole("navigation", { name: /secciones del panel de personal/i });
    fireEvent.click(within(navigation).getByRole("button", { name: "Reservas" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: /reservas/i })).toBeInTheDocument());
    expect(await screen.findByText("Lucía Pérez")).toBeInTheDocument();
    fireEvent.click(within(navigation).getByRole("button", { name: "Pedidos" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: /pedidos/i })).toBeInTheDocument());
    expect(await screen.findByText("Carlos Gómez")).toBeInTheDocument();
    // 1.12 · Cada plato con sus opciones y su nota (dos líneas del mismo plato, sin claves repetidas)
    expect(screen.getByText("1 × Huevos al gusto — Término del huevo: Fritos · Nota: Sin sal")).toBeInTheDocument();
    expect(screen.getByText("1 × Huevos al gusto — Término del huevo: Revueltos")).toBeInTheDocument();

    fireEvent.click(within(navigation).getByRole("button", { name: "Mi perfil" }));
    expect(await screen.findByRole("heading", { name: "Mi perfil" })).toBeInTheDocument();
    fireEvent.click(within(navigation).getByRole("button", { name: "Seguridad" }));
    expect(await screen.findByRole("heading", { name: "Seguridad y configuración" })).toBeInTheDocument();
  });

  it("la cabecera lleva el logo de Brunch Café (2.0c) y el área «Sala»", () => {
    render(<MemoryRouter><StaffDashboard /></MemoryRouter>);
    const logo = screen.getByRole("img", { name: "Brunch Café" });
    expect(logo).toHaveTextContent("Brunch Café");
    expect(logo).toHaveClass("logo--bordo");
    expect(screen.getByText("Sala")).toBeInTheDocument();
  });

  it("oculta los módulos de reservas y pedidos si el rol no tiene esos permisos", () => {
    state.user.permisos = [];

    render(<MemoryRouter><StaffDashboard /></MemoryRouter>);

    expect(screen.getByRole("button", { name: /resumen/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reservas/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pedidos/i })).not.toBeInTheDocument();
    expect(state.apiRequest).not.toHaveBeenCalled();
  });

  // F1-19 · El administrador entra al panel de sala para anular desde la toma de comanda
  it("el administrador ve el plano, reservas y pedidos, vuelve al admin con «Panel de administración» y no crea reservas aquí", async () => {
    state.user = { nombre: "Admin", role: "admin", roleLabel: "Administrador", permisos: ["*"] };
    const respuestaBase = state.apiRequest.getMockImplementation();
    state.apiRequest.mockImplementation((path) => (path === "/v1/staff/salon/mesas"
      ? Promise.resolve({ actualizadoEn: new Date().toISOString(), zonas: [], mesas: [] })
      : respuestaBase(path)));

    render(<MemoryRouter><StaffDashboard /></MemoryRouter>);

    const navigation = screen.getByRole("navigation", { name: /secciones del panel de personal/i });
    expect(within(navigation).getByRole("button", { name: "Mesas" })).toHaveAttribute("aria-current", "page");
    expect(within(navigation).getByRole("button", { name: "Reservas" })).toBeInTheDocument();
    expect(within(navigation).getByRole("button", { name: "Pedidos" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Panel de administración" })).toHaveAttribute("href", "/admin");
    expect(screen.queryByRole("button", { name: "Nueva reserva" })).not.toBeInTheDocument();
    await waitFor(() => expect(state.apiRequest).toHaveBeenCalledWith("/v1/staff/salon/mesas"));
  });

  // 1.9 · «Cuentas abiertas» (salón + domicilio) con cuenta:ver o pedido:ver
  it("la pestaña «Cuentas» aparece con pedido:ver o cuenta:ver y muestra la vista unificada", async () => {
    const respuestaBase = state.apiRequest.getMockImplementation();
    state.apiRequest.mockImplementation((path) => (path === "/v1/staff/cuentas-abiertas"
      ? Promise.resolve({ actualizadoEn: new Date().toISOString(), canales: { salon: false, domicilio: true }, truncado: false, cuentas: [] })
      : respuestaBase(path)));
    const { container } = render(<MemoryRouter><StaffDashboard /></MemoryRouter>);
    const navigation = screen.getByRole("navigation", { name: /secciones del panel de personal/i });
    fireEvent.click(within(navigation).getByRole("button", { name: "Cuentas" }));
    expect(await screen.findByRole("heading", { name: "Cuentas abiertas" })).toBeInTheDocument();
    expect(await screen.findByText("No hay cuentas abiertas.")).toBeInTheDocument();
    // Como el plano, ocupa todo el ancho: sin la caja de contenido de las otras secciones (quedaba vacía)
    expect(container.querySelector(".customer-dashboard__content")).toBeNull();
  });

  it("sin cuenta:ver ni pedido:ver no hay pestaña «Cuentas»", () => {
    state.user.permisos = ["reserva:ver"];
    render(<MemoryRouter><StaffDashboard /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: "Cuentas" })).not.toBeInTheDocument();
  });

  it("el personal no ve el enlace al panel de administración", () => {
    render(<MemoryRouter><StaffDashboard /></MemoryRouter>);
    expect(screen.queryByRole("link", { name: "Panel de administración" })).not.toBeInTheDocument();
  });

  it("en la agenda indica quién registró la reserva (0.15e)", async () => {
    const original = state.apiRequest.getMockImplementation();
    state.apiRequest.mockImplementation((path) => path === "/v1/staff/reservas"
      ? Promise.resolve([{ id: "res-2", codigo: "RES-000002", cliente: "Laura Ruiz", correo: "", telefono: "3209876543", personas: 2,
          fecha: new Date().toISOString(), hora: "10:00", estado: "Pendiente", estadoCodigo: "pendiente", registradaPor: { id: "m1", nombre: "Mario Mesa" } }])
      : original(path));
    render(<MemoryRouter><StaffDashboard /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /^reservas$/i }));
    expect(await screen.findByText("Registrada por Mario Mesa")).toBeInTheDocument();
    expect(screen.getByText(/3209876543/)).toBeInTheDocument();
  });

  it("cada estado usa el color de su tipo, como en el admin, y los totales en COP (0.15f)", async () => {
    const original = state.apiRequest.getMockImplementation();
    const pedido = (id, estado, estadoCodigo) => ({ id, codigo: id, cliente: `Cliente ${id}`, fecha: new Date().toISOString(), estado, estadoCodigo, total: 1250000, transiciones: [] });
    state.apiRequest.mockImplementation((path) => path === "/v1/staff/pedidos?limite=20"
      ? Promise.resolve([pedido("PED-1", "Cancelado", "cancelado"), pedido("PED-2", "Listo", "listo"), pedido("PED-3", "En camino", "en_camino")])
      : original(path));
    render(<MemoryRouter><StaffDashboard /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /^pedidos$/i }));
    expect(await screen.findByText("Cancelado")).toHaveClass("staff-dashboard__status--danger");
    expect(screen.getByText("Listo")).toHaveClass("staff-dashboard__status--success");
    expect(screen.getByText("En camino")).toHaveClass("staff-dashboard__status--info");
    expect(screen.getAllByText(/\$\s1\.250\.000/)).toHaveLength(3);
  });

  it("«Cambiar de usuario» está a la vista, cierra la sesión y lleva al login sin volver a /staff (1.1, F1-10)", async () => {
    state.logout.mockResolvedValue();
    let destino = null;
    function Destino() {
      destino = useLocation();
      return <p>Pantalla de login</p>;
    }
    render(
      <MemoryRouter initialEntries={["/staff"]}>
        <Routes>
          <Route path="/staff" element={<StaffDashboard />} />
          <Route path="/login" element={<Destino />} />
        </Routes>
      </MemoryRouter>,
    );

    const boton = screen.getByRole("button", { name: "Cambiar de usuario" });
    expect(screen.queryByRole("button", { name: "Cerrar sesión" })).not.toBeInTheDocument();
    fireEvent.click(boton);

    expect(await screen.findByText("Pantalla de login")).toBeInTheDocument();
    expect(state.logout).toHaveBeenCalledWith({ aviso: "La sesión anterior se cerró. Ingresa con tu usuario." });
    // Sin «from»: el siguiente usuario entra a su propio inicio
    expect(destino.pathname).toBe("/login");
    expect(destino.state).toBeNull();
  });

  it("si el cierre de sesión falla, se queda en el panel y lo avisa", async () => {
    state.logout.mockRejectedValue(new Error("No se pudo conectar con el servidor"));
    render(<MemoryRouter><StaffDashboard /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Cambiar de usuario" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo conectar con el servidor");
  });
  it("2.6 · el aviso «Listo para servir» abre la cuenta de la mesa desde cualquier pestaña; el sonido empieza apagado", async () => {
    globalThis.AudioContext = class { state = "suspended"; resume() { return Promise.resolve(); } close() {} };
    localStorage.removeItem("staff.sonido");
    state.user = { id: "u1", nombre: "Ana", role: "mesero", roleLabel: "Mesero", permisos: ["mesa:ver", "cuenta:ver", "item:servir"] };
    const cuenta = { id: "c1", codigo: "C-000001", estado: "abierta", comensales: 2, mesero: { id: "u1", nombre: "Ana P." },
      abiertaEn: "2026-11-10T12:00:00Z", minutosOcupada: 5, total: 9000, pendiente: 0, mesas: [{ id: "m1", numero: 1 }], version: 1, listosParaServir: 1 };
    state.apiRequest.mockImplementation((path) => {
      if (path === "/v1/staff/salon/mesas") {
        return Promise.resolve({ actualizadoEn: "2026-11-10T12:05:00Z", zonas: [{ id: "z1", nombre: "Interior", orden: 1 }],
          mesas: [{ id: "m1", numero: 1, nombre: "", zona: { id: "z1", nombre: "Interior" }, capacidad: 4, estado: "ocupada", combinable: true, posicion: null, cuenta }] });
      }
      if (path === "/v1/staff/salon/cuentas/c1") {
        return Promise.resolve({ ...cuenta, mesero: { id: "u1", nombre: "Ana P." }, subtotal: 9000, ultimaRonda: 1, historial: [],
          mesas: [{ id: "m1", numero: 1, nombre: "", zona: { id: "z1", nombre: "Interior" } }],
          rondas: [{ id: "r1", numeroRonda: 1, estado: "enviada", enviadaEn: "2026-11-10T12:01:00Z", subtotal: 9000, items: [
            { id: "i1", productoId: "p1", nombre: "Latte", precioBase: 9000, modificadores: [], cantidad: 1, nota: "", precioUnitario: 9000,
              subtotal: 9000, estado: "listo", anulacion: null, iniciadoEn: "2026-11-10T12:02:00Z", listoEn: "2026-11-10T12:04:00Z", servidoEn: null },
          ] }] });
      }
      return Promise.reject(new Error(`Ruta inesperada: ${path}`));
    });
    try {
      render(<MemoryRouter><DialogoProvider><StaffDashboard /></DialogoProvider></MemoryRouter>);
      expect(screen.getByRole("button", { name: "Sonido" })).toHaveAttribute("aria-pressed", "false");
      const navigation = screen.getByRole("navigation", { name: /secciones del panel de personal/i });
      fireEvent.click(within(navigation).getByRole("button", { name: "Cuentas" }));
      const aviso = await screen.findByRole("status", { name: "Listo para servir" });
      fireEvent.click(within(aviso).getByRole("button", { name: "Mesa 1 (1)" }));
      expect(await screen.findByRole("heading", { name: "Mesa 1" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Servir 1 × Latte" })).toBeInTheDocument();
      // Volver a «Mesas» desde la navegación muestra el plano, no la cuenta
      fireEvent.click(within(navigation).getByRole("button", { name: "Mesas" }));
      expect(await screen.findByRole("heading", { name: "Plano de mesas" })).toBeInTheDocument();
    } finally {
      delete globalThis.AudioContext;
    }
  });
});
