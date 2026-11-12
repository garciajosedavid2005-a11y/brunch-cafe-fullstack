import { describe, it, expect } from 'vitest'
import Rol from '../src/modulos/identidad/rol.model.js'
import Permiso from '../src/modulos/identidad/permiso.model.js'
import { CLAVES_ASIGNABLES } from '../src/modulos/identidad/permisos.js'

// 1.1 · Permisos de salón (PLAN_FASE_1 §1.1, F1-2, F1-6, F1-8, F1-13)
const SALON = [
    'salon:configurar', 'mesa:ver', 'mesa:operar', 'mesa:bloquear', 'mesa:unir',
    'cuenta:abrir', 'cuenta:ver', 'cuenta:transferir', 'comanda:tomar', 'comanda:enviar',
    'item:anular', 'cuenta:solicitar', 'cuenta:cerrar_sin_cobro',
]

const permisosDe = async (nombre) => (await Rol.findOne({ nombre }).lean()).permisos

describe('Permisos de salón (1.1)', () => {
    it('están en el catálogo, son asignables y se reflejan en la colección Permiso', async () => {
        for (const clave of SALON) expect(CLAVES_ASIGNABLES).toContain(clave)
        const guardados = await Permiso.find({ clave: { $in: SALON } }).lean()
        expect(guardados.map((p) => p.clave).sort()).toEqual([...SALON].sort())
        expect(guardados.every((p) => p.reservado === false)).toBe(true)
    })

    // 1.5b: el mesero asume también las tareas del anfitrión (rol eliminado)
    it('mesero: mesas (ver, operar, bloquear, unir), cuentas (abrir, ver, transferir, solicitar), comandas, reservas y (2.1) servir y agotar', async () => {
        expect(await permisosDe('mesero')).toEqual([
            'pedido:ver', 'pedido:cambiar_estado', 'reserva:ver', 'reserva:crear', 'reserva:cambiar_estado',
            'mesa:ver', 'mesa:operar', 'mesa:bloquear', 'mesa:unir', 'cuenta:abrir', 'cuenta:ver', 'cuenta:transferir',
            'comanda:tomar', 'comanda:enviar', 'cuenta:solicitar',
            'item:servir', 'producto:agotar', // 2.1 (F2-2, F2-5)
        ])
    })

    it('ya no existen los roles anfitrion ni compras (1.5b)', async () => {
        expect(await Rol.countDocuments({ nombre: { $in: ['anfitrion', 'compras'] } })).toBe(0)
    })

    it('item:anular, cuenta:cerrar_sin_cobro y salon:configurar no los tiene ningún rol de staff (solo el admin con "*")', async () => {
        const roles = await Rol.find({ nombre: { $ne: 'admin' } }).lean()
        for (const rol of roles) {
            for (const clave of ['item:anular', 'cuenta:cerrar_sin_cobro', 'salon:configurar']) {
                expect(rol.permisos, `${rol.nombre} no debe tener ${clave}`).not.toContain(clave)
            }
        }
        expect(await permisosDe('admin')).toEqual(['*'])
    })

    it('el seed no pisa los permisos de un rol de staff ya existente', async () => {
        await Rol.updateOne({ nombre: 'mesero' }, { permisos: ['pedido:ver'] })
        const { sembrarRoles } = await import('../src/seeds/base.js')
        await sembrarRoles()
        expect(await permisosDe('mesero')).toEqual(['pedido:ver'])
    })
})
