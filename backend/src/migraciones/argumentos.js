// Argumentos de los scripts de migración. Un argumento desconocido es un error: una errata como
// `--dryrun` no debe aplicar la migración de verdad.
const VALIDOS = new Set(['--dry-run', '--down'])

export const leerArgumentos = (argv) => {
    const desconocidos = argv.filter((a) => !VALIDOS.has(a))
    if (desconocidos.length) {
        throw new Error(`Argumento desconocido: ${desconocidos.join(' ')}. Solo se admiten --dry-run y --down.`)
    }
    return { dryRun: argv.includes('--dry-run'), reversa: argv.includes('--down') }
}
