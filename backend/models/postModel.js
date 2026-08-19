import mongoose from 'mongoose';

const mediaSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    width: Number,
    height: Number,
    alt: { type: String, default: '', maxlength: 200 },
  },
  { _id: false }
);

const postSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.ObjectId, ref: 'User', required: true },
    text: { type: String, trim: true, maxlength: [500, 'Posts are limited to 500 characters'], default: '' },
    media: { type: [mediaSchema], validate: [(v) => v.length <= 4, 'A post can carry at most 4 images'] },
    kind: { type: String, enum: ['post', 'repost', 'quote'], default: 'post', index: true },
    // Set on reposts and quotes; the post being pointed at.
    repostOf: { type: mongoose.Schema.ObjectId, ref: 'Post', default: null },
    // Direct parent for replies.
    replyTo: { type: mongoose.Schema.ObjectId, ref: 'Post', default: null },
    // Top of the thread. Lets an entire conversation load with one indexed
    // query instead of walking parent pointers one level at a time.
    rootPost: { type: mongoose.Schema.ObjectId, ref: 'Post', default: null },
    depth: { type: Number, default: 0, min: 0, max: 2 },
    hashtags: { type: [String], default: [], index: true },
    mentions: { type: [{ type: mongoose.Schema.ObjectId, ref: 'User' }], default: [] },
    counts: {
      likes: { type: Number, default: 0, min: 0 },
      replies: { type: Number, default: 0, min: 0 },
      reposts: { type: Number, default: 0, min: 0 },
    },
    // Soft delete: a removed post in the middle of a thread must leave the
    // replies below it reachable.
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ createdAt: -1, _id: -1 });
postSchema.index({ hashtags: 1, createdAt: -1 });
postSchema.index({ rootPost: 1, createdAt: 1 });
postSchema.index({ replyTo: 1, createdAt: -1 });
postSchema.index({ repostOf: 1 });
postSchema.index({ text: 'text' });

// A post with neither text nor an image is not a post.
postSchema.pre('validate', function (next) {
  if (this.kind === 'repost') return next();
  if (!this.text?.trim() && this.media.length === 0)
    this.invalidate('text', 'Write something or add an image');
  next();
});

export default mongoose.model('Post', postSchema);
