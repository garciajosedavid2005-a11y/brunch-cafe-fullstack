import { Bike, CheckCheck, Clock3, Flame, Play, TriangleAlert, Undo2 } from "lucide-react";
import { VENTANA_DESHACER_MS, textoMesas, textoMinutos } from "./kdsUtils";
import { MOTIVOS_ANULACION } from "../StaffDashboard/comanda/estadosComanda";

// 2.5 · Tarjetas del KDS: ronda del salón (por estación) y pedido a domicilio (F2-3). Los estados y el
// temporizador se comunican con texto e icono, nunca solo con color. Botones grandes (56 px).
const ESTADO_ITEM = { enviado: "Nuevo", en_preparacion: "En preparación", listo: "Listo", servido: "Servido", anulado: "Anulado" };
const ESTADO_PEDIDO = { confirmado: "Nuevo", en_preparacion: "En preparación" };

const TIEMPO = {
  normal: { texto: "A tiempo", Icono: Clock3 },
  aviso: { texto: "Atención", Icono: TriangleAlert },
  alerta: { texto: "Retrasada", Icono: Flame },
};

function Temporizador({ minutos, nivel }) {
  const { texto, Icono } = TIEMPO[nivel];
  return (
    <p className={`kds-tiempo kds-tiempo--${nivel}`}>
      <Icono size={22} aria-hidden="true" />
      <span className="kds-tiempo__min">{textoMinutos(minutos)}</span>
      <span className="kds-tiempo__texto">{texto}</span>
    </p>
  );
}

const Detalle = ({ modificadores = [], nota }) => (
  <>
    {modificadores.length > 0 && (
      <span className="kds-item__opciones">{modificadores.map((m) => `${m.grupo}: ${m.opcion}`).join(" · ")}</span>
    )}
    {nota && <span className="kds-item__nota">Nota: {nota}</span>}
  </>
);

/**
 * Botón grande con solo el verbo a la vista y el nombre accesible completo («Empezar: 2 × Huevos»). El
 * nombre empieza por el texto visible (etiqueta en el nombre, WCAG 2.5.3); con aria-label es el mismo en
 * todos los navegadores (un texto oculto con position: absolute lo separaba con un espacio en Chromium).
 */
function BotonKds({ texto, contexto, extra, onClick, ocupado, variante = "primario", Icono }) {
  return (
    <button type="button" className={`kds-boton kds-boton--${variante}`} onClick={onClick} disabled={ocupado}
      aria-label={`${texto}: ${contexto}${extra ? ` ${extra}` : ""}`}>
      {Icono && <Icono size={22} aria-hidden="true" />}
      <span>{texto}</span>
      {extra && <span className="kds-boton__extra"> {extra}</span>}
    </button>
  );
}

function ItemKds({ item, ahora, usuarioId, puedePreparar, ocupado, onMarcar }) {
  const nombre = `${item.cantidad} × ${item.nombre}`;
  const anulado = item.estado === "anulado";
  const restanteDeshacer = item.estado === "listo" && String(item.listoPor) === String(usuarioId) && item.listoEn
    ? VENTANA_DESHACER_MS - (ahora - Date.parse(item.listoEn)) : 0;
  return (
    <li className={`kds-item kds-item--${item.estado}`}>
      <div className="kds-item__texto">
        <span className="kds-item__nombre">{item.cantidad} × {item.nombre}</span>
        <Detalle modificadores={item.modificadores} nota={item.nota} />
        {anulado && (
          <span className="kds-item__anulacion">
            Anulado: {MOTIVOS_ANULACION[item.anulacion?.motivo] || item.anulacion?.motivo || "sin motivo"}{item.anulacion?.detalle ? ` (${item.anulacion.detalle})` : ""}
          </span>
        )}
      </div>
      <div className="kds-item__acciones">
        {!anulado && <span className={`kds-estado kds-estado--${item.estado}`}>{ESTADO_ITEM[item.estado] || item.estado}</span>}
        {puedePreparar && item.estado === "enviado" && (
          <BotonKds texto="Empezar" contexto={nombre} Icono={Play} ocupado={ocupado}
            onClick={() => onMarcar(item, "en_preparacion")} />
        )}
        {puedePreparar && item.estado === "en_preparacion" && (
          <BotonKds texto="Listo" contexto={nombre} Icono={CheckCheck} ocupado={ocupado}
            onClick={() => onMarcar(item, "listo")} />
        )}
        {/* El reloj de la pantalla avanza a saltos de 1 s: se oculta con el último segundo de margen para no
            ofrecer un «Deshacer» que el servidor ya rechazaría (403 pasados los 10 s) */}
        {puedePreparar && restanteDeshacer >= 1000 && (
          <BotonKds texto="Deshacer" contexto={nombre} extra={`(${Math.floor(restanteDeshacer / 1000)} s)`} Icono={Undo2}
            variante="secundario" ocupado={ocupado} onClick={() => onMarcar(item, "en_preparacion")} />
        )}
      </div>
    </li>
  );
}

export function TarjetaRonda({ ronda, minutos, nivel, ahora, usuarioId, puedePreparar, ocupado, onMarcarItem, onTodoListo }) {
  const titulo = textoMesas(ronda.mesas);
  const anulados = ronda.items.filter((i) => i.estado === "anulado").length;
  const pendientes = ronda.items.filter((i) => ["enviado", "en_preparacion"].includes(i.estado)).length;
  return (
    <article className={`kds-tarjeta kds-tarjeta--${nivel}`}>
      <header className="kds-tarjeta__cabecera">
        <div>
          <h2 className="kds-tarjeta__titulo">{titulo}</h2>
          <p className="kds-tarjeta__sub">Ronda {ronda.numeroRonda}{ronda.mesero ? ` · ${ronda.mesero}` : ""}</p>
        </div>
        <Temporizador minutos={minutos} nivel={nivel} />
      </header>
      {anulados > 0 && (
        <p className="kds-tarjeta__aviso" role="alert">
          <TriangleAlert size={20} aria-hidden="true" />
          {anulados === 1 ? "Se anuló 1 ítem: no lo prepares" : `Se anularon ${anulados} ítems: no los prepares`}
        </p>
      )}
      <ul className="kds-tarjeta__items">
        {ronda.items.map((item) => (
          <ItemKds key={item.id} item={item} ahora={ahora} usuarioId={usuarioId} puedePreparar={puedePreparar}
            ocupado={ocupado} onMarcar={onMarcarItem} />
        ))}
      </ul>
      {puedePreparar && pendientes > 0 && (
        <BotonKds texto="Todo listo" contexto={`${titulo}, ronda ${ronda.numeroRonda}`} Icono={CheckCheck}
          variante="todo" ocupado={ocupado} onClick={onTodoListo} />
      )}
    </article>
  );
}

export function TarjetaDomicilio({ pedido, minutos, nivel, puedePreparar, ocupado, onMarcar }) {
  const contexto = `domicilio ${pedido.codigo}`;
  return (
    <article className={`kds-tarjeta kds-tarjeta--domicilio kds-tarjeta--${nivel}`}>
      <header className="kds-tarjeta__cabecera">
        <div>
          <h2 className="kds-tarjeta__titulo"><Bike size={24} aria-hidden="true" /> Domicilio <span className="kds-tarjeta__codigo">{pedido.codigo}</span></h2>
          <p className="kds-tarjeta__sub">
            {pedido.horaEntrega ? `Entrega ${pedido.horaEntrega} ` : ""}
            <span className={`kds-estado kds-estado--${pedido.estado}`}>{ESTADO_PEDIDO[pedido.estado] || pedido.estado}</span>
          </p>
        </div>
        <Temporizador minutos={minutos} nivel={nivel} />
      </header>
      <ul className="kds-tarjeta__items">
        {pedido.lineas.map((linea) => (
          <li key={linea.id} className="kds-item">
            <div className="kds-item__texto">
              <span className="kds-item__nombre">{linea.cantidad} × {linea.nombre}</span>
              <Detalle modificadores={linea.modificadores} nota={linea.nota} />
            </div>
          </li>
        ))}
      </ul>
      {puedePreparar && (
        <div className="kds-tarjeta__pie">
          {pedido.estado === "confirmado" && (
            <BotonKds texto="Empezar" contexto={contexto} Icono={Play} ocupado={ocupado}
              onClick={() => onMarcar("en_preparacion")} />
          )}
          <BotonKds texto="Listo" contexto={contexto} Icono={CheckCheck} variante="todo" ocupado={ocupado}
            onClick={() => onMarcar("listo")} />
        </div>
      )}
    </article>
  );
}
