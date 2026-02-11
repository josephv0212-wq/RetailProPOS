import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';

export const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'Authentication required' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id);
    
    if (!user || !user.isActive) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid or inactive user' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    const isDevelopment = process.env.NODE_ENV === 'development';
    return res.status(401).json({ 
      success: false,
      message: 'Invalid token',
      ...(isDevelopment && { error: error.message })
    });
  }
};

export const requireLocation = (req, res, next) => {
  // Admin can proceed without location (e.g. to view all report data)
  if (req.user.role === 'admin') return next();
  if (!req.user.locationId) {
    return res.status(403).json({ 
      success: false,
      message: 'User location not configured' 
    });
  }
  next();
};

export const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  next();
};
