// 3.8 · Eliminar una cuenta del personal (Admin › Usuarios, usuario:gestionar).
// Sin historial → borrado real. Con historial → archivado: inactiva, tokenVersion + 1 (pierde el acceso al
// instante), correo liberado (se guarda aparte en correoArchivado), fuera de listas y selectores, y su
// nombre sigue en el historial como «Nombre A. (eliminado)» (compartido/nombres.js).
import mongoose from 'mongoose'
import Usuario from './usuario.model.js'
import Evento from '../compartido/evento.model.js'
import Cuenta from '../salon/cuenta.model.js'
import Comanda from '../salon/comanda.model.js'
import Reserva from '../salon/reserva.model.js'
import Comprobante from '../caja/comprobante.model.js'
import Pedido from '../pedidos/pedido.model.js'
import Comentario from '../catalogo/comentario.model.js'
import Configuracion from '../configuracion/configuracion.model.js'
import TurnoCaja from '../caja/turno.model.js'
import NotaCredito from '../caja/notaCredito.model.js'
import Espera from '../salon/espera.model.js'
import { conTransaccion } from '../compartido/transacciones.js'
import { AppError, notFound } from '../compartido/errors.js'
import { ROL_ADMIN, ROL_CLIENTE, puedeOtorgarRol } from './permisos.js'
import { invalidarSesionUsuario } from './sesiones.js'
import { publicarRevocacion } from '../tiempoReal/bus.js'
import { ESTADOS_CUENTA_ABIERTA } from '../compartido/estadosSalon.js'
import { nombreCorto } from '../compartido/nombres.js'
import { asegurarBloqueoAdmins, comprobarQuedaOtroAdmin } from './ultimoAdmin.js'

// Dirección interna que ocupa el correo de una cuenta archivada (dominio .invalid: nunca recibe correo)
const correoInterno = (id) => `eliminado.${id}@archivado.invalid`

/** ¿Dejó huella en el historial? Una consulta por colección, solo con `exists` (corta en el primero). */
export const tieneHistorial = async (id, session) => {
    const consultas = [
        Evento.exists({ usuario: id }),
        // Recibió o entregó una cuenta (el detalle de la cuenta muestra los dos nombres)
        Evento.exists({ tipo: 'cuenta_transferida', $or: [{ 'datos.de': id }, { 'datos.a': id }] }),
        Cuenta.exists({ $or: [{ mesero: id }, { abiertaPor: id }, { cerradaPor: id }] }),
        Comanda.exists({ $or: [{ creadaPor: id }, { enviadaPor: id }, { 'items.agregadoPor': id },
            { 'items.iniciadoPor': id }, { 'items.listoPor': id }, { 'items.servidoPor': id }, { 'items.anulacion.por': id }] }),
        Comprobante.exists({ $or: [{ 'mesero.id': id }, { 'cajero.id': id }] }),
        Reserva.exists({ $or: [{ usuario: id }, { registradaPor: id }] }),
        Pedido.exists({ usuario: id }),
        Comentario.exists({ usuario: id }),
        Configuracion.exists({ actualizadoPor: id }),
        // 3b · Turnos de caja que abrió o cerró y notas crédito que emitió
        TurnoCaja.exists({ $or: [{ 'abiertoPor.id': id }, { 'cerradoPor.id': id }] }),
        NotaCredito.exists({ 'autor.id': id }),
        // 4.4 · Quien agregó a alguien a la lista de espera
        Espera.exists({ creadaPor: id }),
    ]
    // En secuencia: dentro de una transacción no se lanzan operaciones en paralelo con la misma sesión
    for (const consulta of consultas) {
        if (await consulta.session(session ?? null)) return true
    }
    return false
}

/** DELETE /api/v1/admin/usuarios/:id → { id, resultado: 'eliminado' | 'archivado' } */
export const eliminarUsuario = async (id, sesion) => {
    if (!mongoose.isValidObjectId(id)) throw notFound('Usuario no encontrado')
    const usuario = await Usuario.findById(id).populate('rol', 'nombre etiqueta permisos').lean()
    if (!usuario || usuario.eliminado === true) throw notFound('Usuario no encontrado')

    if (!usuario.rol) throw new AppError(409, 'ROL_NO_VALIDO', 'La cuenta no tiene un rol válido: asígnale uno antes de eliminarla.')
    if (usuario.rol.nombre === ROL_CLIENTE) {
        throw new AppError(409, 'CUENTA_CLIENTE', 'Solo se pueden eliminar cuentas del personal; las de clientes no.')
    }
    if (String(usuario._id) === String(sesion.id)) {
        throw new AppError(409, 'AUTO_BLOQUEO', 'No puedes eliminar tu propia cuenta.')
    }
    if (!puedeOtorgarRol(sesion.permisos || [], usuario.rol.permisos || [])) {
        throw new AppError(403, 'FORBIDDEN', 'No puedes eliminar una cuenta que tiene permisos que tú no tienes.')
    }

    const esAdminActivo = usuario.rol.nombre === ROL_ADMIN && usuario.activo !== false
    if (esAdminActivo) await asegurarBloqueoAdmins()

    const nombre = nombreCorto(usuario)
    const datos = { nombre, rol: usuario.rol.nombre }
    const resultado = await conTransaccion(async (session) => {
        // Primero se escribe en el usuario: abrir o transferir una cuenta a su nombre, o editarlo, también
        // escriben en él (cuentas.service, PATCH), así que una operación simultánea choca (WriteConflict) y se
        // reintenta en vez de pasar por encima. Se relee aquí para usar su correo vigente.
        const vigente = await Usuario.findOneAndUpdate(
            { _id: usuario._id, eliminado: { $ne: true } }, { $currentDate: { updatedAt: true } },
            { session, projection: { correo: 1 } },
        ).lean()
        if (!vigente) throw notFound('Usuario no encontrado')
        if (esAdminActivo) await comprobarQuedaOtroAdmin(usuario.rol._id, usuario._id, session)
        const abiertas = await Cuenta.countDocuments({ mesero: usuario._id, estado: { $in: ESTADOS_CUENTA_ABIERTA } }).session(session)
        if (abiertas > 0) {
            throw new AppError(409, 'CUENTAS_ABIERTAS',
                `Tiene ${abiertas === 1 ? 'una cuenta abierta' : `${abiertas} cuentas abiertas`}: transfiere sus cuentas primero.`,
                { cuentasAbiertas: abiertas })
        }

        const evento = { entidad: 'usuario', entidadId: usuario._id, usuario: sesion.id, actor: sesion.rol || 'admin', datos }
        if (!(await tieneHistorial(usuario._id, session))) {
            const borrado = await Usuario.deleteOne({ _id: usuario._id, eliminado: { $ne: true } }, { session })
            if (borrado.deletedCount !== 1) throw notFound('Usuario no encontrado')
            await Evento.create([{ ...evento, tipo: 'usuario_eliminado' }], { session })
            return 'eliminado'
        }

        const archivado = await Usuario.updateOne(
            { _id: usuario._id, eliminado: { $ne: true } },
            {
                $set: {
                    eliminado: true, eliminadoEn: new Date(), activo: false,
                    correo: correoInterno(usuario._id), correoArchivado: vigente.correo,
                },
                $inc: { tokenVersion: 1 },
                $unset: { passwordResetTokenHash: '', passwordResetExpiresAt: '', contraseñaPendiente: '' },
            },
            { session },
        )
        if (archivado.matchedCount !== 1) throw notFound('Usuario no encontrado')
        await Evento.create([{ ...evento, tipo: 'usuario_archivado' }], { session })
        return 'archivado'
    })

    // Sin acceso al instante: fuera de la caché de sesiones y cierre de sus flujos en vivo (SSE)
    invalidarSesionUsuario(usuario._id)
    publicarRevocacion(usuario._id)
    return { id: String(usuario._id), resultado }
}
