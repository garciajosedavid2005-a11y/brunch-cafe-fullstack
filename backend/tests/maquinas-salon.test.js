import { describe, it, expect } from 'vitest'
import { crearMaquina } from '../src/modulos/compartido/maquinaEstados.js'
import {
    MAQUINA_MESA, MAQUINA_CUENTA, MAQUINA_ITEM, ESTADOS_MESA, ESTADOS_CUENTA, ESTADOS_ITEM,
} from '../src/modulos/compartido/estados.js'
import { precioUnitario, calcularItem, subtotalRonda, totalesCuenta } from '../src/modulos/salon/totales.js'

// 1.4 · Máquinas de estado de mesa, cuenta e ítem (F1-2, F1-6, F1-13, D1–D4) y totales.
const codigoDe = (fn) => {
    try {
        fn()
    } catch (error) {
        return { status: error.status, code: error.code }
    }
    return null
}

describe('Motor de máquinas de estado', () => {
    const maquina = crearMaquina({
        nombre: 'prueba',
        estados: ['a', 'b', 'c'],
        finales: ['c'],
        transiciones: [
            { de: ['a'], a: 'b', permiso: 'mesa:operar' },
            { de: ['b'], a: 'c', permiso: 'mesa:bloquear', requiereMotivo: true },
            { de: ['b'], a: 'a', via: 'sistema' },
        ],
    })

    it('devuelve la transición y el motivo limpio; con «*» vale cualquier permiso', () => {
        expect(maquina.validar('a', 'b', { permisos: ['mesa:operar'] }).transicion.a).toBe('b')
        expect(maquina.validar('b', 'c', { permisos: ['*'], motivo: '  roto  ' }).motivo).toBe('roto')
    })

    it('errores con los mismos códigos que pedidos y reservas', () => {
        expect(codigoDe(() => maquina.validar('a', 'z', { permisos: ['*'] }))).toEqual({ status: 400, code: 'ESTADO_INVALIDO' })
        expect(codigoDe(() => maquina.validar('c', 'a', { permisos: ['*'] }))).toEqual({ status: 409, code: 'ESTADO_FINAL' })
        expect(codigoDe(() => maquina.validar('a', 'c', { permisos: ['*'] }))).toEqual({ status: 409, code: 'TRANSICION_INVALIDA' })
        expect(codigoDe(() => maquina.validar('a', 'b', { permisos: [] }))).toEqual({ status: 403, code: 'FORBIDDEN' })
        expect(codigoDe(() => maquina.validar('b', 'c', { permisos: ['*'], motivo: '  ' }))).toEqual({ status: 400, code: 'MOTIVO_REQUERIDO' })
    })

    it('las transiciones del sistema no se pueden pedir como staff, y al revés', () => {
        expect(codigoDe(() => maquina.validar('b', 'a', { permisos: ['*'] }))).toEqual({ status: 409, code: 'TRANSICION_INVALIDA' })
        expect(maquina.validar('b', 'a', { via: 'sistema' }).transicion.a).toBe('a')
        expect(codigoDe(() => maquina.validar('a', 'b', { via: 'sistema' }))).toEqual({ status: 409, code: 'TRANSICION_INVALIDA' })
    })

    it('rechaza al cargar una definición incoherente', () => {
        const definir = (transiciones, finales = ['c']) => () => crearMaquina({ nombre: 'x', estados: ['a', 'b', 'c'], finales, transiciones })
        expect(definir([{ de: ['a'], a: 'z', permiso: 'mesa:operar' }])).toThrow(/desconocido/)
        expect(definir([{ de: ['c'], a: 'a', permiso: 'mesa:operar' }])).toThrow(/final/)
        expect(definir([{ de: ['a'], a: 'b', permiso: 'no:existe' }])).toThrow(/permiso/)
        expect(definir([{ de: ['a'], a: 'b' }])).toThrow(/permiso/)
    })
})

describe('Máquina de la mesa (F1-2)', () => {
    it('estados del plan', () => {
        expect(ESTADOS_MESA).toEqual(['libre', 'ocupada', 'cuenta_pedida', 'por_limpiar', 'bloqueada'])
    })

    it('a mano solo: por_limpiar → libre (mesa:operar) y libre ↔ bloqueada (mesa:bloquear, con motivo)', () => {
        const manual = (de) => MAQUINA_MESA.disponibles(de, { via: 'manual', permisos: ['*'] }).map((t) => t.a)
        expect(manual('por_limpiar')).toEqual(['libre'])
        expect(manual('libre')).toEqual(['bloqueada'])
        expect(manual('bloqueada')).toEqual(['libre'])
        expect(manual('ocupada')).toEqual([])
        expect(manual('cuenta_pedida')).toEqual([])
        expect(codigoDe(() => MAQUINA_MESA.validar('libre', 'bloqueada', { via: 'manual', permisos: ['mesa:bloquear'] })))
            .toEqual({ status: 400, code: 'MOTIVO_REQUERIDO' })
        expect(codigoDe(() => MAQUINA_MESA.validar('por_limpiar', 'libre', { via: 'manual', permisos: ['mesa:bloquear'] })))
            .toEqual({ status: 403, code: 'FORBIDDEN' })
    })

    it('una mesa ocupada o con la cuenta pedida no pasa a por_limpiar a mano (solo al cerrar o cancelar su cuenta)', () => {
        for (const de of ['ocupada', 'cuenta_pedida']) {
            expect(codigoDe(() => MAQUINA_MESA.validar(de, 'por_limpiar', { via: 'manual', permisos: ['*'] })))
                .toEqual({ status: 409, code: 'TRANSICION_INVALIDA' })
            expect(MAQUINA_MESA.validar(de, 'por_limpiar', { via: 'sistema' }).transicion.a).toBe('por_limpiar')
        }
        expect(codigoDe(() => MAQUINA_MESA.validar('libre', 'ocupada', { via: 'manual', permisos: ['*'] })))
            .toEqual({ status: 409, code: 'TRANSICION_INVALIDA' })
    })
})

describe('Máquina de la cuenta', () => {
    it('estados y finales', () => {
        expect(ESTADOS_CUENTA).toEqual(['abierta', 'cuenta_pedida', 'cerrada', 'cerrada_sin_cobro', 'cancelada'])
        for (const final of ['cerrada', 'cerrada_sin_cobro', 'cancelada']) expect(MAQUINA_CUENTA.esFinal(final)).toBe(true)
    })

    it('cancelar solo desde abierta, con cuenta:abrir y motivo (D4)', () => {
        expect(MAQUINA_CUENTA.validar('abierta', 'cancelada', { permisos: ['cuenta:abrir'], motivo: 'se fueron' }).motivo).toBe('se fueron')
        expect(codigoDe(() => MAQUINA_CUENTA.validar('cuenta_pedida', 'cancelada', { permisos: ['*'], motivo: 'x' })))
            .toEqual({ status: 409, code: 'TRANSICION_INVALIDA' })
        expect(codigoDe(() => MAQUINA_CUENTA.validar('abierta', 'cancelada', { permisos: ['cuenta:abrir'] })))
            .toEqual({ status: 400, code: 'MOTIVO_REQUERIDO' })
    })

    it('cerrar sin cobro: solo con cuenta:cerrar_sin_cobro y motivo (F1-13); reabrir con comanda:tomar (D2)', () => {
        expect(codigoDe(() => MAQUINA_CUENTA.validar('abierta', 'cerrada_sin_cobro', { permisos: ['cuenta:abrir', 'comanda:tomar'], motivo: 'x' })))
            .toEqual({ status: 403, code: 'FORBIDDEN' })
        expect(MAQUINA_CUENTA.validar('cuenta_pedida', 'cerrada_sin_cobro', { permisos: ['*'], motivo: 'cortesía' }).transicion.a).toBe('cerrada_sin_cobro')
        expect(MAQUINA_CUENTA.validar('cuenta_pedida', 'abierta', { permisos: ['comanda:tomar'] }).transicion.a).toBe('abierta')
        expect(codigoDe(() => MAQUINA_CUENTA.validar('cancelada', 'abierta', { permisos: ['*'] })))
            .toEqual({ status: 409, code: 'ESTADO_FINAL' })
    })
})

describe('Máquina del ítem (F1-6, D1)', () => {
    it('estados del plan', () => {
        expect(ESTADOS_ITEM).toEqual(['borrador', 'enviado', 'en_preparacion', 'listo', 'servido', 'anulado'])
    })

    it('se anula desde enviado, en preparación o listo con item:anular y motivo; servido no', () => {
        for (const de of ['enviado', 'en_preparacion', 'listo']) {
            expect(MAQUINA_ITEM.validar(de, 'anulado', { permisos: ['item:anular'], motivo: 'demora' }).transicion.a).toBe('anulado')
        }
        expect(codigoDe(() => MAQUINA_ITEM.validar('enviado', 'anulado', { permisos: ['comanda:tomar', 'comanda:enviar'], motivo: 'x' })))
            .toEqual({ status: 403, code: 'FORBIDDEN' })
        expect(codigoDe(() => MAQUINA_ITEM.validar('servido', 'anulado', { permisos: ['*'], motivo: 'x' }))?.status).toBe(409)
        // En borrador no se anula: se quita del borrador
        expect(codigoDe(() => MAQUINA_ITEM.validar('borrador', 'anulado', { permisos: ['*'], motivo: 'x' })))
            .toEqual({ status: 409, code: 'TRANSICION_INVALIDA' })
    })

    // 2.2 · Los pasos de cocina y servir ya no son del sistema: los pide el staff con su permiso
    it('cocina y barra con item:preparar; servir con item:servir; ya no por la vía del sistema', () => {
        expect(codigoDe(() => MAQUINA_ITEM.validar('enviado', 'en_preparacion', { via: 'sistema' }))).toEqual({ status: 409, code: 'TRANSICION_INVALIDA' })
        expect(codigoDe(() => MAQUINA_ITEM.validar('enviado', 'en_preparacion', { permisos: ['comanda:tomar'] }))).toEqual({ status: 403, code: 'FORBIDDEN' })
        expect(MAQUINA_ITEM.validar('enviado', 'en_preparacion', { permisos: ['item:preparar'] }).transicion.a).toBe('en_preparacion')
        expect(MAQUINA_ITEM.validar('en_preparacion', 'listo', { permisos: ['item:preparar'] }).transicion.a).toBe('listo')
        expect(MAQUINA_ITEM.validar('listo', 'en_preparacion', { permisos: ['item:preparar'] }).transicion.a).toBe('en_preparacion')
        expect(codigoDe(() => MAQUINA_ITEM.validar('listo', 'servido', { permisos: ['item:preparar'] }))).toEqual({ status: 403, code: 'FORBIDDEN' })
        expect(MAQUINA_ITEM.validar('listo', 'servido', { permisos: ['item:servir'] }).transicion.a).toBe('servido')
        expect(codigoDe(() => MAQUINA_ITEM.validar('enviado', 'listo', { permisos: ['*'] }))).toEqual({ status: 409, code: 'TRANSICION_INVALIDA' })
    })
})

describe('Totales (enteros en COP, siempre desde los ítems)', () => {
    const mods = [{ precioExtra: 2000 }, { precioExtra: 0 }, { precioExtra: 3500 }]

    it('precio unitario = base + recargos; subtotal = unitario × cantidad', () => {
        expect(precioUnitario(12000, mods)).toBe(17500)
        expect(calcularItem({ precioBase: 12000, modificadores: mods, cantidad: 3 })).toEqual({ precioUnitario: 17500, subtotal: 52500 })
    })

    it('la ronda no suma los ítems anulados', () => {
        expect(subtotalRonda([
            { subtotal: 10000, estado: 'enviado' },
            { subtotal: 5000, estado: 'anulado' },
            { subtotal: 3000, estado: 'listo' },
        ])).toBe(13000)
    })

    it('cuenta: subtotal = lo enviado no anulado; pendiente = el borrador; total = subtotal mientras impuestos, propina y descuento sean null', () => {
        const comandas = [
            { estado: 'enviada', items: [{ subtotal: 10000, estado: 'enviado' }, { subtotal: 4000, estado: 'anulado' }] },
            { estado: 'enviada', items: [{ subtotal: 2500, estado: 'servido' }] },
            { estado: 'borrador', items: [{ subtotal: 7000, estado: 'borrador' }] },
        ]
        expect(totalesCuenta(comandas)).toEqual({ subtotal: 12500, pendiente: 7000, total: 12500 })
        expect(totalesCuenta([])).toEqual({ subtotal: 0, pendiente: 0, total: 0 })
    })

    it('rechaza montos que no son enteros seguros', () => {
        expect(() => precioUnitario(1000.5, [])).toThrow()
        expect(() => calcularItem({ precioBase: Number.MAX_SAFE_INTEGER, modificadores: [], cantidad: 2 })).toThrow()
    })
})
