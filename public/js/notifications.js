/* ============================================================
  NIE-Vault — Real-time WebSocket Notifications
   js/notifications.js
   ============================================================ */

let socket = null;

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
  const { type, data } = notif;

  switch (type) {
    case 'item_claimed':
      handleItemClaimed(data);
      break;
    case 'claim_approved':
      handleClaimApproved(data);
      break;
    case 'claim_rejected':
      handleClaimRejected(data);
      break;
    case 'new_message':
      handleNewMessage(data);
      break;
  }
}

function handleItemClaimed(data) {
  const { claimant_name, message, claim_id, item_id } = data;
  Toast.show(`${claimant_name} claimed your item!`, 'success');
  
  // Play sound notification (optional)
  playNotificationSound();
  
  // Could add badge to navbar showing pending claims
  console.log(`💬 Claim #${claim_id} from ${claimant_name}`);
}

function handleClaimApproved(data) {
  const { claim_id } = data;
  Toast.show('✓ Your claim was approved! Check messages for pickup details.', 'success');
  playNotificationSound();
}

function handleClaimRejected(data) {
  const { claim_id } = data;
  Toast.show('✗ Your claim was rejected.', 'error');
}

function handleNewMessage(data) {
  const { sender_name, message, claim_id } = data;
  Toast.show(`📨 ${sender_name}: ${message.substring(0, 50)}...`, 'default');
  playNotificationSound();
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
