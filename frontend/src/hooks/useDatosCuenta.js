import { useEffect, useState } from "react";
import { apiRequest } from "../services/api";
import { formatearFecha } from "../utils/fechas";

/**
 * Datos de la cuenta de la sesión (GET /v1/cliente/perfil): nombre, correo,
 * teléfono, rol y fecha de registro. Lo usan /perfil y "Seguridad y configuración".
 */
export default function useDatosCuenta() {
  const [cuenta, setCuenta] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let activo = true;
    apiRequest("/v1/cliente/perfil")
      .then(({ perfil }) => activo && setCuenta(perfil))
      .catch((e) => activo && setError(e))
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, []);

  return { cuenta, cargando, error };
}

export const etiquetaRolCuenta = (rol) => rol?.etiqueta || rol?.nombre || "";

export const fechaRegistro = (valor) => formatearFecha(valor, "long");
