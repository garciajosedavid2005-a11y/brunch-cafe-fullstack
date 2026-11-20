import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

// 6.6 · Mis puntos: saldo, reglas y movimientos (con signo y texto, no solo color).
const estado = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("../../../services/api", () => ({ apiRequest: estado.apiRequest }));

import PuntosSection from "./PuntosSection";

const RESPUESTA = {
  saldo: 60, reglas: { pesosPorPunto: 1000, bloque: 100, valorBloque: 10000 },
  movimientos: [
    { id: "m2", tipo: "acumula", puntos: 10, saldoDespues: 60, referencia: "CI-000012", detalle: "", fecha: "2026-11-20T15:00:00Z" },
    { id: "m1", tipo: "canjea", puntos: -200, saldoDespues: 50, referencia: "CI-000012", detalle: "", fecha: "2026-11-20T15:00:00Z" },
  ],
};

beforeEach(() => estado.apiRequest.mockReset().mockResolvedValue(RESPUESTA));

describe("6.6 · Mis puntos", () => {
  it("muestra el saldo, las reglas y los movimientos", async () => {
    render(<PuntosSection />);
    expect(await screen.findByText(/^Tienes/)).toHaveTextContent("Tienes 60 puntos");
    expect(screen.getByText(/Ganas 1 punto por cada/)).toHaveTextContent("cada 100 puntos valen");
    const filas = within(screen.getByRole("table")).getAllByRole("row");
    expect(filas[1]).toHaveTextContent("Ganados · CI-000012+1060");
    expect(filas[2]).toHaveTextContent("Canjeados · CI-000012-20050");
  });

  it("sin movimientos lo dice", async () => {
    estado.apiRequest.mockResolvedValue({ ...RESPUESTA, saldo: 0, movimientos: [] });
    render(<PuntosSection />);
    expect(await screen.findByText("Aún no tienes movimientos.")).toBeInTheDocument();
  });
});
