import mongoose from 'mongoose';

const muteSchema = new mongoose.Schema(
  {
    muter: { type: mongoose.Schema.ObjectId, ref: 'User', required: true },
    muted: { type: mongoose.Schema.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

muteSchema.index({ muter: 1, muted: 1 }, { unique: true });

export default mongoose.model('Mute', muteSchema);
