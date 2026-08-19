import mongoose from 'mongoose';

// Blocking severs a relationship in both directions; muting only hides content
// from the muter. They are separate collections because they answer different
// questions and blocking has to be enforced on write paths as well as reads.
const blockSchema = new mongoose.Schema(
  {
    blocker: { type: mongoose.Schema.ObjectId, ref: 'User', required: true },
    blocked: { type: mongoose.Schema.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

blockSchema.index({ blocker: 1, blocked: 1 }, { unique: true });
blockSchema.index({ blocked: 1 });

export default mongoose.model('Block', blockSchema);
