import mongoose from 'mongoose';

// A row per like rather than an array on the post: an array grows without
// bound and turns "did I like this?" into a scan of every liker.
const likeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.ObjectId, ref: 'User', required: true },
    post: { type: mongoose.Schema.ObjectId, ref: 'Post', required: true },
  },
  { timestamps: true }
);

likeSchema.index({ post: 1, user: 1 }, { unique: true });
likeSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model('Like', likeSchema);
