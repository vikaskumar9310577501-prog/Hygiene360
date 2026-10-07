const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate } = require('../middleware/auth');

// Get notifications for current user
router.get('/', authenticate, (req, res) => {
  const userId = req.user.id;

  const notifications = db.all(`
    SELECT * FROM notifications 
    WHERE user_id = ? 
    ORDER BY created_at DESC LIMIT 50
  `, [userId]);

  const unreadCountRow = db.get(`
    SELECT COUNT(*) as unread_count 
    FROM notifications 
    WHERE user_id = ? AND is_read = 0
  `, [userId]);

  res.json({
    success: true,
    unreadCount: unreadCountRow ? unreadCountRow.unread_count : 0,
    notifications
  });
});

// Mark single notification read
router.patch('/:id/read', authenticate, (req, res) => {
  db.run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  res.json({ success: true });
});

// Mark all read
router.post('/mark-all-read', authenticate, (req, res) => {
  db.run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
  res.json({ success: true, message: 'All notifications marked as read' });
});

module.exports = router;
