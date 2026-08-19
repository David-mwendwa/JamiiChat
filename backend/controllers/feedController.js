import { StatusCodes } from 'http-status-codes';
import { homeFeed, exploreFeed, hashtagFeed } from '../services/feed.js';
import { clampLimit } from '../utils/cursor.js';

export const getHomeFeed = async (req, res) => {
  const { items, nextCursor } = await homeFeed({
    viewer: req.user,
    cursor: req.query.cursor,
    limit: clampLimit(req.query.limit),
  });
  res.status(StatusCodes.OK).json({ status: 'success', items, nextCursor });
};

export const getExploreFeed = async (req, res) => {
  const page = Math.max(0, Number.parseInt(req.query.page, 10) || 0);
  const { items, nextPage } = await exploreFeed({
    viewer: req.user,
    page,
    limit: clampLimit(req.query.limit),
  });
  res.status(StatusCodes.OK).json({ status: 'success', items, nextPage });
};

export const getHashtagFeed = async (req, res) => {
  const { items, nextCursor } = await hashtagFeed({
    viewer: req.user,
    tag: req.params.tag,
    cursor: req.query.cursor,
    limit: clampLimit(req.query.limit),
  });
  res.status(StatusCodes.OK).json({ status: 'success', tag: req.params.tag, items, nextCursor });
};
