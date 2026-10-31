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
    productoId: {
      type: Number,
      min: 1,
      max: 24,
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
  },
  {
    timestamps: true,
  }
);

comentarioSchema.index({ usuario: 1, createdAt: -1 });

export default mongoose.model('Comentario', comentarioSchema);