/**
 * Standardized response helpers for consistent API responses
 */

const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Send success response
 */
export const sendSuccess = (res, data = null, message = null, statusCode = 200) => {
  const response = {
    success: true,
    ...(message && { message }),
    ...(data && { data })
  };
  return res.status(statusCode).json(response);
};

/**
 * Send error response
 */
export const sendError = (res, message, statusCode = 500, error = null) => {
  const response = {
    success: false,
    message,
    ...(isDevelopment && error && { error: error.message || error })
  };
  return res.status(statusCode).json(response);
};

/**
 * Send not found response
 */
export const sendNotFound = (res, resource = 'Resource') => {
  return sendError(res, `${resource} not found`, 404);
};

/**
 * Send validation error response
 */
export const sendValidationError = (res, message, errors = null) => {
  const response = {
    success: false,
    message,
    ...(errors && { errors })
  };
  return res.status(400).json(response);
};

/**
 * Send unauthorized response
 */
export const sendUnauthorized = (res, message = 'Authentication failed') => {
  return sendError(res, message, 401);
};

