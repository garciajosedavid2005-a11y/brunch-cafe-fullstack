import { useCallback, useEffect, useState } from "react";
import { adminApi } from "../../../services/adminApi";
import { useDialogo } from "../../../context/useDialogo";

export default function useAdminResource(ruta) {
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const { avisar } = useDialogo();

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");

    try {
      const datos = await adminApi.get(ruta);
      setItems(datos);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [ruta]);

  useEffect(() => {
    let active = true;
    adminApi.get(ruta)
      .then((datos) => {
        if (active) setItems(datos);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setCargando(false);
      });

    return () => {
      active = false;
    };
  }, [ruta]);

  // Ejecuta una acción; si falla muestra el mensaje del backend en un diálogo y devuelve null
  const ejecutar = async (accion) => {
    setGuardando(true);
    try {
      return await accion();
    } catch (e) {
      await avisar({ tipo: "error", titulo: "No se pudo completar la acción", mensaje: e.message });
      return null;
    } finally {
      setGuardando(false);
    }
  };

  const crear = (datos) =>
    ejecutar(async () => {
      const nuevo = await adminApi.post(ruta, datos);
      setItems((prev) => [...prev, nuevo]);
      return nuevo;
    });

  const actualizar = (id, datos) =>
    ejecutar(async () => {
      const actualizado = await adminApi.put(`${ruta}/${id}`, datos);
      setItems((prev) => prev.map((item) => (item.id === id ? actualizado : item)));
      return actualizado;
    });

  const parchear = (id, datos, sufijo = "") =>
    ejecutar(async () => {
      const actualizado = await adminApi.patch(`${ruta}/${id}${sufijo}`, datos);
      setItems((prev) => prev.map((item) => (item.id === id ? actualizado : item)));
      return actualizado;
    });

  const eliminar = (id) =>
    ejecutar(async () => {
      await adminApi.delete(`${ruta}/${id}`);
      setItems((prev) => prev.filter((item) => item.id !== id));
      return true;
    });

  return { items, setItems, cargando, error, guardando, cargar, crear, actualizar, parchear, eliminar };
}