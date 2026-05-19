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

function escapeLike(value) {
  return String(value || '').replace(/[\\%_]/g, '\\$&');
}

function buildKeywordSearch(keyword) {
  const trimmed = String(keyword || '').trim().toLowerCase();
  let tokens = [...new Set(normalizeWords(trimmed))];
  // If tokenization removed everything (e.g. short words like 'id'), fall back to using the raw term
  if (tokens.length === 0 && trimmed.length > 0) tokens = [trimmed];
  // Only build a boolean full-text query for tokens that are long enough (MySQL default minlength ~3)
  const ftTokens = tokens.filter(t => t.length >= 3);
  const booleanQuery = ftTokens.length > 0 ? ftTokens.map(token => `+${token}*`).join(' ') : '';
  const phraseLike = `%${escapeLike(tokens.join('%'))}%`;
  const tokenLikes = tokens.map(token => `%${escapeLike(token)}%`);
  const numericId = /^\d+$/.test(trimmed) ? Number(trimmed) : null;

  return {
    tokens,
    booleanQuery,
    phraseLike,
    tokenLikes,
    numericId
  };
}

// Ensure a FULLTEXT index exists on searchable columns
let _fulltextChecked = false;
async function ensureFulltextIndex() {
  if (_fulltextChecked) return;
  try {
    const [idx] = await db.query("SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'items' AND INDEX_NAME = 'idx_items_fulltext'");
    if (idx[0].cnt === 0) {
      await db.query("CREATE FULLTEXT INDEX idx_items_fulltext ON items(description, location, color)");
      console.log('Created FULLTEXT index idx_items_fulltext');
    }
  } catch (err) {
    console.warn('Could not ensure fulltext index:', err.message || err);
  }
  _fulltextChecked = true;
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

router.get('/suggest', async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const limit = Math.min(10, Math.max(3, parseInt(req.query.limit, 10) || 8));

  if (q.length < 1) {
    return res.json({ suggestions: [] });
  }

  try {
    const like = `%${escapeLike(q)}%`;
    const prefixLike = `${escapeLike(q)}%`;

    const [rows] = await db.query(
      `SELECT suggestion, suggestion_type
       FROM (
         SELECT c.name AS suggestion, 'category' AS suggestion_type, 1 AS sort_rank
         FROM categories c
         WHERE LOWER(c.name) LIKE ? OR LOWER(c.name) LIKE ?

         UNION ALL

         SELECT DISTINCT CONCAT(c.name, CASE WHEN i.color IS NOT NULL AND i.color <> '' THEN CONCAT(' · ', i.color) ELSE '' END) AS suggestion,
                'item' AS suggestion_type,
                2 AS sort_rank
         FROM items i
         JOIN categories c ON i.category_id = c.category_id
         WHERE i.status = 'active'
           AND (
             LOWER(c.name) LIKE ? OR
             LOWER(i.description) LIKE ? OR
             LOWER(i.location) LIKE ? OR
             LOWER(i.color) LIKE ?
           )
       ) AS suggestions
       ORDER BY sort_rank, suggestion
       LIMIT ?`,
      [prefixLike, like, like, like, like, like, limit]
    );

    const seen = new Set();
    const suggestions = rows
      .map(row => ({ label: row.suggestion, value: row.suggestion, type: row.suggestion_type }))
      .filter(entry => {
        const key = entry.value.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    res.json({ suggestions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Suggestion lookup failed.' });
  }
});

router.get('/search', async (req, res) => {
  // Prevent browsers/proxies from returning cached (304) responses for search
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  const { type, category_id, color, location, keyword, status = 'active', page = 1, per_page = 20 } = req.query;
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const per = Math.min(100, Math.max(5, parseInt(per_page, 10) || 20));
  const offset = (pg - 1) * per;

  const baseWhere = [];
  const params = [];
  baseWhere.push('i.status = ?'); params.push(status);
  if (type) { baseWhere.push('i.report_type = ?'); params.push(type); }
  if (category_id) { baseWhere.push('i.category_id = ?'); params.push(category_id); }
  if (color) { baseWhere.push('i.color LIKE ?'); params.push('%' + color + '%'); }
  if (location) { baseWhere.push('i.location LIKE ?'); params.push('%' + location + '%'); }

  const baseFrom = `FROM items i JOIN categories c ON i.category_id = c.category_id JOIN users u ON i.user_id = u.user_id`;
  const baseWhereSql = baseWhere.length ? `WHERE ${baseWhere.join(' AND ')}` : '';

  try {
    await ensureFulltextIndex();

    const keywordInfo = keyword ? buildKeywordSearch(keyword) : null;
    const keywordParts = [];
    const keywordParams = [];

    if (keywordInfo) {
      if (keywordInfo.booleanQuery) {
        keywordParts.push("MATCH(i.description, i.location, i.color) AGAINST(? IN BOOLEAN MODE)");
        keywordParams.push(keywordInfo.booleanQuery);
      }

      const tokenScope = [];
      if (keywordInfo.phraseLike && keywordInfo.tokens.length) {
        tokenScope.push("i.description LIKE ?"); keywordParams.push(keywordInfo.phraseLike);
        tokenScope.push("i.location LIKE ?"); keywordParams.push(keywordInfo.phraseLike);
        tokenScope.push("i.color LIKE ?"); keywordParams.push(keywordInfo.phraseLike);
        tokenScope.push("c.name LIKE ?"); keywordParams.push(keywordInfo.phraseLike);
        tokenScope.push("u.full_name LIKE ?"); keywordParams.push(keywordInfo.phraseLike);
        tokenScope.push("u.username LIKE ?"); keywordParams.push(keywordInfo.phraseLike);
      }

      for (const tokenLike of keywordInfo.tokenLikes) {
        tokenScope.push("i.description LIKE ?"); keywordParams.push(tokenLike);
        tokenScope.push("i.location LIKE ?"); keywordParams.push(tokenLike);
        tokenScope.push("i.color LIKE ?"); keywordParams.push(tokenLike);
        tokenScope.push("c.name LIKE ?"); keywordParams.push(tokenLike);
        tokenScope.push("u.full_name LIKE ?"); keywordParams.push(tokenLike);
        tokenScope.push("u.username LIKE ?"); keywordParams.push(tokenLike);
      }

      tokenScope.push("i.report_type LIKE ?");
      keywordParams.push(`%${escapeLike(String(keyword).trim().toLowerCase())}%`);

      if (keywordInfo.numericId !== null) {
        tokenScope.push("i.item_id = ?");
        keywordParams.push(keywordInfo.numericId);
      }

      keywordParts.push(`(${tokenScope.join(' OR ')})`);
    }

    const keywordWhereSql = keywordParts.length ? `AND (${keywordParts.join(' OR ')})` : '';

    const countSql = `SELECT COUNT(*) AS total ${baseFrom} ${baseWhereSql} ${keywordWhereSql}`;
    const countParams = [...params, ...keywordParams];
    const [countRows] = await db.query(countSql, countParams);
    const total = countRows[0] ? Number(countRows[0].total) : 0;

      const relevanceExpr = keywordInfo && keywordInfo.booleanQuery
        ? `MATCH(i.description, i.location, i.color) AGAINST(? IN BOOLEAN MODE)`
        : '0';

    const scoreParts = [];
    const scoreParams = [];
    if (keywordInfo) {
      if (keywordInfo.booleanQuery) {
        scoreParts.push(`(${relevanceExpr} * 10)`);
        scoreParams.push(keywordInfo.booleanQuery);
      }
      if (keywordInfo.phraseLike) {
        // Exact category name equality: very large boost when the user's phrase equals the category
        scoreParts.push(`CASE WHEN LOWER(c.name) = LOWER(?) THEN 200 ELSE 0 END`);
        scoreParams.push(String(keyword).trim());

        // Strong category-name containment boost (phrase match)
        scoreParts.push(`CASE WHEN LOWER(c.name) LIKE LOWER(?) THEN 60 ELSE 0 END`);
        scoreParams.push(keywordInfo.phraseLike);

        // Smaller additional category phrase boost
        scoreParts.push(`CASE WHEN c.name LIKE ? THEN 6 ELSE 0 END`);
        scoreParams.push(keywordInfo.phraseLike);
        scoreParts.push(`CASE WHEN i.description LIKE ? THEN 2 ELSE 0 END`);
        scoreParams.push(keywordInfo.phraseLike);
        scoreParts.push(`CASE WHEN i.location LIKE ? THEN 3 ELSE 0 END`);
        scoreParams.push(keywordInfo.phraseLike);
        scoreParts.push(`CASE WHEN i.color LIKE ? THEN 2 ELSE 0 END`);
        scoreParams.push(keywordInfo.phraseLike);
        scoreParts.push(`CASE WHEN u.full_name LIKE ? THEN 2 ELSE 0 END`);
        scoreParams.push(keywordInfo.phraseLike);
        scoreParts.push(`CASE WHEN u.username LIKE ? THEN 2 ELSE 0 END`);
        scoreParams.push(keywordInfo.phraseLike);
      }
      if (keywordInfo.numericId !== null) {
        scoreParts.push(`CASE WHEN i.item_id = ? THEN 20 ELSE 0 END`);
        scoreParams.push(keywordInfo.numericId);
      }
    }

    const scoreExpr = scoreParts.length ? `(${scoreParts.join(' + ')})` : '0';

    // Build SELECT-level params (placeholders inside SELECT expressions)
    const selectParams = [];
    if (keywordInfo && keywordInfo.booleanQuery) {
      // relevanceExpr placeholder (MATCH ...) appears once in SELECT
      // scoreParts may reference MATCH(...) again; provide booleanQuery for both
      selectParams.push(keywordInfo.booleanQuery);
      // if scoreParts includes MATCH(...) as first element, provide second occurrence
      if (scoreParts.length && String(scoreParts[0]).includes('MATCH(')) selectParams.push(keywordInfo.booleanQuery);
    }
    if (keywordInfo && keywordInfo.phraseLike) {
      // exact equality param first (LOWER(c.name) = ?), then phrase-like params
      selectParams.push(String(keyword).trim()); // exact equality for category name
      selectParams.push(keywordInfo.phraseLike); // strong LOWER(c.name) LIKE ?
      selectParams.push(keywordInfo.phraseLike); // c.name
      selectParams.push(keywordInfo.phraseLike); // i.description
      selectParams.push(keywordInfo.phraseLike); // i.location
      selectParams.push(keywordInfo.phraseLike); // i.color
      selectParams.push(keywordInfo.phraseLike); // u.full_name
      selectParams.push(keywordInfo.phraseLike); // u.username
    }
    if (keywordInfo && keywordInfo.numericId !== null) selectParams.push(keywordInfo.numericId);

    const listSql = `SELECT i.item_id, i.report_type, i.status, i.color, i.location, i.description, i.item_date, i.item_time, i.image_path, i.created_at, i.user_id, c.name AS category_name, u.full_name, u.username, ${relevanceExpr} AS relevance, ${scoreExpr} AS score ${baseFrom} ${baseWhereSql} ${keywordWhereSql} ORDER BY score DESC, relevance DESC, i.created_at DESC LIMIT ? OFFSET ?`;

    // Final param order: SELECT params, base WHERE params, keyword WHERE params, LIMIT, OFFSET
    const listParams = [...selectParams, ...params, ...keywordParams, per, offset];
    const [rows] = await db.query(listSql, listParams);
    const safe = rows.map(({ verification_detail, ...rest }) => rest);
    return res.json({ items: safe, page: pg, per_page: per, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Search failed.' });
  }
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