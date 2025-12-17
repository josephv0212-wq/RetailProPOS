/**
 * Standardized error response handler
 * Hides internal error details in production
 */
export const errorHandler = (err, req, res, next) => {
  console.error('Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    requestId: req.id,
    path: req.path,
    method: req.method
  });

  const isDevelopment = process.env.NODE_ENV === 'development';

  // Handle known error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: err.errors || err.message,
      ...(isDevelopment && { stack: err.stack })
    });
  }

  if (err.name === 'UnauthorizedError' || err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Authentication failed',
      ...(isDevelopment && { error: err.message })
    });
  }

  // Default error response
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'An error occurred',
    ...(isDevelopment && { 
      error: err.message,
      stack: err.stack 
    }),
    ...(req.id && { requestId: req.id })
  });
};

/**
 * Standardized success response wrapper
 */
export const successResponse = (res, statusCode = 200, data = null, message = null) => {
  const response = {
    success: true,
    ...(message && { message }),
    ...(data && { data })
  };
  return res.status(statusCode).json(response);
};

