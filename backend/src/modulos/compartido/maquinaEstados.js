// Motor genérico de máquinas de estado (1.4): mesa, cuenta e ítem de comanda. Mismos códigos de
// error que validarTransicion de pedidos y reservas (estados.js):
//   ESTADO_INVALIDO (400), ESTADO_FINAL (409), TRANSICION_INVALIDA (409), FORBIDDEN (403), MOTIVO_REQUERIDO (400).
//
// Cada transición declara `de` (lista), `a`, `via` y `permiso`:
//   - via 'staff' (por defecto): la pide una persona y exige `permiso`;
//   - via 'manual': igual, pero se distingue de las que solo ocurren como efecto de otra operación
//     (la mesa cambia a mano solo por las suyas);
//   - via 'sistema': consecuencia de otra transición ya autorizada (p. ej. la mesa pasa a
//     por_limpiar al cerrarse su cuenta); no lleva permiso propio y no la puede pedir nadie.
// Lo que no está declarado, no se permite.
import { AppError } from './errors.js'
import { CLAVES, tienePermiso } from '../identidad/permisos.js'

export const crearMaquina = ({ nombre, estados, finales = [], transiciones }) => {
    const lista = transiciones.map((t) => ({ via: 'staff', permiso: null, requiereMotivo: false, ...t, de: [].concat(t.de) }))

    // Comprobación al cargar: la definición es coherente o el servidor no arranca
    for (const t of lista) {
        for (const codigo of [...t.de, t.a]) {
            if (!estados.includes(codigo)) throw new Error(`Máquina ${nombre}: estado desconocido "${codigo}"`)
        }
        if (t.de.some((codigo) => finales.includes(codigo))) throw new Error(`Máquina ${nombre}: transición desde un estado final (${t.de})`)
        if (t.via === 'sistema' ? t.permiso !== null : !CLAVES.includes(t.permiso)) {
            throw new Error(`Máquina ${nombre}: permiso no válido en ${t.de} → ${t.a} (${t.permiso})`)
        }
    }

    const esFinal = (codigo) => finales.includes(codigo)

    /** Transiciones que se pueden pedir desde `de` por esa vía (filtradas por permisos salvo las del sistema). */
    const disponibles = (de, { via = 'staff', permisos = [] } = {}) =>
        lista.filter((t) => t.via === via && t.de.includes(de) && (via === 'sistema' || tienePermiso(permisos, t.permiso)))

    /** Valida el cambio y devuelve { transicion, motivo } (motivo sin espacios sobrantes). */
    const validar = (de, a, { via = 'staff', permisos = [], motivo } = {}) => {
        if (!estados.includes(a)) {
            throw new AppError(400, 'ESTADO_INVALIDO', `El estado "${a}" no existe para ${nombre}.`)
        }
        if (esFinal(de)) {
            throw new AppError(409, 'ESTADO_FINAL', `Ya está en un estado final («${de}») y no puede cambiar.`, { de })
        }
        const transicion = lista.find((t) => t.via === via && t.a === a && t.de.includes(de))
        if (!transicion) {
            const permitidos = disponibles(de, { via, permisos }).map((t) => t.a)
            throw new AppError(409, 'TRANSICION_INVALIDA', `No se puede pasar de "${de}" a "${a}".`, { de, a, permitidos })
        }
        if (via !== 'sistema' && !tienePermiso(permisos, transicion.permiso)) {
            throw new AppError(403, 'FORBIDDEN', 'No tienes permiso para realizar esta acción.', { requiere: [transicion.permiso] })
        }
        const texto = typeof motivo === 'string' ? motivo.trim() : ''
        if (transicion.requiereMotivo && !texto) {
            throw new AppError(400, 'MOTIVO_REQUERIDO', 'Indica el motivo de este cambio.')
        }
        return { transicion, motivo: texto }
    }

    return { nombre, estados, finales, transiciones: lista, esFinal, disponibles, validar }
}
