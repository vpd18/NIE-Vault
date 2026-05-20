/* ============================================================
  NIE-Vault — Real-time WebSocket Notifications
   js/notifications.js
   ============================================================ */

let socket = null;
let notificationHistory = []; // Keep track of all notifications

// Initialize Socket.io connection
async function initNotifications() {
  // Only connect if user is logged in
  const user = await Auth.me();
  if (!user) return;

  // Include Socket.io client library from CDN
  if (typeof io === 'undefined') {
    console.warn('Socket.io client not loaded');
    return;
  }

  // Connect with userId in query params for identification
  socket = io({
    query: { userId: user.user_id },
    withCredentials: true
  });

  socket.on('connect', () => {
    console.log('✓ Connected to notifications');
  });

  if (typeof NotificationCenter !== 'undefined') {
    NotificationCenter.init();
    NotificationCenter.load();
  }

  socket.on('disconnect', () => {
    console.log('✗ Disconnected from notifications');
  });

  // Listen for notifications
  socket.on('notification', (data) => {
    if (typeof NotificationCenter !== 'undefined') {
      NotificationCenter.ingest(data);
    }
    handleNotification(data);
  });

  // Broadcast notifications
  socket.on('item_posted', (data) => {
    console.log('📌 New item posted:', data);
    // In real-time, could refresh search page or show badge
  });

  socket.on('item_resolved', (data) => {
    console.log('✓ Item resolved:', data);
  });

  socket.on('item_deleted', (data) => {
    console.log('🗑 Item deleted:', data);
  });
}

// Handle incoming notification events
function handleNotification(notif) {
  const { type, title, message, link, data_json } = notif;

  switch (type) {
    case 'item_claimed':
      handleItemClaimed(data_json);
      break;
    case 'claim_approved':
      handleClaimApproved(data_json);
      break;
    case 'claim_rejected':
      handleClaimRejected(data_json);
      break;
    case 'new_message':
      handleNewMessage(data_json);
      break;
    case 'item_message':
      handleItemMessage(data_json, title, message);
      break;
    default:
      Toast.show(message || 'You have a new notification', 'default');
  }

  // Show persistent notification
  showPersistentNotification({
    type,
    title,
    message,
    link,
    data: data_json
  });

  playNotificationSound();
}

function handleItemClaimed(data) {
  const { claimant_name, message, claim_id, item_id } = data || {};
  Toast.show(`${claimant_name || 'Someone'} claimed your item!`, 'success');
  console.log(`💬 Claim #${claim_id} from ${claimant_name}`);
}

function handleClaimApproved(data) {
  Toast.show('✓ Your claim was approved! Check messages for pickup details.', 'success');
}

function handleClaimRejected(data) {
  Toast.show('✗ Your claim was rejected.', 'error');
}

function handleNewMessage(data) {
  const { sender_name, message } = data || {};
  Toast.show(`📨 ${sender_name || 'Someone'}: ${(message || '').substring(0, 50)}...`, 'default');
}

function handleItemMessage(data, title, message) {
  const { sender_name, item_name } = data || {};
  Toast.show(`💬 ${title || 'New message'}`, 'default');
}

function showPersistentNotification(notif) {
  // Add to notification history
  notificationHistory.unshift({
    ...notif,
    timestamp: new Date(),
    id: Math.random()
  });

  // Keep only recent notifications
  if (notificationHistory.length > 20) {
    notificationHistory.pop();
  }

  // Update notification panel if it exists
  updateNotificationPanel();
}

function updateNotificationPanel() {
  const panel = document.getElementById('notificationPanel');
  if (!panel) return;

  if (notificationHistory.length === 0) {
    panel.innerHTML = '<div class="text-muted text-sm" style="padding:1rem;">No notifications yet</div>';
    return;
  }

  panel.innerHTML = notificationHistory.map(n => `
    <div class="notif-item" onclick="if('${n.link}') window.location.href='${n.link}';" style="cursor:${n.link ? 'pointer' : 'default'};">
      <div class="notif-title">${Helpers.escapeHtml(n.title || 'Notification')}</div>
      <div class="notif-message">${Helpers.escapeHtml(n.message || '')}</div>
      <div class="text-muted text-xs">${formatNotifTime(n.timestamp)}</div>
    </div>
  `).join('');
}

function formatNotifTime(date) {
  const now = new Date();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function playNotificationSound() {
  // Optional: Add notification sound
  // const audio = new Audio('/notification.mp3');
  // audio.play().catch(() => {});
}

// Send custom notification (for testing)
function sendTestNotification() {
  if (socket) {
    socket.emit('notification', {
      type: 'item_claimed',
      data: {
        claimant_name: 'John Doe',
        message: 'I found your item!',
        claim_id: 1,
        item_id: 1
      }
    });
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initNotifications);
