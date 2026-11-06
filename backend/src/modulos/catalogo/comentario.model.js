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

export default mongoose.model('Comentario', comentarioSchema);