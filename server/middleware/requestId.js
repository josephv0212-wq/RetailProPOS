import { v4 as uuidv4 } from 'uuid';

/**
 * Adds request ID to all requests for better debugging and log correlation
 */
export const requestIdMiddleware = (req, res, next) => {
  req.id = uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
};