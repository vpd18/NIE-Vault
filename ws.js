// ws.js — WebSocket (Socket.io) setup for real-time notifications

const socketIO = require('socket.io');
const db = require('./db');
const { sendMail } = require('./mailer');

// Track active user connections: { userId: socketId }
const userConnections = {};
let notificationsReady = false;

async function ensureNotificationsTable() {
  if (notificationsReady) return;
  await db.query(`CREATE TABLE IF NOT EXISTS notifications (
    notification_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(160) NOT NULL,
    message TEXT NOT NULL,
    link VARCHAR(255) DEFAULT NULL,
    data_json LONGTEXT NULL,
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP NULL DEFAULT NULL,
    INDEX idx_notifications_user_read (user_id, is_read),
    INDEX idx_notifications_user_created (user_id, created_at)
  )`);
  notificationsReady = true;
}

function buildNotificationPayload(eventType, data = {}) {
  switch (eventType) {
    case 'item_claimed':
      return {
        title: 'New claim received',
        message: `${data.claimant_name || 'Someone'} claimed your item.${data.message ? ` Message: ${data.message}` : ''}`,
        link: data.link || (data.item_id ? `/item.html?id=${data.item_id}` : '/home.html')
      };
    case 'claim_approved':
      return {
        title: 'Claim approved',
        message: 'Your claim was approved. Check the item page for next steps.',
        link: data.link || (data.item_id ? `/item.html?id=${data.item_id}` : '/home.html')
      };
    case 'claim_rejected':
      return {
        title: 'Claim rejected',
        message: 'Your claim was rejected by the finder.',
        link: data.link || (data.item_id ? `/item.html?id=${data.item_id}` : '/home.html')
      };
    case 'new_message':
      return {
        title: 'New message',
        message: `${data.sender_name || 'Someone'}: ${data.message || 'sent you a message'}`,
        link: data.link || (data.item_id ? `/item.html?id=${data.item_id}` : '/home.html')
      };
    case 'item_match':
      return {
        title: 'Possible item match',
        message: data.message || 'This could be your lost item.',
        link: data.link || (data.item_id ? `/item.html?id=${data.item_id}` : '/search.html')
      };
    case 'item_message':
      return {
        title: `Message about ${data.item_name || 'an item'}`,
        message: `${data.sender_name || 'Someone'}: ${data.message || 'sent you a message'}`,
        link: data.link || (data.item_id ? `/item.html?id=${data.item_id}` : '/home.html')
      };
    default:
      return {
        title: 'Notification',
        message: data.message || 'You have a new notification.',
        link: data.link || '/home.html'
      };
  }
}

async function saveNotification(userId, eventType, data) {
  await ensureNotificationsTable();
  const payload = buildNotificationPayload(eventType, data);
  const [result] = await db.query(
    `INSERT INTO notifications (user_id, type, title, message, link, data_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, eventType, payload.title, payload.message, payload.link || null, JSON.stringify(data || {})]
  );
  return { notification_id: result.insertId, ...payload };
}

async function sendEmailNotification(userId, eventType, payload) {
  const emailTypes = new Set(['item_claimed', 'claim_approved', 'claim_rejected', 'new_message', 'item_message', 'item_match']);
  if (!emailTypes.has(eventType)) return;

  const [rows] = await db.query('SELECT email, full_name FROM users WHERE user_id = ?', [userId]);
  if (rows.length === 0 || !rows[0].email) return;

  const subject = payload.title;
  const text = `${payload.message}\n\nOpen: ${process.env.APP_URL || 'http://localhost:3000'}${payload.link || ''}`;
  const html = `
    <p>Hi ${rows[0].full_name || 'there'},</p>
    <p>${payload.message}</p>
    <p><a href="${process.env.APP_URL || 'http://localhost:3000'}${payload.link || ''}">Open in app</a></p>
  `;

  await sendMail({ to: rows[0].email, subject, text, html });
}

function initWebSocket(server) {
  const io = socketIO(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    // Extract userId from socket handshake data or session
    const userId = socket.handshake.query.userId;
    
    if (userId) {
      userConnections[userId] = socket.id;
      console.log(`User ${userId} connected (${socket.id})`);
      
      // Join user-specific room for targeted notifications
      socket.join(`user:${userId}`);
    }

    socket.on('disconnect', () => {
      if (userId && userConnections[userId] === socket.id) {
        delete userConnections[userId];
        console.log(`User ${userId} disconnected`);
      }
    });
  });

  ensureNotificationsTable().catch(err => {
    console.error('Notification table init failed:', err.message);
  });
  return io;
}

// Helper to notify a specific user
async function notifyUser(io, userId, eventType, data, options = {}) {
  try {
    const saved = await saveNotification(userId, eventType, data);
    const payload = {
      notification_id: saved.notification_id,
      type: eventType,
      title: saved.title,
      message: saved.message,
      link: saved.link,
      data: data || {},
      timestamp: new Date().toISOString()
    };

    io.to(`user:${userId}`).emit('notification', payload);

    if (options.email !== false) {
      await sendEmailNotification(userId, eventType, saved);
    }
  } catch (err) {
    console.error('Notification dispatch failed:', err.stack || err.message);
  }
}

// Helper to notify item owner
function notifyItemOwner(io, itemOwnerId, eventType, data) {
  notifyUser(io, itemOwnerId, eventType, data);
}

module.exports = {
  initWebSocket,
  notifyUser,
  notifyItemOwner,
  userConnections
};
