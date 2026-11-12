import { createElement, useEffect, useId, useRef, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { apiRequest } from "../../../services/api";
import { useDialogo } from "../../../context/useDialogo";
import { formatearCOP } from "../../../utils/moneda";
import { incluyePermiso } from "../../../utils/permisos";
import { datosEstado, formatearMinutos, nuevaClave } from "./estadosMesa";

// 1.6 · Acciones de una mesa según su estado y los permisos (el backend vuelve a comprobarlos):
// abrir cuenta (comensales; mesero si quien abre no toma comandas), bloquear y desbloquear con
// motivo, marcar limpia, mover, unir, separar y transferir. Un 409/404 recarga el plano.
const BASE = "/v1/staff/salon";
const MAX_COMENSALES = 50;

const puede = incluyePermiso;

// Por qué no se puede unir una mesa (null = se puede), con las mismas reglas que el backend:
// misma zona, combinable, libre y sin cuenta. «No combinable» va primero porque no depende del momento.
const motivoNoUnible = (m, cuenta) => {
  if (cuenta && m.cuenta?.id === cuenta.id) return "ya está en esta cuenta";
  if (!m.combinable) return "no combinable";
  if (m.estado !== "libre" || m.cuenta) return datosEstado(m.estado).etiqueta.toLowerCase();
  return null;
};

export default function PanelMesa({ mesa, mesas, permisos, onHecho, onCerrar, onVerCuenta }) {
  const id = useId();
  const tituloRef = useRef(null);
  const { confirmar } = useDialogo();
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [modo, setModo] = useState(null); // null | "mover" | "unir" | "transferir"
  const [comensales, setComensales] = useState(() => Math.min(2, mesa.capacidad || 2));
  const [meseroId, setMeseroId] = useState("");
  const [meseros, setMeseros] = useState(null);
  const [unir, setUnir] = useState([]);
  const [motivoTransferencia, setMotivoTransferencia] = useState("");
  // Una clave por intento de abrir: un reintento tras un corte de red no abre otra cuenta
  const claveAbrir = useRef(nuevaClave());

  const cuenta = mesa.cuenta;
  const abierta = cuenta?.estado === "abierta";
  const tomaComandas = puede(permisos, "comanda:tomar");
  const eligeMesero = puede(permisos, "cuenta:transferir") || !tomaComandas;
  const necesitaMeseros = (mesa.estado === "libre" && !cuenta && puede(permisos, "cuenta:abrir") && eligeMesero) || modo === "transferir";
  const { etiqueta, icono } = datosEstado(mesa.estado);

  useEffect(() => { tituloRef.current?.focus(); }, []);

  useEffect(() => {
    if (!necesitaMeseros || meseros) return undefined;
    let activo = true;
    apiRequest(`${BASE}/meseros`)
      .then((lista) => activo && setMeseros(lista))
      .catch((e) => activo && setError(e.message));
    return () => { activo = false; };
  }, [necesitaMeseros, meseros]);

  const ejecutar = async (ruta, cuerpo, headers) => {
    setError("");
    setEnviando(true);
    try {
      await apiRequest(`${BASE}${ruta}`, { method: "POST", body: JSON.stringify(cuerpo ?? {}), headers });
      setModo(null);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setEnviando(false);
      // Con éxito o con conflicto (409/404), el plano se recarga para mostrar lo vigente
      onHecho();
    }
  };

  const abrirCuenta = async () => {
    if (!tomaComandas && !meseroId) {
      setError("Elige el mesero que atenderá la mesa.");
      return;
    }
    const ok = await ejecutar(`/mesas/${mesa.id}/abrir`, { comensales, ...(meseroId ? { meseroId } : {}) },
      { "Idempotency-Key": claveAbrir.current });
    if (ok) claveAbrir.current = nuevaClave();
  };

  const cambiarEstado = async (a, { titulo, mensaje, conMotivo }) => {
    if (conMotivo) {
      const { confirmado, motivo } = await confirmar({ titulo, mensaje, confirmarTexto: titulo, motivo: { etiqueta: "Motivo", requerido: true } });
      if (!confirmado) return;
      await ejecutar(`/mesas/${mesa.id}/estado`, { a, motivo });
      return;
    }
    await ejecutar(`/mesas/${mesa.id}/estado`, { a });
  };

  const mover = async (destino) => {
    const { confirmado } = await confirmar({
      titulo: `Mover a la mesa ${destino.numero}`,
      mensaje: `La cuenta ${cuenta.codigo} pasa a la mesa ${destino.numero} y la mesa ${mesa.numero} queda por limpiar.`,
      confirmarTexto: "Mover",
    });
    if (confirmado) await ejecutar(`/mesas/${mesa.id}/mover`, { mesaDestinoId: destino.id, versionEsperada: cuenta.version });
  };

  const separar = async () => {
    const { confirmado } = await confirmar({
      titulo: `Separar la mesa ${mesa.numero}`,
      mensaje: `La mesa ${mesa.numero} sale de la cuenta ${cuenta.codigo} y queda por limpiar.`,
      confirmarTexto: "Separar",
    });
    if (confirmado) await ejecutar(`/mesas/${mesa.id}/separar`, { versionEsperada: cuenta.version });
  };

  // Destinos posibles: libres y, con mesas unidas, de la misma zona y combinables (como valida el backend)
  const libres = mesas.filter((m) => m.estado === "libre" && !m.cuenta && m.id !== mesa.id);
  const destinos = cuenta?.mesas.length > 1 ? libres.filter((m) => m.zona.id === mesa.zona.id && m.combinable) : libres;
  // Revisión de 1.6 · Unir: todas las mesas de la zona; las que no se pueden unir van deshabilitadas con su motivo
  const deLaZona = mesas.filter((m) => m.zona.id === mesa.zona.id && m.id !== mesa.id);
  const candidatas = deLaZona.map((m) => ({ ...m, motivo: motivoNoUnible(m, cuenta) }));
  const hayUnibles = candidatas.some((m) => !m.motivo);

  return (
    <section className="panel-mesa" aria-labelledby={`${id}-titulo`} onKeyDown={(e) => e.key === "Escape" && onCerrar()}>
      <div className="panel-mesa__cabecera">
        <div>
          <h2 id={`${id}-titulo`} ref={tituloRef} tabIndex={-1} className="panel-mesa__titulo">Mesa {mesa.numero}</h2>
          <p className="panel-mesa__sub">
            {[mesa.nombre, mesa.zona.nombre, `${mesa.capacidad} puestos`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button type="button" className="plano__boton-icono" aria-label="Cerrar panel" onClick={onCerrar}>
          <X size={22} aria-hidden="true" />
        </button>
      </div>

      <p className={`plano__estado plano__estado--${mesa.estado} panel-mesa__estado`}>
        {createElement(icono, { size: 18, "aria-hidden": true })}
        {etiqueta}
      </p>

      {error && <p className="plano__aviso" role="alert">{error}</p>}

      {cuenta && (
        <dl className="panel-mesa__datos">
          <div><dt>Cuenta</dt><dd>{cuenta.codigo}{cuenta.estado === "cuenta_pedida" ? " (pedida)" : ""}</dd></div>
          <div><dt>Comensales</dt><dd>{cuenta.comensales}</dd></div>
          <div><dt>Mesero</dt><dd>{cuenta.mesero?.nombre || "—"}</dd></div>
          <div><dt>Tiempo</dt><dd>{formatearMinutos(cuenta.minutosOcupada)}</dd></div>
          <div><dt>Total enviado</dt><dd>{formatearCOP(cuenta.total)}</dd></div>
          {cuenta.pendiente > 0 && <div><dt>Sin enviar</dt><dd>{formatearCOP(cuenta.pendiente)}</dd></div>}
          {cuenta.mesas.length > 1 && <div><dt>Mesas</dt><dd>{cuenta.mesas.map((m) => m.numero).join(", ")}</dd></div>}
        </dl>
      )}

      {/* Mesa libre: abrir cuenta y bloquear */}
      {mesa.estado === "libre" && !cuenta && puede(permisos, "cuenta:abrir") && (
        <div className="panel-mesa__bloque">
          <span className="panel-mesa__etiqueta" id={`${id}-comensales`}>Comensales</span>
          <div className="panel-mesa__contador" role="group" aria-labelledby={`${id}-comensales`}>
            <button type="button" className="plano__boton-icono" aria-label="Quitar comensal"
              disabled={comensales <= 1} onClick={() => setComensales((n) => Math.max(1, n - 1))}>
              <Minus size={22} aria-hidden="true" />
            </button>
            <output aria-live="polite">{comensales}</output>
            <button type="button" className="plano__boton-icono" aria-label="Sumar comensal"
              disabled={comensales >= MAX_COMENSALES} onClick={() => setComensales((n) => Math.min(MAX_COMENSALES, n + 1))}>
              <Plus size={22} aria-hidden="true" />
            </button>
          </div>
          {comensales > mesa.capacidad && (
            <p className="panel-mesa__nota">Son más que los {mesa.capacidad} puestos de la mesa: puedes unir otra mesa después.</p>
          )}
          {eligeMesero && (
            <label className="panel-mesa__campo">
              <span>Mesero responsable</span>
              <select value={meseroId} onChange={(e) => setMeseroId(e.target.value)} disabled={!meseros}>
                <option value="">{tomaComandas ? "Yo" : meseros ? "Elige un mesero" : "Cargando…"}</option>
                {(meseros || []).map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </label>
          )}
          <button type="button" className="plano__boton plano__boton--primario" disabled={enviando} onClick={abrirCuenta}>
            Abrir cuenta
          </button>
        </div>
      )}

      <div className="panel-mesa__acciones">
        {/* 1.7 · La cuenta de la mesa: rondas, comanda, solicitar y cancelar */}
        {cuenta && puede(permisos, "cuenta:ver") && (
          <button type="button" className="plano__boton plano__boton--primario" onClick={() => onVerCuenta(cuenta.id)}>
            {tomaComandas ? "Ver cuenta / Tomar comanda" : "Ver cuenta"}
          </button>
        )}
        {mesa.estado === "libre" && !cuenta && puede(permisos, "mesa:bloquear") && (
          <button type="button" className="plano__boton plano__boton--secundario" disabled={enviando}
            onClick={() => cambiarEstado("bloqueada", { titulo: "Bloquear mesa", mensaje: `La mesa ${mesa.numero} no se podrá ocupar hasta desbloquearla.`, conMotivo: true })}>
            Bloquear mesa
          </button>
        )}
        {mesa.estado === "bloqueada" && puede(permisos, "mesa:bloquear") && (
          <button type="button" className="plano__boton plano__boton--primario" disabled={enviando}
            onClick={() => cambiarEstado("libre", { titulo: "Desbloquear mesa", mensaje: `La mesa ${mesa.numero} vuelve a estar libre.`, conMotivo: true })}>
            Desbloquear mesa
          </button>
        )}
        {mesa.estado === "por_limpiar" && puede(permisos, "mesa:operar") && (
          <button type="button" className="plano__boton plano__boton--primario" disabled={enviando} onClick={() => cambiarEstado("libre", {})}>
            Marcar como limpia
          </button>
        )}

        {abierta && puede(permisos, "mesa:operar") && (
          <button type="button" className="plano__boton plano__boton--secundario" aria-expanded={modo === "mover"}
            onClick={() => setModo(modo === "mover" ? null : "mover")}>
            Mover a otra mesa
          </button>
        )}
        {abierta && mesa.combinable && puede(permisos, "mesa:unir") && (
          <button type="button" className="plano__boton plano__boton--secundario" aria-expanded={modo === "unir"}
            onClick={() => { setUnir([]); setModo(modo === "unir" ? null : "unir"); }}>
            Unir mesas
          </button>
        )}
        {abierta && !mesa.combinable && puede(permisos, "mesa:unir") && (
          <p className="panel-mesa__nota panel-mesa__nota--recuadro">Esta mesa no es combinable (cámbialo en Admin › Salón)</p>
        )}
        {abierta && cuenta.mesas.length > 1 && puede(permisos, "mesa:unir") && (
          <button type="button" className="plano__boton plano__boton--secundario" disabled={enviando} onClick={separar}>
            Separar esta mesa
          </button>
        )}
        {cuenta && puede(permisos, "cuenta:transferir") && (
          <button type="button" className="plano__boton plano__boton--secundario" aria-expanded={modo === "transferir"}
            onClick={() => setModo(modo === "transferir" ? null : "transferir")}>
            Transferir
          </button>
        )}
      </div>

      {modo === "mover" && (
        <div className="panel-mesa__bloque">
          <span className="panel-mesa__etiqueta">Elige la mesa de destino</span>
          {destinos.length === 0 ? <p className="panel-mesa__nota">No hay mesas libres{cuenta.mesas.length > 1 ? " combinables en esta zona" : ""}.</p> : (
            <div className="panel-mesa__opciones">
              {destinos.map((m) => (
                <button key={m.id} type="button" className="plano__boton plano__boton--opcion" disabled={enviando} onClick={() => mover(m)}>
                  Mesa {m.numero}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {modo === "unir" && (
        <div className="panel-mesa__bloque">
          <span className="panel-mesa__etiqueta">Mesas de {mesa.zona.nombre}</span>
          {candidatas.length === 0 ? <p className="panel-mesa__nota">No hay otras mesas en esta zona.</p> : (
            <>
              <div className="panel-mesa__opciones">
                {candidatas.map((m) => (
                  <label key={m.id} className={`panel-mesa__check${m.motivo ? " is-deshabilitada" : ""}`}>
                    <input type="checkbox" checked={unir.includes(m.id)} disabled={Boolean(m.motivo) || enviando}
                      onChange={(e) => setUnir((lista) => (e.target.checked ? [...lista, m.id] : lista.filter((x) => x !== m.id)))} />
                    <span>
                      Mesa {m.numero}
                      {m.motivo && <span className="panel-mesa__motivo"> ({m.motivo})</span>}
                    </span>
                  </label>
                ))}
              </div>
              {!hayUnibles && <p className="panel-mesa__nota">Ahora no hay mesas libres y combinables en esta zona.</p>}
              <button type="button" className="plano__boton plano__boton--primario" disabled={enviando || unir.length === 0}
                onClick={() => ejecutar("/mesas/unir", { principalId: mesa.id, mesaIds: unir, versionEsperada: cuenta.version })}>
                {unir.length > 1 ? `Unir ${unir.length} mesas` : "Unir mesa"}
              </button>
            </>
          )}
        </div>
      )}

      {modo === "transferir" && (
        <div className="panel-mesa__bloque">
          <label className="panel-mesa__campo">
            <span>Nuevo mesero</span>
            <select value={meseroId} onChange={(e) => setMeseroId(e.target.value)} disabled={!meseros}>
              <option value="">{meseros ? "Elige un mesero" : "Cargando…"}</option>
              {(meseros || []).filter((m) => m.id !== cuenta.mesero?.id).map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </label>
          <label className="panel-mesa__campo">
            <span>Motivo (opcional)</span>
            <input type="text" maxLength={300} value={motivoTransferencia} onChange={(e) => setMotivoTransferencia(e.target.value)} />
          </label>
          <button type="button" className="plano__boton plano__boton--primario" disabled={enviando || !meseroId}
            onClick={() => ejecutar(`/cuentas/${cuenta.id}/transferir`, {
              meseroId, ...(motivoTransferencia.trim() ? { motivo: motivoTransferencia.trim() } : {}), versionEsperada: cuenta.version,
            })}>
            Confirmar transferencia
          </button>
        </div>
      )}
    </section>
  );
}
