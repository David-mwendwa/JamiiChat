import { StatusCodes } from 'http-status-codes';
import { CustomAPIError } from '../errors/customErrors.js';

const isProduction = () => process.env.NODE_ENV === 'production';

// Mongoose and JWT throw errors that carry the right meaning but the wrong
// shape. Each branch below translates one into a CustomAPIError-compatible
// object so the response format never depends on where the failure came from.
const normalize = (err) => {
  if (err instanceof CustomAPIError) return err;

  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors)
      .map((e) => e.message)
      .join('. ');
    return { statusCode: StatusCodes.BAD_REQUEST, status: 'fail', message, isOperational: true };
  }

  if (err.name === 'CastError') {
    return {
      statusCode: StatusCodes.BAD_REQUEST,
      status: 'fail',
      message: `Invalid ${err.path}: ${err.value}`,
      isOperational: true,
    };
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue ?? {})[0] ?? 'value';
    return {
      statusCode: StatusCodes.CONFLICT,
      status: 'fail',
      message: `That ${field} is already taken`,
      isOperational: true,
    };
  }

  if (err.name === 'JsonWebTokenError')
    return {
      statusCode: StatusCodes.UNAUTHORIZED,
      status: 'fail',
      message: 'Invalid session. Please log in again.',
      isOperational: true,
    };

  if (err.name === 'TokenExpiredError')
    return {
      statusCode: StatusCodes.UNAUTHORIZED,
      status: 'fail',
      message: 'Your session expired. Please log in again.',
      isOperational: true,
    };

  if (err.name === 'MulterError')
    return {
      statusCode: StatusCodes.BAD_REQUEST,
      status: 'fail',
      message:
        err.code === 'LIMIT_FILE_SIZE' ? 'That file is too large' : 'That upload was rejected',
      isOperational: true,
    };

  return {
    statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    status: 'error',
    message: err.message,
    isOperational: false,
  };
};

const errorHandler = (err, req, res, next) => {
  const error = normalize(err);

  // An unexpected error in production would otherwise leak internals to the
  // client, so only operational messages are passed through.
  const message =
    error.isOperational || !isProduction() ? error.message : 'Something went wrong';

  if (!error.isOperational) console.error(err);

  res.status(error.statusCode).json({
    status: error.status,
    message,
    ...(isProduction() ? {} : { stack: err.stack }),
  });
};

export default errorHandler;
