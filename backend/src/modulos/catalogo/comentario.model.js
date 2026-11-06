import mongoose from 'mongoose';

const comentarioSchema = new mongoose.Schema(
  {
    usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true,
    },
    tipo: {
      type: String,
      enum: ['general', 'producto'],
      default: 'general',
      required: true,
    },
    // Referencia real al producto (0.6). Los comentarios antiguos la reciben con migrate:0.6.
    producto: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Producto',
      required: function () {
        return this.tipo === 'producto';
      },
    },
    // Código numérico del producto (se conserva; las calificaciones públicas lo incluyen).
    productoId: {
      type: Number,
      min: 1,
      required: function () {
        return this.tipo === 'producto';
      },
    },
    calificacion: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comentario: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 300,
    },
    // Decisión 14 (0.12): producto → hay un pedido entregado del autor que lo contiene;
    // general → el autor tiene ≥ 1 pedido entregado o reserva completada. Las reseñas
    // anteriores no tienen el campo y cuentan como no verificadas (se conservan).
    verificada: {
      type: Boolean,
      default: false,
    },
    // Moderación: si está en false, el comentario no se muestra en la web
    visible: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

comentarioSchema.index({ usuario: 1, createdAt: -1 });
comentarioSchema.index({ visible: 1, createdAt: -1 });
// Una reseña por usuario y producto (0.12); las generales no tienen límite
comentarioSchema.index(
  { usuario: 1, producto: 1 },
  { unique: true, partialFilterExpression: { tipo: 'producto' }, name: 'una_resena_por_producto' },
);

export default mongoose.model('Comentario', comentarioSchema);