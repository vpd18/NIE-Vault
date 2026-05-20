// routes/itemMessages.js - Routes for direct item-to-item messaging
const express = require('express');
const db = require('../db');
const { requireLogin } = require('../middleware/auth');
const { notifyUser } = require('../ws');

module.exports = function(io) {
  const router = express.Router();

  // Get all messages for an item between two users
  router.get('/item/:itemId/user/:otherUserId', requireLogin, async (req, res) => {
    try {
      const { itemId, otherUserId } = req.params;
      const userId = req.session.userId;

      // Verify both users have access to this item
      const [item] = await db.query('SELECT user_id, report_type FROM items WHERE item_id = ?', [itemId]);
      if (!item.length) return res.status(404).json({ error: 'Item not found.' });

      const itemOwnerId = item[0].user_id;
      const isItemOwner = userId === itemOwnerId;
      const isOtherUserItemOwner = parseInt(otherUserId) === itemOwnerId;

      // Only allow messaging between the item owner and another user
      if (!isItemOwner && !isOtherUserItemOwner) {
        return res.status(403).json({ error: 'Not authorized.' });
      }

      // Get messages between the two users for this item
      const [messages] = await db.query(
        `SELECT m.*, u.username, u.full_name
         FROM item_messages m 
         JOIN users u ON m.sender_id = u.user_id
         WHERE m.item_id = ? 
         AND ((m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?))
         ORDER BY m.sent_at ASC`,
        [itemId, userId, otherUserId, otherUserId, userId]
      );

      console.log(`Fetched ${messages.length} messages for item ${itemId} between users ${userId} and ${otherUserId}`);

      // Mark messages as read
      await db.query(
        `UPDATE item_messages 
         SET is_read = 1, read_at = CURRENT_TIMESTAMP 
         WHERE item_id = ? AND recipient_id = ? AND sender_id = ? AND is_read = 0`,
        [itemId, userId, otherUserId]
      );

      res.json(messages);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error.' });
    }
  });

  // Get all message threads for an item (for item owner to see)
  router.get('/item/:itemId/threads', requireLogin, async (req, res) => {
    try {
      const itemId = req.params.itemId;
      const userId = req.session.userId;

      // Verify user owns this item
      const [item] = await db.query('SELECT user_id FROM items WHERE item_id = ?', [itemId]);
      if (!item.length) return res.status(404).json({ error: 'Item not found.' });
      if (item[0].user_id !== userId) return res.status(403).json({ error: 'Not your item.' });

      // Get distinct users who have messaged about this item - simpler approach
      const query = `
        SELECT 
          CASE 
            WHEN sender_id = ? THEN recipient_id 
            ELSE sender_id 
          END as other_user_id
        FROM item_messages
        WHERE item_id = ? AND (sender_id = ? OR recipient_id = ?)
        GROUP BY other_user_id
      `;
      
      const [userIds] = await db.query(query, [userId, itemId, userId, userId]);
      
      if (!userIds.length) {
        console.log(`No message threads for item ${itemId}`);
        return res.json([]);
      }

      // Get details for each user
      const threads = [];
      for (const row of userIds) {
        const other_user_id = row.other_user_id;
        
        const [userInfo] = await db.query(
          'SELECT user_id, username, full_name FROM users WHERE user_id = ?',
          [other_user_id]
        );
        
        if (!userInfo.length) continue;
        
        const [lastMsg] = await db.query(
          `SELECT MAX(sent_at) as last_message_at FROM item_messages 
           WHERE item_id = ? AND (
             (sender_id = ? AND recipient_id = ?) OR 
             (sender_id = ? AND recipient_id = ?)
           )`,
          [itemId, userId, other_user_id, other_user_id, userId]
        );
        
        const [unreadCount] = await db.query(
          `SELECT COUNT(*) as cnt FROM item_messages 
           WHERE item_id = ? AND recipient_id = ? AND sender_id = ? AND is_read = 0`,
          [itemId, userId, other_user_id]
        );
        
        threads.push({
          other_user_id: other_user_id,
          username: userInfo[0].username,
          full_name: userInfo[0].full_name,
          last_message_at: lastMsg[0].last_message_at,
          unread_count: unreadCount[0].cnt
        });
      }
      
      // Sort by last message
      threads.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));

      console.log(`Fetched ${threads.length} message threads for item ${itemId} owner ${userId}`);

      res.json(threads);
    } catch (err) {
      console.error('Error fetching threads:', err);
      res.status(500).json({ error: 'Server error.' });
    }
  });

  // Send a message
  router.post('/item/:itemId/user/:recipientId', requireLogin, async (req, res) => {
    try {
      const { itemId, recipientId } = req.params;
      const { body } = req.body;
      const senderId = req.session.userId;

      if (!body || !body.trim()) return res.status(400).json({ error: 'Message body is required.' });
      if (parseInt(senderId) === parseInt(recipientId)) {
        return res.status(400).json({ error: 'Cannot message yourself.' });
      }

      // Get item details
      const [items] = await db.query(
        'SELECT i.user_id, c.name AS category_name FROM items i JOIN categories c ON i.category_id = c.category_id WHERE i.item_id = ?',
        [itemId]
      );
      if (!items.length) return res.status(404).json({ error: 'Item not found.' });

      const itemOwnerId = items[0].user_id;
      const isItemOwner = senderId === itemOwnerId;
      const isRecipientItemOwner = parseInt(recipientId) === itemOwnerId;

      // Only allow messaging between item owner and another user
      if ((!isItemOwner && !isRecipientItemOwner)) {
        return res.status(403).json({ error: 'Only the item owner can participate in item messaging.' });
      }
      if (isItemOwner && isRecipientItemOwner) {
        return res.status(400).json({ error: 'Cannot message yourself.' });
      }

      // Insert message
      const [result] = await db.query(
        'INSERT INTO item_messages (item_id, sender_id, recipient_id, body) VALUES (?, ?, ?, ?)',
        [itemId, senderId, recipientId, body.trim()]
      );

      // Get sender details for notification
      const [sender] = await db.query(
        'SELECT full_name FROM users WHERE user_id = ?',
        [senderId]
      );

      // 🔔 Notify recipient
      notifyUser(io, parseInt(recipientId), 'item_message', {
        item_id: itemId,
        item_name: items[0].category_name,
        sender_name: sender[0].full_name,
        message: body.trim().substring(0, 100),
        link: `/item.html?id=${itemId}`
      });

      res.status(201).json({ 
        message_id: result.insertId,
        message: 'Message sent.',
        sender_id: senderId,
        sent_at: new Date()
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error.' });
    }
  });

  // Mark message as read
  router.patch('/:messageId/read', requireLogin, async (req, res) => {
    try {
      const [msg] = await db.query(
        'SELECT recipient_id FROM item_messages WHERE message_id = ?',
        [req.params.messageId]
      );
      if (!msg.length) return res.status(404).json({ error: 'Message not found.' });
      if (msg[0].recipient_id !== req.session.userId) {
        return res.status(403).json({ error: 'Not your message.' });
      }

      await db.query(
        'UPDATE item_messages SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE message_id = ?',
        [req.params.messageId]
      );

      res.json({ message: 'Message marked as read.' });
    } catch (err) {
      res.status(500).json({ error: 'Server error.' });
    }
  });

  // Get unread message count for current user
  router.get('/unread-count', requireLogin, async (req, res) => {
    try {
      const [result] = await db.query(
        'SELECT COUNT(*) as count FROM item_messages WHERE recipient_id = ? AND is_read = 0',
        [req.session.userId]
      );
      res.json({ unread_count: result[0].count });
    } catch (err) {
      res.status(500).json({ error: 'Server error.' });
    }
  });

  return router;
};
