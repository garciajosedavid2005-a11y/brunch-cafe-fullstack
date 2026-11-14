import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BellRing, HandPlatter, Minus, Plus, ReceiptText, RefreshCw, Send, Trash2, TriangleAlert, Undo2, UtensilsCrossed } from "lucide-react";
import { apiRequest } from "../../../services/api";
import { useDialogo } from "../../../context/useDialogo";
import { formatearCOP } from "../../../utils/moneda";
import { formatearHora } from "../../../utils/fechas";
import { nuevaClave } from "../plano/estadosMesa";
import { useCuenta } from "./useCuenta";
import { useEnVivo } from "../compartido/useEnVivo";
import DialogoProducto from "./DialogoProducto";
import DialogoAnular from "./DialogoAnular";
import {
  ANULABLES, BASE, CUENTA_EDITABLE, ESTADOS_CUENTA, ESTADOS_ITEM, MAX_CANTIDAD, MOTIVOS_ANULACION, PROBLEMAS_ITEM,
  puede, textoModificadores,
} from "./estadosComanda";
import "./TomaComanda.css";

// 1.7 · Toma de comanda en tablet (PLAN_FASE_1 §1.7). Menú por categorías, diálogo de modificadores y
// nota, ronda en curso (borrador) que se envía completa (F1-5) con confirmación, Idempotency-Key y la
// versión de la cuenta; rondas enviadas en solo lectura con anulación (item:anular, D1); solicitar y
// cancelar la cuenta (D4). Sin impuestos ni propina hasta la Fase 3. El backend vuelve a validarlo todo.
// 2.6 · «Listo para servir (n)» en la cabecera, «Servir» en cada ítem listo (item:servir, F2-2) y, para
// el admin, «Deshacer listo» con motivo obligatorio (F2-7: pasados los 10 s solo él; la cocina deshace
// lo suyo desde /kds). Mismo endpoint que la cocina, con el estado que se ve en pantalla (`de`).

const nombreMesas = (cuenta) => `Mesa ${cuenta.mesas.map((m) => m.numero).join(" + ")}`;
const cantidadItems = (ronda) => ronda.items.reduce((suma, i) => suma + i.cantidad, 0);

function Catalogo({ catalogo, error, onElegir, onReintentar }) {
  const conProductos = catalogo
    ? catalogo.categorias.filter((c) => catalogo.productos.some((p) => p.categoriaId === c.id))
    : [];
  const [categoria, setCategoria] = useState(null);
  const activa = categoria ?? conProductos[0]?.id;
  if (!catalogo) {
    return error ? (
      <div className="comanda__aviso" role="alert">
        {error} <button type="button" className="comanda__boton comanda__boton--secundario" onClick={onReintentar}>Reintentar</button>
      </div>
    ) : <p className="comanda__vacio">Cargando el menú…</p>;
  }
  const productos = catalogo.productos.filter((p) => p.categoriaId === activa);
  return (
    <>
      <div className="comanda-categorias" role="group" aria-label="Categorías">
        {conProductos.map((c) => (
          <button key={c.id} type="button" className="comanda-categoria" aria-pressed={c.id === activa} onClick={() => setCategoria(c.id)}>
            {c.nombre}
          </button>
        ))}
      </div>
      <ul className="comanda-productos" aria-label="Productos">
        {productos.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className={`comanda-producto${p.disponible ? "" : " is-agotado"}`}
              disabled={!p.disponible}
              aria-label={`${p.nombre}, ${formatearCOP(p.precio)}${p.disponible ? "" : ", agotado"}`}
              onClick={() => onElegir(p)}
            >
              <span className="comanda-producto__nombre">{p.nombre}</span>
              <span className="comanda-producto__precio">{formatearCOP(p.precio)}</span>
              {!p.disponible && <span className="comanda-producto__agotado">Agotado</span>}
              {p.disponible && p.modificadores?.length > 0 && <span className="comanda-producto__opciones">Con opciones</span>}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function TomaComanda({ cuentaId, permisos = [], onVolver }) {
  const { avisar, confirmar } = useDialogo();
  const { cuenta, error, recargar } = useCuenta(cuentaId);
  const tomaComandas = puede(permisos, "comanda:tomar");
  const [catalogo, setCatalogo] = useState(null);
  const [errorCatalogo, setErrorCatalogo] = useState("");
  const [producto, setProducto] = useState(null);
  const [anulando, setAnulando] = useState(null);
  const [problemas, setProblemas] = useState({}); // itemId → motivo (PRODUCT_UNAVAILABLE al enviar)
  const [ocupado, setOcupado] = useState(false);
  const [vista, setVista] = useState("menu"); // en vertical: «Menú» o «Cuenta»
  const claveEnvio = useRef(nuevaClave());
  const clavesItem = useRef({}); // 2.6 · Idempotency-Key por ítem y destino (se reutiliza solo sin respuesta)

  const cargarCatalogo = useCallback(() => apiRequest(`${BASE}/catalogo`)
    .then((datos) => { setCatalogo(datos); setErrorCatalogo(""); })
    .catch((e) => setErrorCatalogo(e.message || "No se pudo cargar el menú.")), []);

  useEffect(() => {
    if (tomaComandas) cargarCatalogo();
  }, [tomaComandas, cargarCatalogo]);
  // 2.7 · Lo que se agota o se reactiva en otra pantalla (canal «catalogo») recarga el menú al momento
  const canalesCatalogo = useMemo(() => (tomaComandas ? ["catalogo"] : []), [tomaComandas]);
  useEnVivo(canalesCatalogo, cargarCatalogo);

  if (!cuenta) {
    return (
      <div className="comanda comanda--cargando">
        <button type="button" className="comanda__boton comanda__boton--secundario" onClick={onVolver}>
          <ArrowLeft size={20} aria-hidden="true" /> Volver al plano
        </button>
        {error
          ? <p className="comanda__aviso" role="alert">{error} <button type="button" className="comanda__boton comanda__boton--secundario" onClick={recargar}>Reintentar</button></p>
          : <p className="comanda__vacio">Cargando la cuenta…</p>}
      </div>
    );
  }

  const editable = CUENTA_EDITABLE.includes(cuenta.estado);
  const borrador = cuenta.rondas.find((r) => r.estado === "borrador" && r.items.length > 0) || null;
  const enviadas = cuenta.rondas.filter((r) => r.estado !== "borrador");
  const huboEnviados = enviadas.some((r) => r.items.length > 0);
  const enRonda = borrador ? cantidadItems(borrador) : 0;
  // 2.7 · Además de lo que rechazó el último envío, lo que el menú ya marca como agotado (producto u opción)
  const agotadoEnMenu = (item) => {
    const producto = catalogo?.productos.find((p) => p.id === item.productoId);
    if (!producto) return null;
    if (!producto.disponible) return "producto_agotado";
    const opciones = (producto.modificadores || []).flatMap((g) => g.opciones);
    return item.modificadores.some((m) => opciones.find((o) => o.id === m.opcionId)?.disponible === false) ? "opcion_agotada" : null;
  };
  const problemaDe = (item) => problemas[item.id] || agotadoEnMenu(item);
  const conProblema = Boolean(borrador?.items.some((i) => problemaDe(i)));
  const listos = enviadas.reduce((suma, r) => suma + r.items.filter((i) => i.estado === "listo").length, 0);
  const sirve = editable && puede(permisos, "item:servir");
  const deshaceListo = editable && permisos.includes("*"); // F2-7: pasados los 10 s, solo el admin

  // ── Acciones ──────────────────────────────────────────────────────────────────────────
  const mostrarError = (e, titulo) => {
    if (e.code === "CUENTA_MODIFICADA") {
      return avisar({ titulo: "La cuenta cambió", mensaje: "Otra persona la modificó mientras la editabas. Ya se cargó la versión actual: revísala y vuelve a intentarlo." });
    }
    return avisar({ tipo: "error", titulo, mensaje: e.message });
  };

  const operar = async (ruta, { method = "POST", cuerpo, headers } = {}) => {
    setOcupado(true);
    try {
      await apiRequest(`${BASE}/cuentas/${cuenta.id}${ruta}`, {
        method, ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }), ...(headers ? { headers } : {}),
      });
      return null;
    } catch (e) {
      return e;
    } finally {
      setOcupado(false);
      recargar(); // con éxito o con conflicto, se muestra lo vigente
    }
  };

  const agregar = async (datos, clave) => {
    try {
      await apiRequest(`${BASE}/cuentas/${cuenta.id}/items`, { method: "POST", body: JSON.stringify(datos), headers: { "Idempotency-Key": clave } });
      setProducto(null);
      recargar();
      return null;
    } catch (e) {
      if (e.code === "PRODUCT_UNAVAILABLE") cargarCatalogo();
      recargar();
      return e;
    }
  };

  const cambiarCantidad = async (item, cantidad) => {
    const fallo = await operar(`/items/${item.id}`, { method: "PATCH", cuerpo: { cantidad } });
    if (fallo) mostrarError(fallo, "No se pudo cambiar la cantidad");
  };

  const quitar = async (item) => {
    const fallo = await operar(`/items/${item.id}`, { method: "DELETE" });
    if (fallo) mostrarError(fallo, "No se pudo quitar el ítem");
    else setProblemas((actual) => Object.fromEntries(Object.entries(actual).filter(([id]) => id !== item.id)));
  };

  const enviarRonda = async () => {
    const n = borrador.numeroRonda;
    const { confirmado } = await confirmar({
      titulo: `Enviar la ronda ${n}`,
      mensaje: `Se envían ${enRonda} ${enRonda === 1 ? "ítem" : "ítems"} (${formatearCOP(borrador.subtotal)}) a cocina y barra. Después ya no se pueden quitar, solo anular.`,
      confirmarTexto: "Enviar",
    });
    if (!confirmado) return;
    const fallo = await operar(`/rondas/${n}/enviar`, { cuerpo: { versionEsperada: cuenta.version }, headers: { "Idempotency-Key": claveEnvio.current } });
    // La misma clave solo se reutiliza si no llegó respuesta (corte de red): así no se envía dos veces
    if (!fallo || fallo.status) claveEnvio.current = nuevaClave();
    if (!fallo) {
      setProblemas({});
      return;
    }
    if (fallo.code === "PRODUCT_UNAVAILABLE") {
      setProblemas(Object.fromEntries((fallo.details?.items || []).map((i) => [i.itemId, i.motivo])));
      setVista("cuenta");
      cargarCatalogo();
    }
    mostrarError(fallo, "No se envió la ronda");
  };

  const anular = async ({ motivo, detalle }) => {
    const fallo = await operar(`/items/${anulando.id}/anular`, { cuerpo: { motivo, ...(detalle ? { detalle } : {}), versionEsperada: cuenta.version } });
    if (!fallo) setAnulando(null);
    else if (fallo.code === "CUENTA_MODIFICADA") { setAnulando(null); mostrarError(fallo); }
    return fallo;
  };

  // 2.6 · Cambio de estado del ítem (servir o deshacer listo) con el estado que se ve en pantalla
  const cambiarItem = async (item, a, motivo) => {
    const llave = `${item.id}:${a}`;
    clavesItem.current[llave] ??= nuevaClave();
    setOcupado(true);
    try {
      await apiRequest(`/v1/staff/items/${item.id}/estado`, {
        method: "POST",
        body: JSON.stringify({ a, de: item.estado, ...(motivo ? { motivo } : {}) }),
        headers: { "Idempotency-Key": clavesItem.current[llave] },
      });
      delete clavesItem.current[llave];
      return null;
    } catch (e) {
      if (e.status) delete clavesItem.current[llave];
      return e;
    } finally {
      setOcupado(false);
      recargar();
    }
  };

  const servir = async (item) => {
    const fallo = await cambiarItem(item, "servido");
    if (fallo) mostrarError(fallo, "No se pudo servir");
  };

  const deshacerListo = async (item) => {
    const { confirmado, motivo } = await confirmar({
      titulo: "Deshacer «listo»",
      mensaje: `${item.cantidad} × ${item.nombre} vuelve a «En preparación» en cocina y barra. Queda registrado con tu motivo.`,
      confirmarTexto: "Volver a preparación",
      cancelarTexto: "Cancelar",
      motivo: { etiqueta: "Motivo", requerido: true },
    });
    if (!confirmado) return;
    const fallo = await cambiarItem(item, "en_preparacion", motivo);
    if (fallo) mostrarError(fallo, "No se pudo deshacer");
  };

  const solicitar = async () => {
    const { confirmado } = await confirmar({
      titulo: "Solicitar la cuenta",
      mensaje: `${nombreMesas(cuenta)} pasa a «Cuenta pedida» con un subtotal de ${formatearCOP(cuenta.subtotal)}.`,
      confirmarTexto: "Solicitar",
    });
    if (!confirmado) return;
    const fallo = await operar("/solicitar", { cuerpo: { versionEsperada: cuenta.version } });
    if (fallo) mostrarError(fallo, "No se pudo solicitar la cuenta");
  };

  const cancelar = async () => {
    const { confirmado, motivo } = await confirmar({
      titulo: "Cancelar la cuenta",
      mensaje: `La cuenta ${cuenta.codigo} se cancela sin cobro y la mesa queda por limpiar. Lo que haya en la ronda en curso se descarta.`,
      confirmarTexto: "Cancelar cuenta",
      cancelarTexto: "Volver",
      peligroso: true,
      motivo: { etiqueta: "Motivo", requerido: true },
    });
    if (!confirmado) return;
    const fallo = await operar("/cancelar", { cuerpo: { motivo, versionEsperada: cuenta.version } });
    if (fallo) mostrarError(fallo, "No se pudo cancelar la cuenta");
    else onVolver();
  };

  // ── Vista ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="comanda">
      <header className="comanda__cabecera">
        <button type="button" className="comanda__boton comanda__boton--secundario" onClick={onVolver}>
          <ArrowLeft size={20} aria-hidden="true" /> Volver al plano
        </button>
        <div className="comanda__titulos">
          <h2 className="comanda__titulo">{nombreMesas(cuenta)}</h2>
          <p className="comanda__sub">
            {[cuenta.mesas[0]?.zona?.nombre, `Cuenta ${cuenta.codigo}`, `${cuenta.comensales} ${cuenta.comensales === 1 ? "comensal" : "comensales"}`, cuenta.mesero?.nombre]
              .filter(Boolean).map((parte, i) => (
                // El separador va fuera de la parte: la línea se parte entre partes, nunca dentro de una
                <Fragment key={parte}>{i > 0 && " · "}<span className="comanda__sub-parte">{parte}</span></Fragment>
              ))}
          </p>
        </div>
        <span className={`comanda__estado comanda__estado--${cuenta.estado}`}>
          {cuenta.estado === "cuenta_pedida" ? <ReceiptText size={16} aria-hidden="true" /> : <UtensilsCrossed size={16} aria-hidden="true" />}
          {ESTADOS_CUENTA[cuenta.estado] || cuenta.estado}
        </span>
        {listos > 0 && (
          <span className="comanda__listos">
            <BellRing size={16} aria-hidden="true" />
            {`Listo para servir (${listos})`}
          </span>
        )}
        <button type="button" className="comanda__boton-icono" aria-label="Actualizar la cuenta" onClick={recargar}>
          <RefreshCw size={20} aria-hidden="true" />
        </button>
      </header>

      {!editable && <p className="comanda__aviso" role="status">Esta cuenta ya no admite cambios. Vuelve al plano.</p>}
      {cuenta.estado === "cuenta_pedida" && tomaComandas && (
        <p className="comanda__nota-estado">Agregar un ítem la vuelve a abrir.</p>
      )}

      {tomaComandas && editable && (
        <div className="comanda__vistas" role="group" aria-label="Ver">
          <button type="button" aria-pressed={vista === "menu"} onClick={() => setVista("menu")}>Menú</button>
          <button type="button" aria-pressed={vista === "cuenta"} onClick={() => setVista("cuenta")}>
            Cuenta{enRonda ? ` (${enRonda} sin enviar${conProblema ? " · con problema" : ""})` : ""}
          </button>
        </div>
      )}

      <div className={`comanda__cuerpo${tomaComandas && editable ? "" : " comanda__cuerpo--solo-cuenta"}`}>
        {tomaComandas && editable && (
          <section className={`comanda__menu${vista === "menu" ? "" : " is-oculta-vertical"}`} aria-label="Menú">
            <Catalogo catalogo={catalogo} error={errorCatalogo} onElegir={setProducto} onReintentar={cargarCatalogo} />
          </section>
        )}

        <div className={`comanda__cuenta${vista === "cuenta" || !tomaComandas || !editable ? "" : " is-oculta-vertical"}`}>
          {tomaComandas && editable && (
            <section className="comanda-bloque" aria-label="Ronda en curso">
              <h3 className="comanda-bloque__titulo">Ronda en curso{borrador ? ` · ronda ${borrador.numeroRonda}` : ""}</h3>
              {!borrador ? (
                <p className="comanda__vacio">Toca un producto del menú para empezar la ronda.</p>
              ) : (
                <>
                  <ul className="comanda-items">
                    {borrador.items.map((item) => {
                      const problema = problemaDe(item);
                      return (
                        <li key={item.id} className={`comanda-item${problema ? " is-problema" : ""}`}>
                          <div className="comanda-item__texto">
                            <strong>{item.nombre}</strong>
                            {item.modificadores.length > 0 && <span className="comanda-item__detalle">{textoModificadores(item.modificadores)}</span>}
                            {item.nota && <span className="comanda-item__detalle">Nota: {item.nota}</span>}
                            {problema && (
                              <span className="comanda-item__problema">
                                <TriangleAlert size={16} aria-hidden="true" /> No disponible: {PROBLEMAS_ITEM[problema] || problema}. Quítalo o cámbialo.
                              </span>
                            )}
                          </div>
                          <div className="comanda__contador comanda__contador--item">
                            <button type="button" className="comanda__boton-icono" aria-label={`Quitar uno de ${item.nombre}`}
                              disabled={ocupado || item.cantidad <= 1} onClick={() => cambiarCantidad(item, item.cantidad - 1)}>
                              <Minus size={20} aria-hidden="true" />
                            </button>
                            <output aria-label={`Cantidad de ${item.nombre}`}>{item.cantidad}</output>
                            <button type="button" className="comanda__boton-icono" aria-label={`Sumar uno de ${item.nombre}`}
                              disabled={ocupado || item.cantidad >= MAX_CANTIDAD || Boolean(problema)} onClick={() => cambiarCantidad(item, item.cantidad + 1)}>
                              <Plus size={20} aria-hidden="true" />
                            </button>
                          </div>
                          <span className="comanda-item__monto">{formatearCOP(item.subtotal)}</span>
                          <button type="button" className="comanda__boton-icono comanda__boton-icono--peligro" aria-label={`Quitar ${item.nombre} de la ronda`}
                            disabled={ocupado} onClick={() => quitar(item)}>
                            <Trash2 size={20} aria-hidden="true" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="comanda-bloque__total"><span>Total de la ronda</span><strong>{formatearCOP(borrador.subtotal)}</strong></p>
                  {puede(permisos, "comanda:enviar") && (
                    <button type="button" className="comanda__boton comanda__boton--primario comanda__boton--ancho" disabled={ocupado} onClick={enviarRonda}>
                      <Send size={20} aria-hidden="true" /> Enviar ronda {borrador.numeroRonda}
                    </button>
                  )}
                </>
              )}
            </section>
          )}

          <section className="comanda-bloque" aria-label="Rondas enviadas">
            <h3 className="comanda-bloque__titulo">Rondas enviadas</h3>
            {enviadas.length === 0 ? (
              <p className="comanda__vacio">Aún no se ha enviado ninguna ronda.</p>
            ) : enviadas.map((ronda) => (
              <div key={ronda.id} className="comanda-ronda">
                <h4 className="comanda-ronda__titulo">
                  Ronda {ronda.numeroRonda}{ronda.enviadaEn ? ` · ${formatearHora(ronda.enviadaEn)}` : ""}
                </h4>
                <ul className="comanda-items">
                  {ronda.items.map((item) => {
                    const anulado = item.estado === "anulado";
                    const conAccionesListo = item.estado === "listo" && (sirve || deshaceListo);
                    const anular = editable && !anulado && ANULABLES.includes(item.estado) && puede(permisos, "item:anular") ? (
                      <button type="button" className="comanda__boton comanda__boton--secundario comanda__boton--peligro-texto comanda-item__anular"
                        aria-label={`Anular ${item.nombre}`} disabled={ocupado} onClick={() => setAnulando(item)}>
                        Anular
                      </button>
                    ) : null;
                    const motivo = anulado && item.anulacion
                      ? [MOTIVOS_ANULACION[item.anulacion.motivo] || item.anulacion.motivo, item.anulacion.detalle].filter(Boolean).join(": ")
                      : "";
                    return (
                      <li key={item.id} className={`comanda-item comanda-item--enviado${anulado ? " is-anulado" : ""}`}>
                        <div className="comanda-item__texto">
                          <strong><span className="comanda-item__cantidad">{item.cantidad} ×</span> <span>{item.nombre}</span></strong>
                          {item.modificadores.length > 0 && <span className="comanda-item__detalle">{textoModificadores(item.modificadores)}</span>}
                          {item.nota && <span className="comanda-item__detalle">Nota: {item.nota}</span>}
                        </div>
                        <span className={`comanda-item__estado comanda-item__estado--${item.estado}`}>
                          {ESTADOS_ITEM[item.estado] || item.estado}{motivo ? ` · ${motivo}` : ""}
                        </span>
                        <span className="comanda-item__monto">{anulado ? <s>{formatearCOP(item.subtotal)}</s> : formatearCOP(item.subtotal)}</span>
                        {conAccionesListo && (
                          // «Anular» va al final del grupo y separado: lejos de «Servir» (revisor-visual)
                          <span className="comanda-item__acciones-listo">
                            {sirve && (
                              <button type="button" className="comanda__boton comanda__boton--primario"
                                aria-label={`Servir ${item.cantidad} × ${item.nombre}`} disabled={ocupado} onClick={() => servir(item)}>
                                <HandPlatter size={18} aria-hidden="true" /> Servir
                              </button>
                            )}
                            {deshaceListo && (
                              <button type="button" className="comanda__boton comanda__boton--secundario"
                                aria-label={`Deshacer «listo» de ${item.cantidad} × ${item.nombre}`} disabled={ocupado} onClick={() => deshacerListo(item)}>
                                <Undo2 size={18} aria-hidden="true" /> Deshacer
                              </button>
                            )}
                            {anular}
                          </span>
                        )}
                        {!conAccionesListo && anular}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>

          <section className="comanda-bloque comanda-resumen" aria-label="Resumen de la cuenta">
            <div className="comanda-resumen__fila comanda-resumen__fila--total">
              <span>Subtotal</span>
              <strong>{formatearCOP(cuenta.subtotal)}</strong>
            </div>
            {cuenta.pendiente > 0 && (
              <div className="comanda-resumen__fila"><span>Sin enviar (no suma)</span><span>{formatearCOP(cuenta.pendiente)}</span></div>
            )}
            <p className="comanda__nota">Sin impuestos ni propina: se calculan al cobrar.</p>
            <div className="comanda-resumen__acciones">
              {cuenta.estado === "abierta" && puede(permisos, "cuenta:solicitar") && (
                <button type="button" className="comanda__boton comanda__boton--primario" disabled={ocupado} onClick={solicitar}>Solicitar cuenta</button>
              )}
              {cuenta.estado === "abierta" && !huboEnviados && puede(permisos, "cuenta:abrir") && (
                <button type="button" className="comanda__boton comanda__boton--peligro-texto comanda__boton--secundario" disabled={ocupado} onClick={cancelar}>Cancelar cuenta</button>
              )}
            </div>
          </section>
        </div>
      </div>

      {producto && <DialogoProducto key={producto.id} producto={producto} onAgregar={agregar} onCerrar={() => setProducto(null)} />}
      {anulando && <DialogoAnular item={anulando} onConfirmar={anular} onCerrar={() => setAnulando(null)} />}
    </div>
  );
}
