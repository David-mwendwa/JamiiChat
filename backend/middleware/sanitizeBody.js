import xss from 'xss';

// Strips HTML from every string that arrives in a request body. Post text is
// rendered as plain text on the client, so nothing here needs markup, and
// escaping at the boundary means no render path has to remember to do it.
const clean = (value) => {
  if (typeof value === 'string') return xss(value, { whiteList: {}, stripIgnoreTag: true });
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) value[key] = clean(value[key]);
    return value;
  }
  return value;
};

const sanitizeBody = (req, res, next) => {
  if (req.body) req.body = clean(req.body);
  next();
};

export default sanitizeBody;
