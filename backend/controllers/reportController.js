import { StatusCodes } from 'http-status-codes';
import Report from '../models/reportModel.js';
import Post from '../models/postModel.js';
import User from '../models/userModel.js';
import { BadRequestError, NotFoundError } from '../errors/customErrors.js';

export const createReport = async (req, res) => {
  const { targetType, targetId, reason, detail } = req.body;
  if (!['post', 'user'].includes(targetType))
    throw new BadRequestError('Say whether you are reporting a post or an account');
  if (!reason) throw new BadRequestError('Choose a reason');

  const payload = {
    reporter: req.user._id,
    targetType,
    reason,
    detail: detail ?? '',
    post: null,
    user: null,
  };

  if (targetType === 'post') {
    const post = await Post.findById(targetId);
    if (!post) throw new NotFoundError('That post does not exist');
    payload.post = post._id;
  } else {
    const user = await User.findById(targetId);
    if (!user) throw new NotFoundError('That account does not exist');
    payload.user = user._id;
  }

  try {
    await Report.create(payload);
  } catch (err) {
    // Reporting the same thing twice is not an error worth showing — the
    // report already exists and the outcome the reporter wanted is unchanged.
    if (err.code !== 11000) throw err;
  }

  res.status(StatusCodes.CREATED).json({
    status: 'success',
    message: 'Thanks — a moderator will take a look',
  });
};
