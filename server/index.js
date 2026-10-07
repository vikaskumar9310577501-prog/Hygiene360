const path = require('path');
const fs = require('fs');
const app = require('./app');
const { startSlotScheduler } = require('./utils/slotScheduler');

const PORT = process.env.PORT || 5000;

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
