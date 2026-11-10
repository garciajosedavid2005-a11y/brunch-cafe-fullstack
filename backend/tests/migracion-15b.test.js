import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { up, down, MARCA, COLECCION_RESPALDO, PERMISOS_PARA_MESERO } from '../src/migraciones/m15b-quitar-roles.js'

// 1.5b · Se eliminan los roles anfitrion y compras: las tareas del anfitrión pasan al mesero
// (reserva:cambiar_estado, mesa:bloquear, mesa:unir, cuenta:transferir); sus usuarios pasan a
// mesero y los de compras a cliente. Reversible con --down.
const db = () => mongoose.connection.db
const roles = () => db().collection('rols')
const usuarios = () => db().collection('usuarios')
const rol = (nombre) => roles().findOne({ nombre })

const ANFITRION = { nombre: 'anfitrion', etiqueta: 'Anfitrión', descripcion: 'Recibe clientes y gestiona reservas.', esSistema: true,
    permisos: ['reserva:ver', 'reserva:cambiar_estado', 'mesa:ver', 'mesa:operar', 'mesa:bloquear', 'mesa:unir', 'cuenta:abrir', 'cuenta:transferir'] }
const COMPRAS = { nombre: 'compras', etiqueta: 'Compras', descripcion: 'Gestiona proveedores e inventario.', esSistema: true, permisos: [] }
const MESERO_ANTES = ['pedido:ver', 'pedido:cambiar_estado', 'reserva:ver', 'reserva:crear',
    'mesa:ver', 'mesa:operar', 'cuenta:abrir', 'cuenta:ver', 'comanda:tomar', 'comanda:enviar', 'cuenta:solicitar']

let contador = 0
const usuarioCon = async (rolDoc, extra = {}) => {
    contador += 1
    const { insertedId } = await usuarios().insertOne({
        nombre: 'U', apellido: String(contador), correo: `u${contador}@example.com`, contraseña: 'x', rol: rolDoc._id, activo: true, ...extra,
    })
    return insertedId
}

// BD como antes de 1.5b: los dos roles existen y el mesero tiene los permisos de 1.1
const comoAntes = async () => {
    await roles().deleteMany({ nombre: { $in: ['anfitrion', 'compras'] } })
    await roles().insertMany([{ ...ANFITRION }, { ...COMPRAS }])
    await roles().updateOne({ nombre: 'mesero' }, { $set: { permisos: MESERO_ANTES }, $unset: { [MARCA]: 1 } })
}

beforeEach(comoAntes)

describe('Migración 1.5b (quitar los roles anfitrion y compras)', () => {
    it('el mesero recibe exactamente las tareas del anfitrión', () => {
        expect(PERMISOS_PARA_MESERO).toEqual(['reserva:cambiar_estado', 'mesa:bloquear', 'mesa:unir', 'cuenta:transferir'])
    })

    it('--dry-run cuenta usuarios por rol y lo que haría, sin escribir', async () => {
        const anfitrion = await rol('anfitrion')
        const compras = await rol('compras')
        await usuarioCon(anfitrion)
        await usuarioCon(anfitrion)
        await usuarioCon(compras)
        const plan = await up(db(), { dryRun: true })
        expect(plan).toMatchObject({
            aplicado: false,
            usuarios: { anfitrion: 2, compras: 1 },
            mesero: { agregar: PERMISOS_PARA_MESERO },
            rolesAEliminar: ['anfitrion', 'compras'],
        })
        expect(await rol('anfitrion')).not.toBeNull()
        expect((await rol('mesero')).permisos).toEqual(MESERO_ANTES)
        expect(await usuarios().countDocuments({ rol: anfitrion._id })).toBe(2)
    })

    it('up pasa los usuarios, da los permisos al mesero, elimina los roles; es idempotente y down lo deja como estaba', async () => {
        const anfitrion = await rol('anfitrion')
        const compras = await rol('compras')
        const mesero = await rol('mesero')
        const cliente = await rol('cliente')
        const a1 = await usuarioCon(anfitrion)
        const c1 = await usuarioCon(compras, { activo: false })
        const otro = await usuarioCon(mesero)

        const r = await up(db())
        expect(r).toMatchObject({ aplicado: true, usuarios: { anfitrion: 1, compras: 1 } })
        expect((await usuarios().findOne({ _id: a1 })).rol).toEqual(mesero._id)
        expect((await usuarios().findOne({ _id: c1 })).rol).toEqual(cliente._id)
        expect((await usuarios().findOne({ _id: c1 })).activo).toBe(false) // no se toca nada más
        expect((await usuarios().findOne({ _id: otro }))[MARCA]).toBeUndefined()
        expect((await rol('mesero')).permisos).toEqual([...MESERO_ANTES, ...PERMISOS_PARA_MESERO])
        expect(await rol('anfitrion')).toBeNull()
        expect(await rol('compras')).toBeNull()
        expect(await db().collection(COLECCION_RESPALDO).countDocuments()).toBe(2)

        const otraVez = await up(db())
        expect(otraVez).toMatchObject({ usuarios: { anfitrion: 0, compras: 0 }, mesero: { agregar: [] }, rolesAEliminar: [] })
        expect((await rol('mesero')).permisos).toEqual([...MESERO_ANTES, ...PERMISOS_PARA_MESERO])

        const planAbajo = await down(db(), { dryRun: true })
        expect(planAbajo).toMatchObject({ aplicado: false, rolesARestaurar: ['anfitrion', 'compras'], usuarios: 2, mesero: { quitar: PERMISOS_PARA_MESERO } })
        expect(await rol('anfitrion')).toBeNull()

        await down(db())
        const anfitrionDeVuelta = await rol('anfitrion')
        expect(anfitrionDeVuelta).toMatchObject({ _id: anfitrion._id, permisos: ANFITRION.permisos, esSistema: true })
        expect((await rol('compras'))._id).toEqual(compras._id)
        expect((await usuarios().findOne({ _id: a1 })).rol).toEqual(anfitrion._id)
        expect((await usuarios().findOne({ _id: c1 })).rol).toEqual(compras._id)
        expect((await usuarios().findOne({ _id: a1 }))[MARCA]).toBeUndefined()
        expect((await rol('mesero')).permisos).toEqual(MESERO_ANTES)
        expect((await rol('mesero'))[MARCA]).toBeUndefined()
        expect(await db().listCollections({ name: COLECCION_RESPALDO }).toArray()).toHaveLength(0)

        // up → down → up deja lo mismo que el primer up
        await up(db())
        expect((await usuarios().findOne({ _id: a1 })).rol).toEqual(mesero._id)
        expect(await rol('anfitrion')).toBeNull()
    })

    it('si el admin ya le había dado al mesero alguno de esos permisos, down solo quita los que agregó up', async () => {
        await roles().updateOne({ nombre: 'mesero' }, { $push: { permisos: 'mesa:unir' } })
        const r = await up(db())
        expect(r.mesero.agregar).toEqual(['reserva:cambiar_estado', 'mesa:bloquear', 'cuenta:transferir'])
        await down(db())
        expect((await rol('mesero')).permisos).toEqual([...MESERO_ANTES, 'mesa:unir'])
    })

    it('down respeta los cambios posteriores del admin y se detiene si otro rol ocupa el nombre', async () => {
        const anfitrion = await rol('anfitrion')
        const a1 = await usuarioCon(anfitrion)
        const a2 = await usuarioCon(anfitrion)
        await up(db())
        const cajero = await rol('cajero')
        await usuarios().updateOne({ _id: a2 }, { $set: { rol: cajero._id } }) // el admin lo cambió después

        await roles().insertOne({ nombre: 'anfitrion', permisos: [] }) // otro rol con el mismo nombre
        await expect(down(db())).rejects.toThrow(/Ya existe otro rol/)
        expect((await usuarios().findOne({ _id: a1 })).rol).toEqual((await rol('mesero'))._id) // no escribió nada
        await roles().deleteOne({ nombre: 'anfitrion' })

        const plan = await down(db(), { dryRun: true })
        expect(plan).toMatchObject({ usuarios: 1, cambiadosDespues: 1 })
        await down(db())
        expect((await usuarios().findOne({ _id: a1 })).rol).toEqual(anfitrion._id)
        const a2Final = await usuarios().findOne({ _id: a2 })
        expect(a2Final.rol).toEqual(cajero._id)
        expect(a2Final[MARCA]).toBeUndefined()
    })

    it('una copia que quedó de antes no bloquea up; down sin la copia se detiene sin dejar usuarios sin rol', async () => {
        const anfitrion = await rol('anfitrion')
        await db().collection(COLECCION_RESPALDO).insertOne({ _id: anfitrion._id, rol: { ...anfitrion, etiqueta: 'vieja' } })
        const a1 = await usuarioCon(anfitrion)
        expect((await up(db())).aplicado).toBe(true)
        expect((await db().collection(COLECCION_RESPALDO).findOne({ _id: anfitrion._id })).rol.etiqueta).toBe('Anfitrión')

        await db().collection(COLECCION_RESPALDO).drop() // alguien borró la copia a mano
        await expect(down(db())).rejects.toThrow(/Faltan 1 rol/)
        expect((await usuarios().findOne({ _id: a1 })).rol).toEqual((await rol('mesero'))._id)
    })

    it('sin los roles (BD nueva) no hace nada más que dar los permisos al mesero', async () => {
        await roles().deleteMany({ nombre: { $in: ['anfitrion', 'compras'] } })
        const r = await up(db())
        expect(r).toMatchObject({ usuarios: { anfitrion: 0, compras: 0 }, rolesAEliminar: [] })
        expect(await db().listCollections({ name: COLECCION_RESPALDO }).toArray()).toHaveLength(0)
    })

    it('se detiene sin escribir si falta el rol mesero o el cliente', async () => {
        await roles().updateOne({ nombre: 'mesero' }, { $set: { nombre: 'mesero-renombrado' } })
        await expect(up(db())).rejects.toThrow(/mesero/)
        expect(await rol('anfitrion')).not.toBeNull()
        await roles().updateOne({ nombre: 'mesero-renombrado' }, { $set: { nombre: 'mesero' } })
    })
})
