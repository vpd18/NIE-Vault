const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const { requireLogin } = require('../middleware/auth');
const crypto = require('crypto');
const { sendMail } = require('../mailer');
const router = express.Router();
const BRANCHES = ['is','cs','ci'];
const collegeEmailRegex = new RegExp(`^\\d{4}(?:${BRANCHES.join('|')})_[a-z0-9_]+@nie\\.ac\\.in$`, 'i');

router.post('/register', async (req, res) => {
  const { full_name, email, username, password, phone } = req.body;
  if (!full_name || !email || !username || !password)
    return res.status(400).json({ error: 'All fields are required.' });
  // enforce college email pattern
  if (!collegeEmailRegex.test(email)) return res.status(400).json({ error: 'Please use your college email (example: 2024is_your_name_a@nie.ac.in).' });
  try {
    const [existing] = await db.query('SELECT user_id, email_verified FROM users WHERE email = ? OR username = ?', [email, username]);
    if (existing.length > 0) return res.status(409).json({ error: 'Email or username already taken.' });
    const hash = await bcrypt.hash(password, 10);
    // ensure email_verified column exists
    const [cols] = await db.query("SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='email_verified'");
    if (cols[0].cnt === 0) await db.query("ALTER TABLE users ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0");
    const [result] = await db.query('INSERT INTO users (full_name, email, username, password_hash, phone, email_verified) VALUES (?, ?, ?, ?, ?, 0)', [full_name, email, username, hash, phone || null]);

    // create email_verifications table
    await db.query(`CREATE TABLE IF NOT EXISTS email_verifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      token VARCHAR(128) NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX(token)
    )`);

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 3600 * 1000); // 24 hours
    await db.query('INSERT INTO email_verifications (user_id, token, expires_at) VALUES (?, ?, ?)', [result.insertId, token, expires]);

    const base = process.env.BASE_URL || (`${req.protocol}://${req.get('host')}`);
    const verifyLink = `${base}/verify.html?token=${token}`;
    const html = `<p>Hello ${username},</p><p>Click the link below to verify your NIE-Vault account (valid for 24 hours):</p><p><a href="${verifyLink}">${verifyLink}</a></p>`;
    try { await sendMail({ to: email, subject: 'Verify your NIE-Vault email', html, text: `Verify: ${verifyLink}` }); } catch (e) { console.error('Mail send failed', e); }

    // do not auto-login; require verification
    res.status(201).json({ message: 'Registered. Please check your college email to verify your account.' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

router.post('/login', async (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) return res.status(400).json({ error: 'Login and password are required.' });
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ? OR username = ?', [login, login]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials.' });
    const user = rows[0];
    // Must be a college email and verified
    if (!collegeEmailRegex.test(user.email) || !user.email_verified) return res.status(403).json({ error: 'Email not verified. Please check your college email.' });
    const match = await bcrypt.compare(password, user.password_hash);
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

// Password reset: request
router.post('/forgot', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required.' });
  try {
    const [rows] = await db.query('SELECT user_id, email, username FROM users WHERE email = ? OR username = ?', [email, email]);
    if (rows.length === 0) return res.json({ message: 'If an account exists, a reset link has been sent.' });
    const user = rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600 * 1000); // 1 hour
    await db.query(`CREATE TABLE IF NOT EXISTS password_resets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      token VARCHAR(128) NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX(token)
    )`);
    await db.query('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)', [user.user_id, token, expires]);
    const base = process.env.BASE_URL || (`${req.protocol}://${req.get('host')}`);
    const resetLink = `${base}/reset.html?token=${token}`;
    const html = `<p>Hello ${user.username || ''},</p><p>Click the link below to reset your password (valid for 1 hour):</p><p><a href="${resetLink}">${resetLink}</a></p>`;
    try { await sendMail({ to: user.email, subject: 'Reset your NIE-Vault password', html, text: `Reset your password: ${resetLink}` }); } catch (e) { console.error('Mail send failed', e); }
    return res.json({ message: 'If an account exists, a reset link has been sent.' });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Server error.' }); }
});

// Password reset: apply new password
router.post('/reset', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Invalid request.' });
  try {
    const [rows] = await db.query('SELECT * FROM password_resets WHERE token = ? AND expires_at > NOW()', [token]);
    if (rows.length === 0) return res.status(400).json({ error: 'Invalid or expired token.' });
    const pr = rows[0];
    const hash = await bcrypt.hash(password, 10);
    await db.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [hash, pr.user_id]);
    await db.query('DELETE FROM password_resets WHERE user_id = ?', [pr.user_id]);
    res.json({ message: 'Password has been reset. You can now sign in.' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

// Email verification endpoint
router.get('/verify', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token required.' });
  try {
    const [rows] = await db.query('SELECT * FROM email_verifications WHERE token = ? AND expires_at > NOW()', [token]);
    if (rows.length === 0) return res.status(400).json({ error: 'Invalid or expired token.' });
    const ev = rows[0];
    await db.query('UPDATE users SET email_verified = 1 WHERE user_id = ?', [ev.user_id]);
    await db.query('DELETE FROM email_verifications WHERE user_id = ?', [ev.user_id]);
    res.json({ message: 'Email verified. You can now sign in.' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

module.exports = router;
