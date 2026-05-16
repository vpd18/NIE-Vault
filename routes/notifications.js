const express = require('express');
const db = require('../db');
const { requireLogin } = require('../middleware/auth');

module.exports = function() {
  const router = express.Router();

router.get('/', requireLogin, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT notification_id, user_id, type, title, message, link, data_json, is_read, created_at, read_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.session.userId]
    );
    const items = rows.map(row => ({
      ...row,
      data: row.data_json ? JSON.parse(row.data_json) : {}
    }));
    const unreadCount = items.filter(item => !item.is_read).length;
    res.json({ items, unreadCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.patch('/:id/read', requireLogin, async (req, res) => {
  try {
    const [result] = await db.query(
      'UPDATE notifications SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE notification_id = ? AND user_id = ?',
      [req.params.id, req.session.userId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Notification not found.' });
    res.json({ message: 'Notification marked as read.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.patch('/read-all', requireLogin, async (req, res) => {
  try {
    await db.query(
      'UPDATE notifications SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND is_read = 0',
      [req.session.userId]
    );
    res.json({ message: 'All notifications marked as read.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

  return router;
};