const express = require('express');
const db = require('../db');
const { requireLogin } = require('../middleware/auth');
const { notifyUser } = require('../ws');

module.exports = function(io) {
  const router = express.Router();

router.post('/', requireLogin, async (req, res) => {
  const { item_id, message } = req.body;
  if (!item_id) return res.status(400).json({ error: 'item_id is required.' });
  try {
    const [items] = await db.query(
      "SELECT user_id, report_type, status FROM items WHERE item_id = ?", [item_id]
    );
    if (items.length === 0) return res.status(404).json({ error: 'Item not found.' });
    if (items[0].report_type !== 'found')
      return res.status(400).json({ error: 'You can only claim found items.' });
    if (items[0].status !== 'active')
      return res.status(400).json({ error: 'This item is already resolved.' });
    if (items[0].user_id === req.session.userId)
      return res.status(400).json({ error: 'You cannot claim your own post.' });
    
    const [result] = await db.query(
      'INSERT INTO claims (item_id, claimant_id, message) VALUES (?, ?, ?)',
      [item_id, req.session.userId, message || null]
    );
    
    // 🔔 Notify item owner
    const [claimant] = await db.query('SELECT full_name FROM users WHERE user_id = ?', [req.session.userId]);
    notifyUser(io, items[0].user_id, 'item_claimed', {
      item_id: item_id,
      claimant_name: claimant[0].full_name,
      message: message,
      claim_id: result.insertId,
      link: `/item.html?id=${item_id}`
    });
    
    res.status(201).json({ message: 'Claim submitted.', claimId: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'You already submitted a claim for this item.' });
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.get('/item/:itemId', requireLogin, async (req, res) => {
  try {
    const [items] = await db.query('SELECT user_id FROM items WHERE item_id = ?', [req.params.itemId]);
    if (items.length === 0) return res.status(404).json({ error: 'Item not found.' });
    if (items[0].user_id !== req.session.userId)
      return res.status(403).json({ error: 'Not your item.' });
    const [claims] = await db.query(
      `SELECT cl.*, u.full_name, u.username, u.email
       FROM claims cl JOIN users u ON cl.claimant_id = u.user_id
       WHERE cl.item_id = ? ORDER BY cl.created_at DESC`,
      [req.params.itemId]
    );
    res.json(claims);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.patch('/:id', requireLogin, async (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status))
    return res.status(400).json({ error: 'status must be approved or rejected.' });
  try {
    const [claims] = await db.query(
      `SELECT cl.claim_id, cl.item_id, cl.claimant_id, i.user_id AS item_owner
       FROM claims cl JOIN items i ON cl.item_id = i.item_id
       WHERE cl.claim_id = ?`,
      [req.params.id]
    );
    if (claims.length === 0) return res.status(404).json({ error: 'Claim not found.' });
    if (claims[0].item_owner !== req.session.userId)
      return res.status(403).json({ error: 'Only the finder can approve/reject claims.' });
    
    await db.query('UPDATE claims SET status = ? WHERE claim_id = ?', [status, req.params.id]);
    if (status === 'approved') {
      await db.query("UPDATE items SET status = 'resolved' WHERE item_id = ?", [claims[0].item_id]);
    }
    
    // 🔔 Notify claimant
    notifyUser(io, claims[0].claimant_id, 'claim_' + status, {
      claim_id: claims[0].claim_id,
      item_id: claims[0].item_id,
      status: status,
      link: `/item.html?id=${claims[0].item_id}`
    });
    
    res.json({ message: 'Claim ' + status + '.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.get('/:id/messages', requireLogin, async (req, res) => {
  try {
    const [msgs] = await db.query(
      `SELECT m.*, u.username, u.full_name
       FROM messages m JOIN users u ON m.sender_id = u.user_id
       WHERE m.claim_id = ? ORDER BY m.sent_at ASC`,
      [req.params.id]
    );
    res.json(msgs);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/:id/messages', requireLogin, async (req, res) => {
  const { body } = req.body;
  if (!body) return res.status(400).json({ error: 'Message body is required.' });
  try {
    const [claims] = await db.query(
      `SELECT cl.claimant_id, cl.item_id, i.user_id AS item_owner
       FROM claims cl JOIN items i ON cl.item_id = i.item_id
       WHERE cl.claim_id = ?`,
      [req.params.id]
    );
    if (claims.length === 0) return res.status(404).json({ error: 'Claim not found.' });
    const { claimant_id, item_owner } = claims[0];
    if (req.session.userId !== claimant_id && req.session.userId !== item_owner)
      return res.status(403).json({ error: 'Not part of this claim.' });
    
    const [result] = await db.query(
      'INSERT INTO messages (claim_id, sender_id, body) VALUES (?, ?, ?)',
      [req.params.id, req.session.userId, body]
    );
    
    // 🔔 Notify the other party
    const recipientId = req.session.userId === claimant_id ? item_owner : claimant_id;
    const [sender] = await db.query('SELECT full_name FROM users WHERE user_id = ?', [req.session.userId]);
    notifyUser(io, recipientId, 'new_message', {
      claim_id: req.params.id,
      sender_name: sender[0].full_name,
      message: body,
      item_id: claims[0].item_id,
      link: `/item.html?id=${claims[0].item_id}`
    });
    
    res.status(201).json({ message: 'Message sent.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

  return router;
};