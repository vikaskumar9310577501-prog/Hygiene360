require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const db = require('./database');
const storage = require('./utils/storage');

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
const { safeRun } = require('./utils/slotScheduler');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Health check endpoint (answers even when the database is down, to show what is wrong)
app.get('/api/health', async (req, res) => {
  let databaseError = null;
  try { await db.ensureReady(); } catch (err) { databaseError = err.message; }
  res.status(databaseError ? 503 : 200).json({
    status: databaseError ? 'DEGRADED' : 'ONLINE',
    system: 'HYGIENE 360 Enterprise Housekeeping Management',
    serverTime: new Date().toISOString(),
    database: db.dialect,
    databaseError,
    storage: storage.useSupabase ? 'supabase' : 'local',
    version: '1.0.0'
  });
});

// Schema / migrations must finish before the first query
app.use(async (req, res, next) => {
  try { await db.ensureReady(); next(); } catch (err) { next(err); }
});

// Photos: Supabase Storage when configured, else the local uploads folder
const uploadsDir = storage.LOCAL_ROOT;
app.use('/uploads', storage.serve, express.static(uploadsDir));
// Same files under /api so photos load through any proxy/tunnel that only forwards /api
app.use('/api/uploads', storage.serve, express.static(uploadsDir));

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

// Slot reminders / missed-slot alerts when there is no long-running process (serverless).
// Called every minute by an external cron with header "Authorization: Bearer <CRON_SECRET>".
app.get('/api/cron/slots', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  await safeRun();
  res.json({ success: true, ranAt: new Date().toISOString() });
});

// Serve frontend in production (Vercel serves client/dist itself)
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
if (!process.env.VERCEL && fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    }
  }));
  app.get('{*path}', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(clientDistPath, 'index.html'));
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

module.exports = app;
