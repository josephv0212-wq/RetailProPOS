import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User } from '../models/index.js';
import { sendSuccess, sendError, sendNotFound, sendValidationError } from '../utils/responseHelper.js';

// Normalize a user's tax percentage, falling back to numbers embedded in the
// location name (e.g., "Miami Dade Sales Tax (7%)") before using the default.
const resolveTaxPercentage = (user) => {
  const direct = parseFloat(user?.taxPercentage);
  if (!Number.isNaN(direct) && Number.isFinite(direct)) {
    return direct;
  }

  const locationName = user?.locationName || '';
  const match = locationName.match(/(\d+(?:\.\d+)?)\s*%/);
  if (match) {
    const fromName = parseFloat(match[1]);
    if (!Number.isNaN(fromName) && Number.isFinite(fromName)) {
      return fromName;
    }
  }

  return 7.5;
};

export const login = async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const user = await User.findOne({ where: { username, isActive: true } });
    
    if (!user) {
      return sendNotFound(res, 'User');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return sendError(res, 'Invalid credentials', 401);
    }

    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username,
        locationId: user.locationId,
        role: user.role
      }, 
      process.env.JWT_SECRET, 
      { expiresIn: '8h' }
    );
    
    return sendSuccess(res, {
      token, 
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        locationId: user.locationId,
        locationName: user.locationName,
        taxPercentage: resolveTaxPercentage(user)
      }
    }, 'Login successful');
  } catch (err) {
    console.error('Login error:', err);
    return sendError(res, 'Login failed', 500, err);
  }
};

export const createUser = async (req, res) => {
  const { username, password, role, locationId, locationName, taxPercentage } = req.body;
  
  try {
    const existingUser = await User.findOne({ where: { username } });
    
    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        message: 'Username already exists' 
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = await User.create({
      username,
      password: hashedPassword,
      role: role || 'cashier',
      locationId,
      locationName,
      taxPercentage: taxPercentage ? parseFloat(taxPercentage) : 7.5
    });

    return sendSuccess(res, {
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        locationId: user.locationId,
        locationName: user.locationName,
        taxPercentage: resolveTaxPercentage(user)
      }
    }, 'User created successfully', 201);
  } catch (err) {
    console.error('User creation error:', err);
    return sendError(res, 'User creation failed', 500, err);
  }
};

export const register = async (req, res) => {
  const { username, password, role, locationId, locationName, taxPercentage } = req.body;
  
  try {
    const existingUser = await User.findOne({ where: { username } });
    
    if (existingUser) {
      return sendValidationError(res, 'Username already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = await User.create({
      username,
      password: hashedPassword,
      role: role || 'cashier',
      locationId,
      locationName,
      taxPercentage: taxPercentage ? parseFloat(taxPercentage) : 7.5
    });

    return sendSuccess(res, {
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        locationId: user.locationId,
        locationName: user.locationName,
        taxPercentage: resolveTaxPercentage(user)
      }
    }, 'User registered successfully', 201);
  } catch (err) {
    console.error('User registration error:', err);
    return sendError(res, 'User registration failed', 500, err);
  }
};

export const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password'] }
    });

    const normalizedUser = user?.toJSON ? user.toJSON() : user;
    if (normalizedUser) {
      normalizedUser.taxPercentage = resolveTaxPercentage(normalizedUser);
    }
    
    return sendSuccess(res, { user: normalizedUser });
  } catch (err) {
    console.error('Get user error:', err);
    return sendError(res, 'Failed to get user', 500, err);
  }
};
