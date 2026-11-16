import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";

vi.mock("../../../services/api", () => ({
  apiRequest: vi.fn(),
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));
vi.mock("../../../utils/fechas", async (original) => ({ ...(await original()), hoyLocal: () => "2026-11-05" }));

import { api } from "../../../services/api";
import ReportesSection from "./ReportesSection";
import { aCSV } from "../../../utils/csv";

// Fase 5 · 5.6 y 5.7 · Admin › Reportes
const VENTAS = {
  rango: { desde: "2026-10-30", hasta: "2026-11-05" },
  resumen: { ventas: 45000, tickets: 2, cuentas: 2, pedidos: 0, ticketPromedio: 22500, propinas: 3000, notasCredito: 0, comprobantes: 2 },
  porDia: [{ fecha: "2026-11-05", salon: 45000, domicilio: 0, paraLlevar: 0, total: 45000, tickets: 2 }],
  porFranja: [{ hora: 7, franja: "07:00–08:00", ventas: 45000, tickets: 2 }],
  porProducto: [{ id: "p1", nombre: "Huevos pericos", categoria: "Desayunos", cantidad: 3, ventas: 45000 }],
  porCategoria: [{ categoria: "Desayunos", cantidad: 3, ventas: 45000 }],
  porCanal: [{ canal: "salon", etiqueta: "Salón", ventas: 45000, tickets: 2, disponible: true }, { canal: "para_llevar", etiqueta: "Para llevar", ventas: 0, tickets: 0, disponible: false }],
  porMesero: [{ id: "u1", mesero: "Mesero P.", cuentas: 2, ventas: 45000, propinas: 3000, ticketPromedio: 22500 }],
  porMetodo: [{ metodo: "efectivo", pagos: 1, cobrado: 33000, devuelto: 0, neto: 33000 }],
};
const OPERACION = {
  rango: VENTAS.rango,
  rotacion: [{ mesa: 1, nombre: "", zona: "Interior", cuentas: 1, cuentasPorDia: 0.14, ocupacionMediaMin: 52.5 }],
  tiempos: [{ codigo: "cocina", estacion: "Cocina", items: 1, espera: { mediana: 12, p90: 12 }, preparacion: { mediana: 8, p90: 8 } }],
  margenes: [{ id: "p1", nombre: "Huevos pericos", cantidad: 2, ventas: 30000, costo: 2400, margen: 27600, margenPct: 92, conReceta: true }],
  totalesMargen: { ventas: 30000, costo: 2400, margen: 27600, margenPct: 92 },
};

describe("Admin › Reportes", () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
    api.get.mockImplementation((ruta) => Promise.resolve(ruta.includes("/ventas") ? VENTAS : OPERACION));
  });

  it("consulta los últimos 7 días de Bogotá y muestra resumen, gráfico y tablas", async () => {
    render(<ReportesSection />);
    expect(await screen.findByRole("table", { name: "Ventas por día" })).toBeInTheDocument();
    expect(screen.getByText("Ticket promedio", { selector: ".reportes-kpi span" }).nextElementSibling).toHaveTextContent("$ 22.500");
    expect(api.get).toHaveBeenCalledWith("/v1/admin/reportes/ventas?desde=2026-10-30&hasta=2026-11-05");
    expect(screen.getByRole("list", { name: "Ventas por franja horaria" })).toHaveTextContent("07:00–08:00");
    expect(within(screen.getByRole("table", { name: "Ventas por mesero" })).getByText("Mesero P.").closest("tr")).toHaveTextContent("$ 3.000");
    expect(screen.getByRole("table", { name: "Ventas por canal" })).toHaveTextContent("Para llevar (aún no existe)");
  });

  it("atajo «Hoy» y pestaña de operación con mediana, p90 y margen", async () => {
    render(<ReportesSection />);
    await screen.findByRole("table", { name: "Ventas por día" });
    fireEvent.click(screen.getByRole("button", { name: "Hoy" }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/v1/admin/reportes/operacion?desde=2026-11-05&hasta=2026-11-05"));
    fireEvent.click(screen.getByRole("button", { name: "Operación y márgenes" }));
    const tiempos = await screen.findByRole("table", { name: "Tiempos de preparación por estación" });
    expect(within(tiempos).getByText("Cocina").closest("tr")).toHaveTextContent("12 min");
    expect(screen.getByRole("table", { name: "Costo frente a venta por producto" })).toHaveTextContent("92 %");
  });

  it("el CSV usa «;», entrecomilla lo que lo necesita y deja los números sin formato", () => {
    const csv = aCSV([{ titulo: "Producto", valor: (f) => f.n }, { titulo: "Ventas", valor: (f) => f.v }], [{ n: "Café; grande", v: 12500 }, { n: 'Té "frío"', v: 4.5 }]);
    expect(csv).toBe('Producto;Ventas\r\n"Café; grande";12500\r\n"Té ""frío""";4.5');
  });
});
