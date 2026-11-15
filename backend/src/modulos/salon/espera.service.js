// 4.4 · Lista de espera (PLAN_FASE_4, F4-4, F4-h): clientes sin reserva. Se agrega con reserva:crear; se sienta (abre
// la cuenta en una mesa libre y no reservada) o se retira con reserva:cambiar_estado. Solo la lista de hoy (Bogotá).
import { z } from 'zod'
import Espera, { MAX_PERSONAS_ESPERA } from './espera.model.js'
import { AppError, detallesZod } from '../compartido/errors.js'
import { conTransaccion } from '../compartido/transacciones.js'
import { registrarEvento } from '../compartido/estados.service.js'
import { fechaLocal } from '../compartido/fechas.js'
import { texto, telefono } from '../compartido/comunes.schema.js'
import { tienePermiso } from '../identidad/permisos.js'
import { abrirEnTransaccion, prepararApertura } from './cuentas.service.js'
import { avisarEspera } from './reservas.avisos.js'

const OBJECT_ID = /^[0-9a-f]{24}$/i
const agregarSchema = z.object({
    nombre: texto('El nombre', 2, 120),
    personas: z.number({ error: 'Indica cuántas personas son.' }).int({ error: 'Las personas deben ser un número entero.' })
        .min(1, { error: 'Debe ser al menos 1 persona.' }).max(MAX_PERSONAS_ESPERA, { error: `No pueden ser más de ${MAX_PERSONAS_ESPERA} personas.` }),
    telefono: telefono(),
}).strict()
const sentarSchema = z.object({
    mesaId: z.string({ error: 'Elige la mesa.' }).regex(OBJECT_ID, { error: 'La mesa no es válida.' }),
    meseroId: z.string().regex(OBJECT_ID, { error: 'El mesero no es válido.' }).optional(),
}).strict()

const exigir = (sesion, clave) => {
    if (!tienePermiso(sesion?.permisos || [], clave)) {
        throw new AppError(403, 'FORBIDDEN', 'No tienes permiso para realizar esta acción.', { requiere: [clave] })
    }
}
const validar = (esquema, datos) => {
    const r = esquema.safeParse(datos ?? {})
    if (!r.success) throw new AppError(400, 'VALIDATION_ERROR', r.error.issues[0]?.message || 'Datos no válidos', detallesZod(r.error))
    return r.data
}
const noEncontrada = () => new AppError(404, 'ESPERA_NO_ENCONTRADA', 'Esa persona no está en la lista de espera.')
const noActiva = (estado) => new AppError(409, 'ESPERA_NO_ACTIVA', 'Esa persona ya no está esperando.', { estado })

export const formatoEspera = (e, ahora = new Date()) => ({
    id: String(e._id), nombre: e.nombre, personas: e.personas, telefono: e.telefono, estado: e.estado,
    // Mientras espera, contra la hora actual; sentada o retirada, hasta ese momento (no sigue subiendo)
    llegada: e.createdAt, minutosEsperando: Math.max(0, Math.floor(((e.sentadaEn || e.retiradaEn || ahora) - new Date(e.createdAt)) / 60_000)),
    mesa: e.mesa?.numero ? { id: String(e.mesa._id), numero: e.mesa.numero } : null,
    cuenta: e.cuenta ? String(e.cuenta) : null,
})

/** GET /staff/espera → { espera[] } de hoy, en orden de llegada */
export const listarEspera = async (sesion) => {
    exigir(sesion, 'reserva:ver')
    const ahora = new Date()
    const filas = await Espera.find({ dia: fechaLocal(ahora) }).sort({ createdAt: 1 }).limit(200).populate('mesa', 'numero').lean()
    return { espera: filas.map((e) => formatoEspera(e, ahora)) }
}

/** POST /staff/espera { nombre, personas, telefono } → 201 */
export const agregarEspera = async (datos, sesion) => {
    exigir(sesion, 'reserva:crear')
    const entrada = validar(agregarSchema, datos)
    const espera = await conTransaccion(async (session) => {
        const [creada] = await Espera.create([{ ...entrada, estado: 'esperando', dia: fechaLocal(), creadaPor: sesion.id }], { session })
        await registrarEvento({
            entidad: 'espera', entidadId: creada._id, tipo: 'espera_agregada', usuario: sesion.id, actor: sesion.rol || 'staff',
            datos: { personas: creada.personas }, session,
        })
        return creada
    })
    avisarEspera(espera._id)
    return formatoEspera(espera.toObject())
}

/**
 * POST /staff/espera/:id/sentar { mesaId, meseroId? } → 201 { espera, cuenta }. La persona pasa a «sentada» y se
 * abre la cuenta (comensales = personas) en la mesa, en una transacción: la mesa debe estar libre y no reservada
 * (409 MESA_NO_DISPONIBLE / MESA_RESERVADA); la escritura condicional sobre la espera choca con otro «Sentar».
 */
export const sentarEspera = async (id, datos, sesion) => {
    exigir(sesion, 'reserva:cambiar_estado')
    if (!OBJECT_ID.test(String(id))) throw noEncontrada()
    const { mesaId, meseroId } = validar(sentarSchema, datos)
    // Solo la lista de hoy: una espera de un día anterior no se sienta ni se retira (no sale en la lista)
    const previa = await Espera.findOne({ _id: id, dia: fechaLocal() }).select('personas estado').lean()
    if (!previa) throw noEncontrada()
    if (previa.estado !== 'esperando') throw noActiva(previa.estado)
    const apertura = await prepararApertura({ mesaId, comensales: previa.personas, ...(meseroId ? { meseroId } : {}) }, sesion)

    const resultado = await conTransaccion(async (session) => {
        const cuenta = await abrirEnTransaccion(apertura, sesion, session)
        const espera = await Espera.findOneAndUpdate(
            { _id: id, estado: 'esperando' },
            { $set: { estado: 'sentada', mesa: mesaId, cuenta: cuenta.id, sentadaEn: new Date() } },
            { returnDocument: 'after', session, runValidators: true },
        ).populate('mesa', 'numero').lean()
        if (!espera) {
            const actual = await Espera.findById(id).select('estado').session(session).lean()
            if (!actual) throw noEncontrada()
            throw noActiva(actual.estado)
        }
        await registrarEvento({
            entidad: 'espera', entidadId: espera._id, tipo: 'espera_sentada', usuario: sesion.id, actor: sesion.rol || 'staff',
            datos: { mesa: espera.mesa?.numero ?? null, cuenta: cuenta.codigo }, session,
        })
        return { espera: formatoEspera(espera), cuenta }
    })
    avisarEspera(resultado.espera.id)
    return resultado
}

/** PATCH /staff/espera/:id/retirar → la persona se fue sin sentarse */
export const retirarEspera = async (id, sesion) => {
    exigir(sesion, 'reserva:cambiar_estado')
    if (!OBJECT_ID.test(String(id))) throw noEncontrada()
    const retirada = await conTransaccion(async (session) => {
        const espera = await Espera.findOneAndUpdate(
            { _id: id, dia: fechaLocal(), estado: 'esperando' }, { $set: { estado: 'retirada', retiradaEn: new Date() } }, { returnDocument: 'after', session },
        ).lean()
        if (!espera) {
            const actual = await Espera.findOne({ _id: id, dia: fechaLocal() }).select('estado').session(session).lean()
            if (!actual) throw noEncontrada()
            throw noActiva(actual.estado)
        }
        await registrarEvento({ entidad: 'espera', entidadId: espera._id, tipo: 'espera_retirada', usuario: sesion.id, actor: sesion.rol || 'staff', session })
        return formatoEspera(espera)
    })
    avisarEspera(retirada.id)
    return retirada
}
