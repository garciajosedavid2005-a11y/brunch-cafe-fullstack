// Catálogo de permisos: el código es la fuente de verdad; la colección Permiso
// lo refleja para el dashboard. "reservado" = definido para una fase futura:
// figura en el catálogo pero todavía no se puede asignar a ningún rol.
export const COMODIN = '*'

export const PERMISOS = [
    // Fase 0
    { clave: 'catalogo:gestionar', modulo: 'catalogo', descripcion: 'Crear, editar y eliminar productos y categorías' },
    { clave: 'pedido:ver', modulo: 'pedidos', descripcion: 'Ver todos los pedidos' },
    { clave: 'pedido:cambiar_estado', modulo: 'pedidos', descripcion: 'Avanzar el estado de un pedido' },
    { clave: 'pedido:cancelar', modulo: 'pedidos', descripcion: 'Cancelar un pedido con motivo' },
    { clave: 'reserva:ver', modulo: 'reservas', descripcion: 'Ver todas las reservas' },
    { clave: 'reserva:crear', modulo: 'reservas', descripcion: 'Registrar reservas para los clientes' },
    { clave: 'reserva:cambiar_estado', modulo: 'reservas', descripcion: 'Confirmar, sentar, completar o cancelar reservas' },
    { clave: 'resena:moderar', modulo: 'resenas', descripcion: 'Ocultar o eliminar reseñas' },
    { clave: 'estado:editar', modulo: 'configuracion', descripcion: 'Editar etiqueta, color y descripción de los estados' },
    { clave: 'metodo_pago:gestionar', modulo: 'configuracion', descripcion: 'Gestionar los métodos de pago' },
    { clave: 'horario:editar', modulo: 'configuracion', descripcion: 'Editar los horarios de domicilio y de reservas' },
    { clave: 'rol:gestionar', modulo: 'identidad', descripcion: 'Gestionar roles y sus permisos' },
    { clave: 'usuario:gestionar', modulo: 'identidad', descripcion: 'Activar/desactivar usuarios y asignar roles' },
    // Fase 1 · salón y comandas (PLAN_FASE_1 §1.1). Los endpoints llegan en 1.2 y 1.5
    { clave: 'salon:configurar', modulo: 'salon', descripcion: 'Configurar zonas, mesas y estaciones' },
    { clave: 'mesa:ver', modulo: 'salon', descripcion: 'Ver el plano de mesas' },
    { clave: 'mesa:operar', modulo: 'salon', descripcion: 'Ocupar, liberar y mover mesas; marcarlas limpias' },
    { clave: 'mesa:bloquear', modulo: 'salon', descripcion: 'Bloquear y desbloquear mesas con motivo' },
    { clave: 'mesa:unir', modulo: 'salon', descripcion: 'Unir y separar mesas' },
    { clave: 'cuenta:abrir', modulo: 'salon', descripcion: 'Abrir la cuenta de una mesa' },
    { clave: 'cuenta:ver', modulo: 'salon', descripcion: 'Ver cuentas con sus rondas y totales' },
    { clave: 'cuenta:transferir', modulo: 'salon', descripcion: 'Transferir una cuenta a otro mesero' },
    { clave: 'cuenta:solicitar', modulo: 'salon', descripcion: 'Marcar que la mesa pidió la cuenta' },
    { clave: 'cuenta:cerrar_sin_cobro', modulo: 'salon', descripcion: 'Cerrar una cuenta sin cobro, con motivo' },
    { clave: 'comanda:tomar', modulo: 'salon', descripcion: 'Agregar y quitar ítems de la ronda en borrador' },
    { clave: 'comanda:enviar', modulo: 'salon', descripcion: 'Enviar la ronda a cocina y barra' },
    { clave: 'item:anular', modulo: 'salon', descripcion: 'Anular un ítem ya enviado, con motivo' },
    // Fases futuras (reservados)
    { clave: 'caja:abrir', modulo: 'caja', descripcion: 'Abrir turno de caja', reservado: true },
    { clave: 'caja:cerrar', modulo: 'caja', descripcion: 'Cerrar turno de caja y arqueo', reservado: true },
    { clave: 'factura:anular', modulo: 'caja', descripcion: 'Anular comprobantes / emitir nota crédito', reservado: true },
    { clave: 'inventario:gestionar', modulo: 'inventario', descripcion: 'Gestionar insumos, recetas y movimientos', reservado: true },
    { clave: 'reporte:ver', modulo: 'reportes', descripcion: 'Ver reportes de ventas y operación', reservado: true },
]

export const CLAVES = PERMISOS.map((p) => p.clave)
export const CLAVES_ASIGNABLES = PERMISOS.filter((p) => !p.reservado).map((p) => p.clave)

// Roles con reglas fijas
export const ROL_ADMIN = 'admin'
export const ROL_CLIENTE = 'cliente'

// Permisos de salón de la Fase 1 por rol (1.1). item:anular, cuenta:cerrar_sin_cobro y
// salon:configurar no son de ningún rol de staff: solo el admin ("*") por ahora (F1-6, F1-13).
// La migración 1.1 los agregó a los roles ya creados con una copia fija de esta lista
// (src/migraciones/m11-permisos-salon.js); un cambio aquí necesita su propia migración.
export const PERMISOS_SALON = {
    mesero: ['mesa:ver', 'mesa:operar', 'cuenta:abrir', 'cuenta:ver', 'comanda:tomar', 'comanda:enviar', 'cuenta:solicitar'],
    anfitrion: ['mesa:ver', 'mesa:operar', 'mesa:bloquear', 'mesa:unir', 'cuenta:abrir', 'cuenta:transferir'],
}

// Roles de staff con permisos mínimos (se amplían en cada fase).
// El seed solo los asigna al crear el rol; después los edita el admin.
export const ROLES_STAFF = [
    {
        nombre: 'mesero',
        etiqueta: 'Mesero',
        descripcion: 'Atiende mesas y toma comandas.',
        permisos: ['pedido:ver', 'pedido:cambiar_estado', 'reserva:ver', 'reserva:crear', ...PERMISOS_SALON.mesero],
    },
    {
        nombre: 'anfitrion',
        etiqueta: 'Anfitrión',
        descripcion: 'Recibe clientes y gestiona reservas.',
        permisos: ['reserva:ver', 'reserva:cambiar_estado', ...PERMISOS_SALON.anfitrion],
    },
    { nombre: 'cocina', etiqueta: 'Cocina', descripcion: 'Prepara los platos.', permisos: ['pedido:ver'] },
    { nombre: 'barista', etiqueta: 'Barista', descripcion: 'Prepara las bebidas.', permisos: ['pedido:ver'] },
    { nombre: 'cajero', etiqueta: 'Cajero', descripcion: 'Cobra cuentas y gestiona la caja.', permisos: ['pedido:ver'] },
    { nombre: 'repartidor', etiqueta: 'Repartidor', descripcion: 'Entrega pedidos a domicilio.', permisos: ['pedido:ver'] },
    { nombre: 'compras', etiqueta: 'Compras', descripcion: 'Gestiona proveedores e inventario.', permisos: [] },
]

export const tienePermiso = (permisosUsuario = [], clave) =>
    permisosUsuario.includes(COMODIN) || permisosUsuario.includes(clave)
