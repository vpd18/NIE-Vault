const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const { requireLogin } = require('../middleware/auth');
const router = express.Router();

router.post('/register', async (req, res) => {
  const { full_name, email, username, password, phone } = req.body;
  if (!full_name || !email || !username || !password)
    return res.status(400).json({ error: 'All fields are required.' });
  try {
    const [existing] = await db.query('SELECT user_id FROM users WHERE email = ? OR username = ?', [email, username]);
    if (existing.length > 0) return res.status(409).json({ error: 'Email or username already taken.' });
    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query('INSERT INTO users (full_name, email, username, password_hash, phone) VALUES (?, ?, ?, ?, ?)', [full_name, email, username, hash, phone || null]);
    req.session.userId = result.insertId;
    req.session.username = username;
    res.status(201).json({ message: 'Registered successfully.', userId: result.insertId });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

router.post('/login', async (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) return res.status(400).json({ error: 'Login and password are required.' });
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ? OR username = ?', [login, login]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials.' });
    const match = await bcrypt.compare(password, rows[0].password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials.' });
    req.session.userId = rows[0].user_id;
    req.session.username = rows[0].username;
    res.json({ message: 'Logged in.', userId: rows[0].user_id, username: rows[0].username });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

router.post('/logout', (req, res) => { req.session.destroy(() => res.json({ message: 'Logged out.' })); });

router.get('/me', requireLogin, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT user_id, full_name, email, username, phone, created_at FROM users WHERE user_id = ?', [req.session.userId]);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

module.exports = router;