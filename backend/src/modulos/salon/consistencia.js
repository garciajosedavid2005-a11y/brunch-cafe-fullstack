import Cuenta, { problemasDeCuenta } from './cuenta.model.js'
import Comanda, { problemasDeComanda } from './comanda.model.js'
import Mesa from './mesa.model.js'
import { ESTADOS_CUENTA_ABIERTA, MESA_SEGUN_CUENTA } from '../compartido/estadosSalon.js'
import { totalesCuenta } from './totales.js'

// 1.4 · Verificador de consistencia del salón (solo lectura; `npm run verificar:salon`). Busca lo que
// el servicio nunca debería dejar: montos que no cuadran con los ítems, mesas y cuentas que no se
// apuntan entre sí y rondas que rompen sus invariantes. Revisa todas las cuentas abiertas y las
// cerradas desde `desde` (por defecto, las últimas 48 h); ambas ramas usan índice. Devuelve ids, montos
// y los mensajes de validación (que pueden citar el valor guardado: es una herramienta del admin).
const HORAS_POR_DEFECTO = 48

// Mensajes de la validación del esquema de un documento; un error que no sea de validación se propaga
const erroresDeValidacion = async (doc) => {
    try {
        await doc.validate()
        return []
    } catch (error) {
        if (error?.name !== 'ValidationError') throw error
        return Object.values(error.errors).map((e) => e.message)
    }
}

export const verificarConsistenciaSalon = async ({ desde = new Date(Date.now() - HORAS_POR_DEFECTO * 3600_000) } = {}) => {
    const problemas = []
    const anotar = (codigo, entidad, id, detalle) => problemas.push({ codigo, entidad, id: String(id), detalle })

    const cuentas = await Cuenta.find({
        $or: [
            { estado: { $in: ESTADOS_CUENTA_ABIERTA } },
            { cerradaEn: { $gte: desde } },
            // Anomalía: cerrada sin fecha de cierre (ninguna de las otras ramas la encontraría)
            { estado: { $nin: ESTADOS_CUENTA_ABIERTA }, cerradaEn: null },
        ],
    }).lean()
    const comandas = cuentas.length ? await Comanda.find({ cuenta: { $in: cuentas.map((c) => c._id) } }).lean() : []
    const mesas = await Mesa.find().select('numero estado cuentaActual').lean()

    const comandasPorCuenta = new Map()
    for (const comanda of comandas) {
        const clave = String(comanda.cuenta)
        comandasPorCuenta.set(clave, [...(comandasPorCuenta.get(clave) || []), comanda])
        const invariantes = problemasDeComanda(comanda)
        if (invariantes.length) anotar('COMANDA_INVALIDA', 'comanda', comanda._id, invariantes.join('; '))
    }

    const mesaPorId = new Map(mesas.map((m) => [String(m._id), m]))
    for (const cuenta of cuentas) {
        const propias = comandasPorCuenta.get(String(cuenta._id)) || []
        let calculado = null
        try {
            calculado = totalesCuenta(propias)
        } catch (error) {
            anotar('TOTALES_INCONSISTENTES', 'cuenta', cuenta._id, error.message)
        }
        if (calculado && ['subtotal', 'pendiente', 'total'].some((campo) => cuenta[campo] !== calculado[campo])) {
            anotar('TOTALES_INCONSISTENTES', 'cuenta', cuenta._id,
                `guardado ${cuenta.subtotal}/${cuenta.pendiente}/${cuenta.total}, calculado ${calculado.subtotal}/${calculado.pendiente}/${calculado.total} (subtotal/pendiente/total)`)
        }
        const enviadas = propias.filter((c) => c.estado === 'enviada').map((c) => c.numeroRonda)
        if ((enviadas.length ? Math.max(...enviadas) : 0) !== cuenta.ultimaRonda) {
            anotar('RONDAS_INCONSISTENTES', 'cuenta', cuenta._id, `ultimaRonda ${cuenta.ultimaRonda}, enviadas [${enviadas.join(', ')}]`)
        }
        // validate() (validateSync está obsoleto desde Mongoose 9 y desaparece en el 10) también ejecuta
        // pre('validate'); los invariantes se comprueban además aparte y los mensajes repetidos se unen.
        // Si un campo rompe a la vez un invariante y su regla del esquema, el hook lo invalida antes y
        // solo se informa el invariante (la cuenta sale igual como CUENTA_INVALIDA)
        const mensajes = [
            ...(await erroresDeValidacion(Cuenta.hydrate(cuenta))),
            ...problemasDeCuenta(cuenta).map((p) => p.mensaje),
        ]
        if (mensajes.length) anotar('CUENTA_INVALIDA', 'cuenta', cuenta._id, [...new Set(mensajes)].join('; '))

        if (!ESTADOS_CUENTA_ABIERTA.includes(cuenta.estado)) continue
        for (const { mesa: mesaId } of cuenta.mesas) {
            const mesa = mesaPorId.get(String(mesaId))
            if (!mesa) anotar('MESA_INEXISTENTE', 'cuenta', cuenta._id, `la mesa ${mesaId} ya no existe`)
            else if (String(mesa.cuentaActual) !== String(cuenta._id)) {
                anotar('MESA_NO_APUNTA_A_LA_CUENTA', 'mesa', mesa._id, `mesa ${mesa.numero}: cuentaActual ${mesa.cuentaActual ?? 'null'}, cuenta ${cuenta._id}`)
            } else if (mesa.estado !== MESA_SEGUN_CUENTA[cuenta.estado]) {
                anotar('MESA_ESTADO_INCONSISTENTE', 'mesa', mesa._id, `mesa ${mesa.numero} «${mesa.estado}» con la cuenta «${cuenta.estado}»`)
            }
        }
    }

    // Mesas que dicen tener cuenta (o estar ocupadas) sin una cuenta abierta que las incluya
    const abiertas = new Map(cuentas.filter((c) => ESTADOS_CUENTA_ABIERTA.includes(c.estado)).map((c) => [String(c._id), c]))
    for (const mesa of mesas) {
        if (!mesa.cuentaActual) {
            if (['ocupada', 'cuenta_pedida'].includes(mesa.estado)) {
                anotar('MESA_OCUPADA_SIN_CUENTA', 'mesa', mesa._id, `mesa ${mesa.numero} «${mesa.estado}» sin cuenta`)
            }
            continue
        }
        const cuenta = abiertas.get(String(mesa.cuentaActual))
        if (!cuenta) anotar('MESA_CON_CUENTA_NO_ABIERTA', 'mesa', mesa._id, `mesa ${mesa.numero} apunta a ${mesa.cuentaActual}, que no está abierta`)
        else if (!cuenta.mesas.some((m) => String(m.mesa) === String(mesa._id))) {
            anotar('MESA_FUERA_DE_SU_CUENTA', 'mesa', mesa._id, `mesa ${mesa.numero} apunta a ${mesa.cuentaActual}, que no la incluye`)
        }
    }

    return {
        ok: problemas.length === 0,
        revisadas: { cuentas: cuentas.length, comandas: comandas.length, mesas: mesas.length },
        problemas,
    }
}
