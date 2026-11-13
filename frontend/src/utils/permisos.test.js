import { describe, it, expect } from "vitest";
import { tienePermiso, esAdministrador, esPersonal, rutaInicio, puedeEntrarAStaff, puedeEntrarAKds } from "./permisos";

const usuario = (permisos, extra = {}) => ({ permisos, esPersonal: true, ...extra });

describe("permisos del usuario (0.15d)", () => {
  it("tienePermiso: clave exacta o comodín *", () => {
    expect(tienePermiso(usuario(["reserva:ver"]), "reserva:ver")).toBe(true);
    expect(tienePermiso(usuario(["reserva:ver"]), "reserva:crear")).toBe(false);
    expect(tienePermiso(usuario(["*"]), "reserva:crear")).toBe(true);
    expect(tienePermiso(null, "reserva:ver")).toBe(false);
  });

  it("rutaInicio: * → /admin; personal → /staff (aunque no tenga permisos); cliente → /cuenta", () => {
    expect(rutaInicio(usuario(["*"], { role: "gerente" }))).toBe("/admin");
    expect(rutaInicio(usuario(["reserva:ver"], { role: "caja" }))).toBe("/staff");
    expect(rutaInicio(usuario([]))).toBe("/staff");
    expect(rutaInicio(usuario([], { esPersonal: false, role: "mesero" }))).toBe("/cuenta");
    expect(esAdministrador(usuario(["*"]))).toBe(true);
    expect(esPersonal(usuario(["*"]))).toBe(false);
  });

  it("2.5 · con kds:ver y sin mesa:ver (cocina, barista) el inicio es /kds; con los dos, /staff (enlace al KDS)", () => {
    expect(rutaInicio(usuario(["kds:ver", "item:preparar"]))).toBe("/kds");
    expect(rutaInicio(usuario(["kds:ver", "mesa:ver"]))).toBe("/staff");
    expect(rutaInicio(usuario(["*"]))).toBe("/admin");
    expect(puedeEntrarAKds(usuario(["kds:ver"]))).toBe(true);
    expect(puedeEntrarAKds(usuario(["*"]))).toBe(true);
    expect(puedeEntrarAKds(usuario(["mesa:ver"]))).toBe(false);
    expect(puedeEntrarAKds(usuario(["kds:ver"], { esPersonal: false }))).toBe(false); // un cliente nunca
    expect(puedeEntrarAKds(null)).toBe(false);
  });

  it("F1-19: /staff es del personal y también del administrador (su inicio sigue siendo /admin); el cliente no entra", () => {
    expect(puedeEntrarAStaff(usuario(["comanda:tomar"]))).toBe(true);
    expect(puedeEntrarAStaff(usuario(["*"]))).toBe(true);
    expect(rutaInicio(usuario(["*"]))).toBe("/admin");
    expect(puedeEntrarAStaff(usuario([], { esPersonal: false }))).toBe(false);
    expect(puedeEntrarAStaff(null)).toBe(false);
  });
});
