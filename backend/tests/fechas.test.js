import { describe, it, expect } from 'vitest'
import { ZONA_HORARIA, instanteLocal, fechaLocal, horaLocal, esFechaValida, esHoraValida } from '../src/libs/fechas.js'

describe('Fechas: instantes en UTC, calendario de America/Bogota', () => {
    it('la zona es America/Bogota', () => {
        expect(ZONA_HORARIA).toBe('America/Bogota')
    })

    it('fecha + hora de Bogotá → instante UTC', () => {
        expect(instanteLocal('2026-11-05', '08:00').toISOString()).toBe('2026-11-05T13:00:00.000Z')
        expect(instanteLocal('2026-12-31', '19:30').toISOString()).toBe('2027-01-01T00:30:00.000Z')
    })

    it('instante UTC → fecha y hora de Bogotá (cerca de la medianoche cambia el día)', () => {
        const casiMedianoche = new Date('2026-11-06T03:30:00Z') // 22:30 del 5 en Bogotá
        expect(fechaLocal(casiMedianoche)).toBe('2026-11-05')
        expect(horaLocal(casiMedianoche)).toBe('22:30')
        expect(fechaLocal(new Date('2026-11-06T05:00:00Z'))).toBe('2026-11-06')
    })

    it('ida y vuelta', () => {
        const instante = instanteLocal('2026-02-28', '23:59')
        expect([fechaLocal(instante), horaLocal(instante)]).toEqual(['2026-02-28', '23:59'])
    })

    it('valida fechas y horas', () => {
        expect(esFechaValida('2026-02-29')).toBe(false)
        expect(esFechaValida('2028-02-29')).toBe(true)
        expect(esHoraValida('24:00')).toBe(false)
        expect(esHoraValida('9:00')).toBe(false)
        expect(() => instanteLocal('2026-13-01', '08:00')).toThrow()
    })
})
