require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Ensure database and tables are ready
require('./database');

const authRoutes = require('./routes/auth');
const qrRoutes = require('./routes/qr');
const cleaningRoutes = require('./routes/cleaning');
const inspectionRoutes = require('./routes/inspection');
const issuesRoutes = require('./routes/issues');
const drinkingWaterRoutes = require('./routes/drinkingWater');
const dashboardRoutes = require('./routes/dashboard');
const reportsRoutes = require('./routes/reports');
const adminRoutes = require('./routes/admin');
const auditLogsRoutes = require('./routes/auditLogs');
const notificationsRoutes = require('./routes/notifications');
const masterPhotosRoutes = require('./routes/masterPhotos');
const adminModuleRoutes = require('./routes/adminModule');
const { startSlotScheduler } = require('./utils/slotScheduler');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Static uploads serving (access-controlled in production or protected evidence paths)
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));
// Same files under /api so photos load through any proxy/tunnel that only forwards /api
app.use('/api/uploads', express.static(uploadsDir));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/cleaning', cleaningRoutes);
app.use('/api/inspection', inspectionRoutes);
app.use('/api/issues', issuesRoutes);
app.use('/api/drinking-water', drinkingWaterRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/audit-logs', auditLogsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/master-photos', masterPhotosRoutes);
app.use('/api/admin-module', adminModuleRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    system: 'HYGIENE 360 Enterprise Housekeeping Management',
    serverTime: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Serve frontend in production
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    }
  }));
  app.get('{*path}', (req, res) => {
    if (!req.path.startsWith('/api/') && !req.path.startsWith('/uploads/')) {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(clientDistPath, 'index.html'));
    }
  });
}

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  HYGIENE 360 Enterprise Backend Running on Port ${PORT}`);
  console.log(`  Health Check: http://localhost:${PORT}/api/health`);
  console.log(`=======================================================`);
  startSlotScheduler();
});

// Phone browsers open the live camera only on HTTPS; serve the same app over HTTPS as well
const HTTPS_PORT = process.env.HTTPS_PORT || 5443;
const certPath = process.env.HTTPS_PEM || path.join(__dirname, '..', 'client', 'node_modules', '.vite', 'basic-ssl', '_cert.pem');
if (fs.existsSync(certPath)) {
  try {
    const pem = fs.readFileSync(certPath);
    require('https').createServer({ key: pem, cert: pem }, app).listen(HTTPS_PORT, () => {
      console.log(`  HTTPS (phone camera): https://<this-pc-ip>:${HTTPS_PORT}`);
    });
  } catch (err) {
    console.warn('HTTPS server not started:', err.message);
  }
} else {
  console.warn(`HTTPS server not started: certificate not found (${certPath}). Run the client dev server once to create it.`);
}

// Guard against unexpected worker/async library exceptions
process.on('uncaughtException', (err) => {
  console.error('CRITICAL: Process caught unhandled exception (handled cleanly):', err?.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('CRITICAL: Process caught unhandled rejection (handled cleanly):', reason?.message || reason);
});

