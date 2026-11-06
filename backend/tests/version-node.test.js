import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 0.15a (decisión F1-16): Node 22 LTS fijado con .nvmrc y "engines" en backend y frontend
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const leerJson = (ruta) => JSON.parse(fs.readFileSync(path.join(raiz, ruta), 'utf8'))

describe('Versión de Node fijada (0.15a)', () => {
    it('.nvmrc pide Node 22', () => {
        const archivo = path.join(raiz, '.nvmrc')
        expect(fs.existsSync(archivo)).toBe(true)
        expect(fs.readFileSync(archivo, 'utf8').trim()).toMatch(/^22(\.|$)/)
    })

    it.each(['backend/package.json', 'frontend/package.json'])('%s exige Node 22 en "engines"', (ruta) => {
        expect(leerJson(ruta).engines?.node).toBe('>=22.12 <23')
    })
})
