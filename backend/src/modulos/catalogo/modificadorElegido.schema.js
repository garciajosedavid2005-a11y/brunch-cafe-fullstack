import mongoose from 'mongoose'

// 1.12 · Copia de una opción elegida (nombre y recargo del momento, F1-14) que guardan el ítem de la
// comanda del salón y la línea del pedido a domicilio. Sin dependencias de otros modelos: lo importan
// salon/comanda.model.js y pedidos/detallePedido.model.js sin crear ciclos entre módulos.

// Tope de opciones copiadas en un ítem o una línea: 10 grupos por producto × 20 opciones por grupo
export const MAX_MODIFICADORES_POR_ITEM = 200
// Nota libre por ítem o línea (F1-5), la misma en el salón y en el domicilio
export const MAX_NOTA_ITEM = 140

export const entero = (campo) => ({ validator: Number.isInteger, message: `${campo} debe ser un número entero` })

export const modificadorElegidoSchema = new mongoose.Schema({
    grupo: { type: mongoose.Schema.Types.ObjectId, ref: 'GrupoModificadores', required: true },
    grupoNombre: { type: String, required: true, trim: true, maxlength: 40 },
    opcion: { type: mongoose.Schema.Types.ObjectId, required: true },
    opcionNombre: { type: String, required: true, trim: true, maxlength: 40 },
    precioExtra: { type: Number, required: true, min: 0, validate: entero('El recargo') },
}, { _id: false })
