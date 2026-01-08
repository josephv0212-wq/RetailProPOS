import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User } from '../models/index.js';
import { sendSuccess, sendError, sendNotFound, sendValidationError } from '../utils/responseHelper.js';
import { getLocationById } from '../services/zohoService.js';

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
    // Special bootstrap admin credentials
    const BOOTSTRAP_ADMIN_USERNAME = 'accounting@subzeroiceservices.com';
    const BOOTSTRAP_ADMIN_PASSWORD = 'dryice000';
    
    // Check if database is empty (no users exist)
    const userCount = await User.count();
    const isDatabaseEmpty = userCount === 0;
    
    // Check if any admin exists
    const adminExists = await User.findOne({ where: { role: 'admin' } });
    
    // If database is empty and credentials match bootstrap admin, create admin user
    if (isDatabaseEmpty && username === BOOTSTRAP_ADMIN_USERNAME && password === BOOTSTRAP_ADMIN_PASSWORD) {
      const hashedPassword = await bcrypt.hash(BOOTSTRAP_ADMIN_PASSWORD, 10);
      
      const newAdmin = await User.create({
        username: BOOTSTRAP_ADMIN_USERNAME,
        password: hashedPassword,
        role: 'admin',
        locationId: 'LOC001',
        locationName: 'Default Location',
        taxPercentage: 7.5,
        isActive: true
      });

      console.log('✅ Bootstrap admin user created:', BOOTSTRAP_ADMIN_USERNAME);

      const token = jwt.sign(
        { 
          id: newAdmin.id, 
          username: newAdmin.username,
          locationId: newAdmin.locationId,
          role: newAdmin.role
        }, 
        process.env.JWT_SECRET, 
        { expiresIn: '8h' }
      );
      
      return sendSuccess(res, {
        token, 
        user: {
          id: newAdmin.id,
          username: newAdmin.username,
          role: newAdmin.role,
          locationId: newAdmin.locationId,
          locationName: newAdmin.locationName,
          taxPercentage: resolveTaxPercentage(newAdmin)
        }
      }, 'Bootstrap admin created and logged in successfully');
    }
  
    
    // Normal login flow
    // First, find by username only so we can distinguish between:
    // - Non-existent user
    // - Existing but inactive (pending approval) user
    const user = await User.findOne({ where: { username } });
    
    if (!user) {
      return sendNotFound(res, 'User');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return sendError(res, 'Invalid credentials', 401);
    }

    if (!user.isActive) {
      return sendError(
        res, 
        'Your account is pending approval. Please contact the administrator.', 
        403
      );
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
        taxPercentage: resolveTaxPercentage(user),
        terminalIP: user.terminalIP,
        terminalPort: user.terminalPort
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

    // Fetch location information from Zoho Books API if locationId is provided
    let finalLocationName = locationName;
    let finalLocationId = locationId;
    
    if (locationId) {
      try {
        console.log(`📍 Fetching location details from Zoho for locationId: ${locationId}`);
        const zohoLocation = await getLocationById(locationId);
        
        if (zohoLocation) {
          // Use location name from Zoho if available, otherwise use provided name
          finalLocationName = zohoLocation.location_name || zohoLocation.name || locationName;
          finalLocationId = zohoLocation.location_id || zohoLocation.id || locationId;
          
          console.log(`✅ Retrieved location from Zoho: ${finalLocationName} (ID: ${finalLocationId})`);
        } else {
          console.warn(`⚠️ Location ${locationId} not found in Zoho, using provided locationName`);
        }
      } catch (zohoError) {
        console.error(`❌ Failed to fetch location ${locationId} from Zoho:`, zohoError.message);
        // Continue with registration using provided locationId and locationName
        // Don't fail registration if Zoho API call fails
        console.warn('⚠️ Continuing registration with provided location information');
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = await User.create({
      username,
      password: hashedPassword,
      role: role || 'cashier',
      locationId: finalLocationId,
      locationName: finalLocationName,
      taxPercentage: taxPercentage ? parseFloat(taxPercentage) : 7.5,
      // New registrations are inactive until approved by an admin
      isActive: false
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

export const listPendingUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      where: { isActive: false },
      attributes: { exclude: ['password'] },
      order: [['createdAt', 'ASC']]
    });

    return sendSuccess(res, { users });
  } catch (err) {
    console.error('List pending users error:', err);
    return sendError(res, 'Failed to fetch pending users', 500, err);
  }
};

export const approveUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id);

    if (!user) {
      return sendNotFound(res, 'User');
    }

    user.isActive = true;
    await user.save();

    const sanitizedUser = user.toJSON();
    delete sanitizedUser.password;

    return sendSuccess(res, { user: sanitizedUser }, 'User approved successfully');
  } catch (err) {
    console.error('Approve user error:', err);
    return sendError(res, 'Failed to approve user', 500, err);
  }
};

export const rejectUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id);

    if (!user) {
      return sendNotFound(res, 'User');
    }

    await user.destroy();

    return sendSuccess(res, { id }, 'User registration rejected and removed');
  } catch (err) {
    console.error('Reject user error:', err);
    return sendError(res, 'Failed to reject user', 500, err);
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: { exclude: ['password'] },
      order: [['createdAt', 'DESC']]
    });

    return sendSuccess(res, { users });
  } catch (err) {
    console.error('List all users error:', err);
    return sendError(res, 'Failed to fetch users', 500, err);
  }
};

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, isActive, locationId, locationName, taxPercentage, terminalIP } = req.body;

    const user = await User.findByPk(id);

    if (!user) {
      return sendNotFound(res, 'User');
    }

    // Prevent admin from deactivating themselves
    if (req.user.id === parseInt(id) && isActive === false) {
      return sendError(res, 'You cannot deactivate your own account', 400);
    }

    // Update role if provided
    if (role !== undefined) {
      if (!['cashier', 'admin'].includes(role)) {
        return sendValidationError(res, 'Role must be either "cashier" or "admin"');
      }
      user.role = role;
    }

    // Update isActive if provided
    if (isActive !== undefined) {
      user.isActive = isActive === true;
    }

    // Update locationId if provided
    if (locationId !== undefined) {
      user.locationId = locationId;
    }

    // Update locationName if provided
    if (locationName !== undefined) {
      user.locationName = locationName;
    }

    // Update taxPercentage if provided
    if (taxPercentage !== undefined) {
      user.taxPercentage = parseFloat(taxPercentage);
    }

    // Update terminalIP if provided
    if (terminalIP !== undefined) {
      user.terminalIP = terminalIP && terminalIP.trim() !== '' ? terminalIP.trim() : null;
    }

    await user.save();

    const sanitizedUser = user.toJSON();
    delete sanitizedUser.password;

    return sendSuccess(res, { user: sanitizedUser }, 'User updated successfully');
  } catch (err) {
    console.error('Update user error:', err);
    return sendError(res, 'Failed to update user', 500, err);
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

export const updateMyTerminalIP = async (req, res) => {
  try {
    const { terminalIP, terminalPort } = req.body;
    const user = await User.findByPk(req.user.id);
    
    if (!user) {
      return sendNotFound(res, 'User');
    }

    // Validate IP format if provided (allow localhost for USB connections)
    if (terminalIP && terminalIP.trim() !== '') {
      const ipTrimmed = terminalIP.trim();
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (ipTrimmed !== 'localhost' && ipTrimmed !== '127.0.0.1' && !ipRegex.test(ipTrimmed)) {
        return sendValidationError(res, 'Invalid IP address format. Please use format like 192.168.1.100 or localhost');
      }
    }

    // Validate port if provided
    if (terminalPort !== undefined && terminalPort !== null && terminalPort !== '') {
      const portNum = parseInt(terminalPort, 10);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        return sendValidationError(res, 'Invalid port number. Port must be between 1 and 65535');
      }
    }

    user.terminalIP = terminalIP && terminalIP.trim() !== '' ? terminalIP.trim() : null;
    user.terminalPort = (terminalPort !== undefined && terminalPort !== null && terminalPort !== '') 
      ? parseInt(terminalPort, 10) 
      : null;
    await user.save();

    const sanitizedUser = user.toJSON();
    delete sanitizedUser.password;

    return sendSuccess(res, { user: sanitizedUser }, 'Terminal IP and Port updated successfully');
  } catch (err) {
    console.error('Update terminal IP/Port error:', err);
    return sendError(res, 'Failed to update terminal IP and Port', 500, err);
  }
};
