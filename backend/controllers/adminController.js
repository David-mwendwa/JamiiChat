import { StatusCodes } from 'http-status-codes';
import Report from '../models/reportModel.js';
import Post from '../models/postModel.js';
import User from '../models/userModel.js';
import { NotFoundError, BadRequestError } from '../errors/customErrors.js';
import { clampLimit } from '../utils/cursor.js';

export const overview = async (req, res) => {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [users, posts, openReports, newUsers, newPosts] = await Promise.all([
    User.countDocuments({ active: { $ne: false } }),
    Post.countDocuments({ deletedAt: null }),
    Report.countDocuments({ state: 'open' }),
    User.countDocuments({ createdAt: { $gte: dayAgo } }),
    Post.countDocuments({ createdAt: { $gte: dayAgo }, deletedAt: null }),
  ]);

  res.status(StatusCodes.OK).json({
    status: 'success',
    stats: { users, posts, openReports, newUsers, newPosts },
  });
};

export const listReports = async (req, res) => {
  const state = ['open', 'actioned', 'dismissed'].includes(req.query.state)
    ? req.query.state
    : 'open';

  const items = await Report.find({ state })
    .populate('reporter', 'handle displayName avatar')
    .populate('user', 'handle displayName avatar')
    .populate({ path: 'post', populate: { path: 'author', select: 'handle displayName avatar' } })
    .sort({ createdAt: -1 })
    .limit(clampLimit(req.query.limit, 30))
    .lean();

  res.status(StatusCodes.OK).json({ status: 'success', items });
};

// The report and the decision are separate fields. A report is a signal that
// someone objected; the state is what a human concluded. Collapsing them would
// make "reported" and "guilty" the same thing.
export const resolveReport = async (req, res) => {
  const { action, note } = req.body;
  if (!['actioned', 'dismissed'].includes(action))
    throw new BadRequestError('An action is either "actioned" or "dismissed"');

  const report = await Report.findById(req.params.id);
  if (!report) throw new NotFoundError('That report does not exist');

  if (action === 'actioned') {
    if (report.post) await Post.updateOne({ _id: report.post }, { deletedAt: new Date() });
    if (report.user) await User.updateOne({ _id: report.user }, { active: false });
  }

  report.state = action;
  report.moderator = req.user._id;
  report.moderatorNote = note ?? '';
  report.resolvedAt = new Date();
  await report.save();

  res.status(StatusCodes.OK).json({ status: 'success', report });
};

export const listUsers = async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const filter = q ? { handle: new RegExp(`^${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i') } : {};

  const items = await User.find(filter)
    .select('+active')
    .sort({ createdAt: -1 })
    .limit(clampLimit(req.query.limit, 30))
    .lean();

  res.status(StatusCodes.OK).json({
    status: 'success',
    items: items.map((u) => ({
      id: u._id,
      handle: u.handle,
      displayName: u.displayName,
      avatar: u.avatar,
      email: u.email,
      role: u.role,
      active: u.active !== false,
      counts: u.counts,
      createdAt: u.createdAt,
    })),
  });
};

export const setUserActive = async (req, res) => {
  const user = await User.findById(req.params.id).select('+active');
  if (!user) throw new NotFoundError('That account does not exist');
  if (String(user._id) === String(req.user._id))
    throw new BadRequestError('You cannot deactivate your own account here');

  user.active = req.body.active !== false;
  await user.save({ validateBeforeSave: false });

  res.status(StatusCodes.OK).json({ status: 'success', active: user.active });
};
