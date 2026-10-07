const jwt = require('jsonwebtoken');
const db = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'hygiene360-enterprise-production-secret-key-99281';

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Authentication token required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Fetch latest user details from DB to ensure user is active and has up-to-date role
    const user = db.get(
      'SELECT id, employee_id, name, email, role, plant_id, phone, is_active FROM users WHERE id = ?',
      [decoded.id]
    );

    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, error: 'User account is inactive or not found' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired session token' });
  }
}

// Role Authorization middleware
function requireRole(...allowedRoles) {
  // Expand aliases: IT_ADMIN <-> SUPER_ADMIN, HOUSEKEEPING <-> HOUSEKEEPING_AGENT
  const expandedRoles = [...allowedRoles];
  if (allowedRoles.includes('SUPER_ADMIN') && !expandedRoles.includes('IT_ADMIN')) expandedRoles.push('IT_ADMIN');
  if (allowedRoles.includes('IT_ADMIN') && !expandedRoles.includes('SUPER_ADMIN')) expandedRoles.push('SUPER_ADMIN');
  if (allowedRoles.includes('HOUSEKEEPING_AGENT') && !expandedRoles.includes('HOUSEKEEPING')) expandedRoles.push('HOUSEKEEPING');
  if (allowedRoles.includes('HOUSEKEEPING') && !expandedRoles.includes('HOUSEKEEPING_AGENT')) expandedRoles.push('HOUSEKEEPING_AGENT');

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'IT_ADMIN') {
      return next(); // IT Admin has universal bypass across all plants and modules
    }
    if (!expandedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        error: `Forbidden: Access restricted to roles [${allowedRoles.join(', ')}]. Current role: ${req.user.role}` 
      });
    }
    next();
  };
}

// Plant-level access control middleware
function requirePlantAccess(getPlantIdFromReq = (req) => req.params.plantId || req.body.plant_id || req.query.plant_id) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    // IT Admin, Super Admin and Management have multi-plant global visibility
    if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'IT_ADMIN' || req.user.role === 'MANAGEMENT') {
      return next();
    }
    
    const requestedPlantId = Number(getPlantIdFromReq(req));
    if (requestedPlantId && req.user.plant_id && requestedPlantId !== req.user.plant_id) {
      return res.status(403).json({ 
        success: false, 
        error: 'Forbidden: You do not have permission to access resources outside your assigned plant' 
      });
    }
    next();
  };
}

function generateToken(user) {
  return jwt.sign(
    { 
      id: user.id, 
      employee_id: user.employee_id, 
      role: user.role, 
      plant_id: user.plant_id 
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

module.exports = {
  authenticate,
  requireRole,
  requirePlantAccess,
  generateToken,
  JWT_SECRET
};
