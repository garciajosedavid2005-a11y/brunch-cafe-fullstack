// Reglas puras de la máquina de transiciones (sin BD)
import { describe, it, expect } from 'vitest'
import {
    CATALOGO_ESTADOS, TRANSICIONES, TIPOS_ESTADO, esEstadoFinal, transicionesDisponibles, validarTransicion,
} from '../src/libs/estados.js'

const ADMIN = ['*']
const MESERO = ['pedido:ver', 'pedido:cambiar_estado']

const codigoError = (fn) => {
    try {
        fn()
    } catch (error) {
        return { status: error.status, code: error.code }
    }
    return null
}

describe('Catálogo de estados', () => {
    it('define los estados acordados para pedido y reserva', () => {
        expect(CATALOGO_ESTADOS.pedido.map((e) => e.codigo)).toEqual(
            ['pendiente', 'confirmado', 'en_preparacion', 'listo', 'en_camino', 'entregado', 'cancelado'])
        expect(CATALOGO_ESTADOS.reserva.map((e) => e.codigo)).toEqual(
            ['pendiente', 'confirmada', 'sentada', 'completada', 'cancelada', 'no_show'])
    })

    it('marca los finales', () => {
        expect(['entregado', 'cancelado'].every((c) => esEstadoFinal('pedido', c))).toBe(true)
        expect(['completada', 'cancelada', 'no_show'].every((c) => esEstadoFinal('reserva', c))).toBe(true)
        expect(esEstadoFinal('pedido', 'listo')).toBe(false)
    })

    it('ninguna transición sale de un estado final y todas las de staff declaran permiso', () => {
        for (const tipo of TIPOS_ESTADO) {
            for (const t of TRANSICIONES[tipo]) {
                expect(t.de.some((c) => esEstadoFinal(tipo, c))).toBe(false)
                if (t.actor === 'staff') expect(t.permiso).toBeTruthy()
            }
        }
    })
})

describe('Transiciones de pedido', () => {
    it('flujo de domicilio completo en orden', () => {
        const flujo = ['pendiente', 'confirmado', 'en_preparacion', 'listo', 'en_camino', 'entregado']
        for (let i = 0; i < flujo.length - 1; i++) {
            expect(() => validarTransicion('pedido', flujo[i], flujo[i + 1], { permisos: MESERO })).not.toThrow()
        }
    })

    it('no permite saltar etapas ni retroceder', () => {
        expect(codigoError(() => validarTransicion('pedido', 'pendiente', 'listo', { permisos: ADMIN })))
            .toEqual({ status: 409, code: 'TRANSICION_INVALIDA' })
        expect(codigoError(() => validarTransicion('pedido', 'listo', 'confirmado', { permisos: ADMIN })))
            .toEqual({ status: 409, code: 'TRANSICION_INVALIDA' })
    })

    it('domicilio no pasa de listo a entregado; para llevar sí (y no va en camino)', () => {
        expect(codigoError(() => validarTransicion('pedido', 'listo', 'entregado', { permisos: ADMIN })))
            .toEqual({ status: 409, code: 'TRANSICION_INVALIDA' })
        const paraLlevar = { modalidad: 'para_llevar' }
        expect(() => validarTransicion('pedido', 'listo', 'entregado', { permisos: ADMIN, contexto: paraLlevar })).not.toThrow()
        expect(codigoError(() => validarTransicion('pedido', 'listo', 'en_camino', { permisos: ADMIN, contexto: paraLlevar })))
            .toEqual({ status: 409, code: 'TRANSICION_INVALIDA' })
    })

    it('staff cancela solo en pendiente o confirmado, con permiso pedido:cancelar y motivo', () => {
        expect(codigoError(() => validarTransicion('pedido', 'pendiente', 'cancelado', { permisos: MESERO, motivo: 'x' })))
            .toEqual({ status: 403, code: 'FORBIDDEN' })
        expect(codigoError(() => validarTransicion('pedido', 'confirmado', 'cancelado', { permisos: ['pedido:cancelar'] })))
            .toEqual({ status: 400, code: 'MOTIVO_REQUERIDO' })
        expect(codigoError(() => validarTransicion('pedido', 'confirmado', 'cancelado', { permisos: ['pedido:cancelar'], motivo: '   ' })))
            .toEqual({ status: 400, code: 'MOTIVO_REQUERIDO' })
        expect(validarTransicion('pedido', 'confirmado', 'cancelado', { permisos: ['pedido:cancelar'], motivo: 'Sin insumos' }).motivo)
            .toBe('Sin insumos')
        expect(codigoError(() => validarTransicion('pedido', 'en_preparacion', 'cancelado', { permisos: ADMIN, motivo: 'x' })))
            .toEqual({ status: 409, code: 'TRANSICION_INVALIDA' })
    })

    it('el cliente solo cancela en pendiente', () => {
        expect(validarTransicion('pedido', 'pendiente', 'cancelado', { actor: 'cliente' }).motivo).toBe('cancelado por cliente')
        expect(codigoError(() => validarTransicion('pedido', 'confirmado', 'cancelado', { actor: 'cliente' })))
            .toEqual({ status: 409, code: 'TRANSICION_INVALIDA' })
        expect(codigoError(() => validarTransicion('pedido', 'pendiente', 'confirmado', { actor: 'cliente' })))
            .toEqual({ status: 409, code: 'TRANSICION_INVALIDA' })
    })

    it('un estado final no se reabre', () => {
        for (const de of ['entregado', 'cancelado']) {
            expect(codigoError(() => validarTransicion('pedido', de, 'pendiente', { permisos: ADMIN })))
                .toEqual({ status: 409, code: 'ESTADO_FINAL' })
        }
    })

    it('estado de destino desconocido → 400', () => {
        expect(codigoError(() => validarTransicion('pedido', 'pendiente', 'Recibido', { permisos: ADMIN })))
            .toEqual({ status: 400, code: 'ESTADO_INVALIDO' })
    })

    it('las opciones disponibles dependen de los permisos', () => {
        expect(transicionesDisponibles('pedido', 'pendiente', { permisos: MESERO }).map((t) => t.a)).toEqual(['confirmado'])
        expect(transicionesDisponibles('pedido', 'pendiente', { permisos: ADMIN }).map((t) => t.a)).toEqual(['confirmado', 'cancelado'])
        expect(transicionesDisponibles('pedido', 'entregado', { permisos: ADMIN })).toEqual([])
    })
})

describe('Transiciones de reserva', () => {
    const ANFITRION = ['reserva:ver', 'reserva:cambiar_estado']

    it('flujo completo: pendiente → confirmada → sentada → completada', () => {
        const flujo = ['pendiente', 'confirmada', 'sentada', 'completada']
        for (let i = 0; i < flujo.length - 1; i++) {
            expect(() => validarTransicion('reserva', flujo[i], flujo[i + 1], { permisos: ANFITRION })).not.toThrow()
        }
    })

    it('no_show solo desde confirmada; cancelar desde pendiente o confirmada', () => {
        expect(() => validarTransicion('reserva', 'confirmada', 'no_show', { permisos: ANFITRION })).not.toThrow()
        expect(codigoError(() => validarTransicion('reserva', 'pendiente', 'no_show', { permisos: ANFITRION })))
            .toEqual({ status: 409, code: 'TRANSICION_INVALIDA' })
        expect(() => validarTransicion('reserva', 'confirmada', 'cancelada', { permisos: ANFITRION, motivo: 'Llamó a cancelar' })).not.toThrow()
        expect(codigoError(() => validarTransicion('reserva', 'sentada', 'cancelada', { permisos: ANFITRION, motivo: 'x' })))
            .toEqual({ status: 409, code: 'TRANSICION_INVALIDA' })
    })

    it('staff cancela una reserva solo con motivo (0.7b)', () => {
        for (const de of ['pendiente', 'confirmada']) {
            expect(codigoError(() => validarTransicion('reserva', de, 'cancelada', { permisos: ANFITRION })))
                .toEqual({ status: 400, code: 'MOTIVO_REQUERIDO' })
        }
    })

    it('check-in sin confirmar: pendiente → sentada (staff) con motivo por defecto (0.7b)', () => {
        expect(validarTransicion('reserva', 'pendiente', 'sentada', { permisos: ANFITRION }).motivo).toBe('check-in sin confirmar')
        expect(codigoError(() => validarTransicion('reserva', 'pendiente', 'sentada', { permisos: ['reserva:ver'] })))
            .toEqual({ status: 403, code: 'FORBIDDEN' })
        expect(codigoError(() => validarTransicion('reserva', 'pendiente', 'sentada', { actor: 'cliente' })))
            .toEqual({ status: 409, code: 'TRANSICION_INVALIDA' })
        // No se permiten otros saltos
        for (const [de, a] of [['pendiente', 'completada'], ['confirmada', 'completada']]) {
            expect(codigoError(() => validarTransicion('reserva', de, a, { permisos: ['*'] })))
                .toEqual({ status: 409, code: 'TRANSICION_INVALIDA' })
        }
    })

    it('sin reserva:cambiar_estado → 403', () => {
        expect(codigoError(() => validarTransicion('reserva', 'pendiente', 'confirmada', { permisos: ['reserva:ver'] })))
            .toEqual({ status: 403, code: 'FORBIDDEN' })
    })

    it('cliente: cancela en pendiente/confirmada y al editar una confirmada vuelve a pendiente', () => {
        expect(validarTransicion('reserva', 'confirmada', 'pendiente', { actor: 'cliente' }).motivo).toBe('editada por cliente')
        expect(() => validarTransicion('reserva', 'pendiente', 'cancelada', { actor: 'cliente' })).not.toThrow()
        expect(codigoError(() => validarTransicion('reserva', 'sentada', 'cancelada', { actor: 'cliente' })))
            .toEqual({ status: 409, code: 'TRANSICION_INVALIDA' })
        expect(codigoError(() => validarTransicion('reserva', 'pendiente', 'confirmada', { actor: 'cliente' })))
            .toEqual({ status: 409, code: 'TRANSICION_INVALIDA' })
    })

    it('estados finales de reserva no se reabren', () => {
        for (const de of ['completada', 'cancelada', 'no_show']) {
            expect(codigoError(() => validarTransicion('reserva', de, 'pendiente', { permisos: ['*'] })))
                .toEqual({ status: 409, code: 'ESTADO_FINAL' })
            expect(codigoError(() => validarTransicion('reserva', de, 'pendiente', { actor: 'cliente' })))
                .toEqual({ status: 409, code: 'ESTADO_FINAL' })
        }
    })
})
