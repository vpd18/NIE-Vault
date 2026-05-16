const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../db');
const { requireLogin } = require('../middleware/auth');
const { notifyUser } = require('../ws');

module.exports = function(io) {
  const router = express.Router();

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req, file, cb) => { cb(null, /jpeg|jpg|png|webp/.test(path.extname(file.originalname).toLowerCase())); } });

function normalizeWords(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2);
}

function scoreMatch(source, candidate) {
  let score = 0;

  if (source.category_id === candidate.category_id) score += 4;
  if (source.color && candidate.color) {
    const left = source.color.toLowerCase();
    const right = candidate.color.toLowerCase();
    if (left.includes(right) || right.includes(left)) score += 2;
  }
  if (source.location && candidate.location) {
    const left = source.location.toLowerCase();
    const right = candidate.location.toLowerCase();
    if (left.includes(right) || right.includes(left)) score += 2;
  }

  const sourceWords = new Set(normalizeWords(source.description));
  let shared = 0;
  normalizeWords(candidate.description).forEach(word => {
    if (sourceWords.has(word)) shared += 1;
  });
  score += Math.min(shared, 3);

  return score;
}

async function notifyPotentialMatches(io, item) {
  const targetType = item.report_type === 'lost' ? 'found' : 'lost';
  const [rows] = await db.query(
    `SELECT i.item_id, i.user_id, i.category_id, i.report_type, i.color, i.location, i.description,
            c.name AS category_name, u.full_name, u.email
     FROM items i
     JOIN categories c ON i.category_id = c.category_id
     JOIN users u ON i.user_id = u.user_id
     WHERE i.status = 'active' AND i.report_type = ? AND i.item_id <> ?`,
    [targetType, item.item_id]
  );

  const matches = rows
    .map(row => ({ row, score: scoreMatch(item, row) }))
    .filter(entry => entry.score >= 5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  for (const { row } of matches) {
    await notifyUser(io, row.user_id, 'item_match', {
      item_id: item.item_id,
      matched_item_id: row.item_id,
      item_title: `${item.category_name}${item.color ? ' · ' + item.color : ''}`,
      matched_item_title: `${row.category_name}${row.color ? ' · ' + row.color : ''}`,
      message: item.report_type === 'found'
        ? 'This could be your lost item.'
        : 'This could be a found item you reported.',
      link: `/item.html?id=${item.item_id}`
    });
  }
}

router.get('/categories', async (req, res) => {
  try { const [rows] = await db.query('SELECT * FROM categories ORDER BY name'); res.json(rows); }
  catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

router.get('/search', async (req, res) => {
  const { type, category_id, color, location, keyword, status = 'active' } = req.query;
  let sql = `SELECT i.item_id, i.report_type, i.status, i.color, i.location, i.description, i.item_date, i.item_time, i.image_path, i.created_at, i.user_id, c.name AS category_name, u.full_name, u.username FROM items i JOIN categories c ON i.category_id = c.category_id JOIN users u ON i.user_id = u.user_id WHERE i.status = ?`;
  const params = [status];
  if (type) { sql += ' AND i.report_type = ?'; params.push(type); }
  if (category_id) { sql += ' AND i.category_id = ?'; params.push(category_id); }
  if (color) { sql += ' AND i.color LIKE ?'; params.push('%' + color + '%'); }
  if (location) { sql += ' AND i.location LIKE ?'; params.push('%' + location + '%'); }
  if (keyword) { sql += ' AND MATCH(i.description) AGAINST(? IN BOOLEAN MODE)'; params.push(keyword); }
  sql += ' ORDER BY i.created_at DESC LIMIT 50';
  try { const [rows] = await db.query(sql, params); const safe = rows.map(({ verification_detail, ...rest }) => rest); res.json(safe); }
  catch (err) { console.error(err); res.status(500).json({ error: 'Search failed.' }); }
});

router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT i.item_id, i.report_type, i.status, i.color, i.location, i.description, i.item_date, i.item_time, i.image_path, i.created_at, i.user_id, c.name AS category_name, u.full_name, u.username FROM items i JOIN categories c ON i.category_id = c.category_id JOIN users u ON i.user_id = u.user_id WHERE i.item_id = ?`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Item not found.' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

router.post('/', requireLogin, upload.single('image'), async (req, res) => {
  const { report_type, category_id, color, location, description, item_date, item_time, verification_detail } = req.body;
  if (!report_type || !category_id || !location || !description || !item_date)
    return res.status(400).json({ error: 'Missing required fields.' });
  if (!['lost', 'found'].includes(report_type))
    return res.status(400).json({ error: 'report_type must be lost or found.' });
  const image_path = req.file ? req.file.filename : null;
  const vd = report_type === 'lost' ? (verification_detail || null) : null;
  try {
    const [result] = await db.query(`INSERT INTO items (user_id, category_id, report_type, color, location, description, item_date, item_time, image_path, verification_detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [req.session.userId, category_id, report_type, color || null, location, description, item_date, item_time || null, image_path, vd]);
    const [insertedRows] = await db.query(
      `SELECT i.item_id, i.user_id, i.category_id, i.report_type, i.color, i.location, i.description, i.status,
              c.name AS category_name, u.full_name, u.username
       FROM items i
       JOIN categories c ON i.category_id = c.category_id
       JOIN users u ON i.user_id = u.user_id
       WHERE i.item_id = ?`,
      [result.insertId]
    );
    const insertedItem = insertedRows[0];
    
    // 🔔 Broadcast new item to all connected users
    io.emit('item_posted', {
      item_id: result.insertId,
      report_type: report_type,
      category_id: category_id,
      location: location
    });

    void notifyPotentialMatches(io, insertedItem).catch(err => console.error(err));
    
    res.status(201).json({ message: 'Item posted.', itemId: result.insertId });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

router.patch('/:id/resolve', requireLogin, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT user_id FROM items WHERE item_id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Item not found.' });
    if (rows[0].user_id !== req.session.userId) return res.status(403).json({ error: 'Not your item.' });
    await db.query("UPDATE items SET status = 'resolved' WHERE item_id = ?", [req.params.id]);
    
    // 🔔 Broadcast item resolved
    io.emit('item_resolved', { item_id: req.params.id });
    
    res.json({ message: 'Item marked as resolved.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

router.delete('/:id', requireLogin, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT user_id FROM items WHERE item_id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Item not found.' });
    if (rows[0].user_id !== req.session.userId) return res.status(403).json({ error: 'Not your item.' });
    await db.query('DELETE FROM items WHERE item_id = ?', [req.params.id]);
    
    // 🔔 Broadcast item deleted
    io.emit('item_deleted', { item_id: req.params.id });
    
    res.json({ message: 'Item deleted.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// 🔐 Get verification detail for owner only (used in claim verification)
router.get('/:id/verification', requireLogin, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT user_id, report_type, verification_detail FROM items WHERE item_id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Item not found.' });
    if (rows[0].user_id !== req.session.userId) 
      return res.status(403).json({ error: 'Only the owner can view verification detail.' });
    if (rows[0].report_type !== 'lost')
      return res.status(400).json({ error: 'Only lost items have verification details.' });
    
    res.json({ 
      item_id: req.params.id,
      verification_detail: rows[0].verification_detail 
    });
  } catch (err) { 
    console.error(err);
    res.status(500).json({ error: 'Server error.' }); 
  }
});

  return router;
};