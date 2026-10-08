// Vercel serverless entry: every /api/* and /uploads/* request is handled by the Express app
// Stray errors from OCR / OpenCV workers must not take down the whole function
process.on('uncaughtException', err => console.error('Uncaught exception (handled):', err?.message || err));
process.on('unhandledRejection', reason => console.error('Unhandled rejection (handled):', reason?.message || reason));

module.exports = require('../server/app');
