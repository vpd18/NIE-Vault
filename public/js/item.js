// js/item.js
const params = new URLSearchParams(window.location.search);
const itemId = params.get('id');
let meId     = null;
let messageThreads = {}; // Store message threads

async function init() {
  const user = await Auth.requireAuth();
  if (!user) return;
  meId = user.user_id;
  Navbar.init('');

  if (!itemId) {
    document.getElementById('main').innerHTML = `<div class="empty-state"><h3>Item not found</h3><a href="/search.html" class="btn btn-primary btn-sm mt-16">Back to Search</a></div>`;
    return;
  }

  try {
    const item = await API.get('/api/items/' + itemId);
    renderItem(item, user);
  } catch {
    document.getElementById('main').innerHTML = `<div class="empty-state"><h3>Item not found</h3><a href="/search.html" class="btn btn-primary btn-sm mt-16">Back to Search</a></div>`;
  }
}

function renderItem(item, user) {
  const isOwner   = meId === item.user_id;
  const icon      = CAT_ICONS[item.category_name] || '📦';
  const imgHtml   = item.image_path
    ? `<img class="detail-img" src="/uploads/${item.image_path}" alt="item photo"/>`
    : `<div class="detail-img-placeholder ${item.report_type}">${icon}</div>`;

  document.title = `${item.category_name} — NIE-Vault`;

  document.getElementById('main').innerHTML = `
    <div class="breadcrumb animate-fade-in">
      <a href="/search.html">← Browse Items</a>
      <span>/</span>
      <span>${Helpers.escapeHtml(item.category_name)}</span>
    </div>

    ${item.status === 'resolved' ? `
    <div class="resolved-banner animate-fade-up">
      ✅ This item has been returned to its owner.
    </div>` : ''}

    <div class="detail-card animate-fade-up">
      ${imgHtml}
      <div class="detail-body">
        <div class="detail-top">
          <div class="detail-badges">
            <span class="badge badge-${item.report_type}">${item.report_type === 'lost' ? '😟 Lost' : '🎉 Found'}</span>
            <span class="badge badge-${item.status}">${item.status === 'active' ? 'Active' : 'Resolved'}</span>
          </div>
          ${isOwner ? `<button class="btn btn-ghost btn-sm" onclick="deleteItem()">🗑 Delete</button>` : ''}
        </div>

        <h1 class="detail-title">${Helpers.escapeHtml(item.category_name)}${item.color ? ' · ' + Helpers.escapeHtml(item.color) : ''}</h1>

        <div class="meta-grid">
          <div class="meta-item"><div class="mk">📍 Location</div><div class="mv">${Helpers.escapeHtml(item.location)}</div></div>
          <div class="meta-item"><div class="mk">📅 Date</div><div class="mv">${Helpers.formatDate(item.item_date)}</div></div>
          ${item.item_time ? `<div class="meta-item"><div class="mk">🕐 Time</div><div class="mv">${item.item_time}</div></div>` : ''}
          <div class="meta-item"><div class="mk">🗂 Category</div><div class="mv">${Helpers.escapeHtml(item.category_name)}</div></div>
        </div>

        <div class="desc-section">
          <div class="ds-label">Description</div>
          <div class="ds-text">${Helpers.escapeHtml(item.description)}</div>
        </div>

        <div class="divider" style="margin:1.4rem 0;"></div>

        <div class="reporter-row">
          <div class="avatar avatar-ink">${Helpers.initials(item.full_name)}</div>
          <div>
            <div style="font-weight:600;font-size:0.92rem;">${Helpers.escapeHtml(item.full_name)}</div>
            <div class="text-muted text-sm">@${Helpers.escapeHtml(item.username)}</div>
          </div>
          <div class="text-muted text-xs" style="margin-left:auto;">Posted ${Helpers.formatDate(item.created_at)}</div>
        </div>
      </div>
    </div>

    <div id="actionArea"></div>
  `;

  renderActionArea(item, isOwner);
}

function renderActionArea(item, isOwner) {
  const area = document.getElementById('actionArea');

  if (isOwner && item.report_type === 'found') {
    // Owner of found item: see claims
    area.innerHTML = `
      <div class="section-card animate-fade-up">
        <div class="section-card-title">📋 Claims on This Item</div>
        <div id="claimsList"><div class="text-muted text-sm">Loading claims…</div></div>
      </div>`;
    loadClaims();
  }

  if (isOwner && item.report_type === 'lost') {
    // Owner of lost item: see messages from people who have it
    area.innerHTML = `
      <div class="section-card animate-fade-up">
        <div class="section-card-title">💬 Messages About This Item</div>
        <div id="messageThreadsList"><div class="text-muted text-sm">Loading messages…</div></div>
      </div>`;
    loadMessageThreads();
  }

  if (!isOwner && item.report_type === 'found' && item.status === 'active') {
    area.innerHTML += `
      <div class="section-card animate-fade-up">
        <div class="section-card-title">🙋 Is This Your Item?</div>
        <p class="text-sm text-muted" style="margin-bottom:1rem;">Submit a claim — the finder will verify your identity before handing it back.</p>
        <div class="form-group">
          <label class="form-label">Message <span class="hint">(optional)</span></label>
          <textarea class="form-control" id="claimMsg" rows="3" placeholder="Briefly explain why this is yours…"></textarea>
        </div>
        <button class="btn btn-sky claim-btn" id="claimBtn" onclick="submitClaim()">Submit Claim →</button>
      </div>`;
  }

  if (!isOwner && item.report_type === 'lost' && item.status === 'active') {
    // Someone who has a lost item: can message the owner
    area.innerHTML += `
      <div class="section-card animate-fade-up">
        <div class="section-card-title">💝 Do You Have This Item?</div>
        <p class="text-sm text-muted" style="margin-bottom:1rem;">Found this item? Let the owner know by sending them a message.</p>
        <button class="btn btn-jade claim-btn" id="messageBtn" onclick="toggleItemChat()">📬 Send Message →</button>
        <div id="itemChatPanel" style="display:none;margin-top:1rem;">
          <div class="msg-thread" id="itemThread"></div>
          <div class="send-row">
            <textarea class="form-control" id="itemChatIn" placeholder="Tell them about the item and how to reach you…"></textarea>
            <button class="btn btn-primary btn-sm" onclick="sendItemMsg()">Send</button>
          </div>
        </div>
      </div>`;
  }

  if (isOwner && item.status === 'active') {
    area.innerHTML += `
      <div class="resolve-banner animate-fade-up">
        <p>Has this item been returned to its owner? Mark it as resolved to close the report.</p>
        <button class="btn btn-jade btn-sm" onclick="resolveItem()">✓ Mark as Resolved</button>
      </div>`;
  }
}

async function loadClaims() {
  try {
    const claims = await API.get(`/api/claims/item/${itemId}`);
    const el = document.getElementById('claimsList');
    if (!claims.length) {
      el.innerHTML = '<div class="empty-state" style="padding:1.5rem;"><div class="empty-icon" style="font-size:2rem;">📭</div><p>No claims yet.</p></div>';
      return;
    }
    el.innerHTML = claims.map(c => `
      <div class="claim-item" id="claimCard-${c.claim_id}">
        <div class="claim-header">
          <div>
            <div class="claim-name">${Helpers.escapeHtml(c.full_name)}</div>
            <div class="text-muted text-xs">@${Helpers.escapeHtml(c.username)} · ${Helpers.formatDate(c.created_at)}</div>
          </div>
          <span class="badge badge-${c.status}">${c.status}</span>
        </div>
        <div class="claim-body">
          ${c.message ? `<div class="claim-msg">"${Helpers.escapeHtml(c.message)}"</div>` : ''}
          <div class="claim-actions">
            ${c.status === 'pending' ? `
              <button class="btn btn-jade btn-sm" onclick="handleClaim(${c.claim_id},'approved')">✓ Approve</button>
              <button class="btn btn-rose btn-sm" onclick="handleClaim(${c.claim_id},'rejected')">✕ Reject</button>` : ''}
            <button class="btn btn-ghost btn-sm" onclick="toggleChat(${c.claim_id})">💬 Message</button>
          </div>
          <div id="chatPanel-${c.claim_id}" style="display:none;margin-top:1rem;">
            <div class="msg-thread" id="thread-${c.claim_id}"></div>
            <div class="send-row">
              <textarea class="form-control" id="chatIn-${c.claim_id}" placeholder="Ask a verification question…"></textarea>
              <button class="btn btn-primary btn-sm" onclick="sendMsg(${c.claim_id})">Send</button>
            </div>
          </div>
        </div>
      </div>`).join('');
  } catch {}
}

async function handleClaim(claimId, status) {
  try {
    await API.patch(`/api/claims/${claimId}`, { status });
    Toast.success(status === 'approved' ? 'Claim approved! Item marked as resolved.' : 'Claim rejected.');
    setTimeout(() => location.reload(), 1000);
  } catch(e) { Toast.error(e.message); }
}

async function submitClaim() {
  const message = document.getElementById('claimMsg').value.trim();
  const btn     = document.getElementById('claimBtn');
  btnLoading(btn, true, 'Submitting…');
  try {
    await API.post('/api/claims', { item_id: parseInt(itemId), message });
    Toast.success('Claim submitted! The finder will contact you.');
    document.querySelector('.section-card:last-of-type').innerHTML = `
      <div class="section-card-title">🙋 Claim Submitted</div>
      <p class="text-sm text-muted">Your claim is pending. The finder will reach out to verify ownership.</p>`;
  } catch(e) {
    Toast.error(e.message);
    btnLoading(btn, false);
  }
}

async function resolveItem() {
  try {
    await API.patch(`/api/items/${itemId}/resolve`);
    Toast.success('Marked as resolved!');
    setTimeout(() => location.reload(), 900);
  } catch(e) { Toast.error(e.message); }
}

async function deleteItem() {
  if (!confirm('Delete this report? This cannot be undone.')) return;
  try {
    await API.delete(`/api/items/${itemId}`);
    Toast.success('Report deleted.');
    setTimeout(() => window.location.href = '/search.html', 900);
  } catch(e) { Toast.error(e.message); }
}

async function toggleChat(claimId) {
  const panel = document.getElementById(`chatPanel-${claimId}`);
  const open  = panel.style.display === 'none';
  panel.style.display = open ? 'block' : 'none';
  if (open) loadMessages(claimId);
}

async function loadMessages(claimId) {
  try {
    const msgs = await API.get(`/api/claims/${claimId}/messages`);
    const el   = document.getElementById(`thread-${claimId}`);
    if (!msgs.length) {
      el.innerHTML = '<div class="text-muted text-sm" style="padding:4px 0;">No messages yet. Send a verification question.</div>';
      return;
    }
    el.innerHTML = msgs.map(m => `
      <div class="bubble ${m.sender_id === meId ? 'me' : 'them'}">
        <div class="bw">${Helpers.escapeHtml(m.username)}</div>
        ${Helpers.escapeHtml(m.body)}
      </div>`).join('');
    el.scrollTop = el.scrollHeight;
  } catch {}
}

async function sendMsg(claimId) {
  const input = document.getElementById(`chatIn-${claimId}`);
  const body  = input.value.trim();
  if (!body) return;
  try {
    await API.post(`/api/claims/${claimId}/messages`, { body });
    input.value = '';
    loadMessages(claimId);
  } catch(e) { Toast.error(e.message); }
}

// ══════════════════════════════════════════════════════════
// Item messaging functions (for lost items)
// ══════════════════════════════════════════════════════════

async function loadMessageThreads() {
  try {
    const threads = await API.get(`/api/item-messages/item/${itemId}/threads`);
    const el = document.getElementById('messageThreadsList');
    if (!threads || !threads.length) {
      el.innerHTML = '<div class="empty-state" style="padding:1.5rem;"><div class="empty-icon" style="font-size:2rem;">📭</div><p>No one has messaged about this item yet.</p></div>';
      return;
    }
    el.innerHTML = threads.map(t => `
      <div class="claim-item" id="threadCard-${t.other_user_id}">
        <div class="claim-header">
          <div>
            <div class="claim-name">${Helpers.escapeHtml(t.full_name)}</div>
            <div class="text-muted text-xs">@${Helpers.escapeHtml(t.username)} · ${Helpers.formatDate(t.last_message_at)}</div>
          </div>
          ${t.unread_count > 0 ? `<span class="badge" style="background:var(--rose);color:white;">${t.unread_count} new</span>` : ''}
        </div>
        <div class="claim-body">
          <div class="claim-actions">
            <button class="btn btn-ghost btn-sm" onclick="toggleItemChat(${t.other_user_id})">💬 View Messages</button>
          </div>
          <div id="itemChatPanel-${t.other_user_id}" style="display:none;margin-top:1rem;">
            <div class="msg-thread" id="itemThread-${t.other_user_id}"></div>
            <div class="send-row">
              <textarea class="form-control" id="itemChatIn-${t.other_user_id}" placeholder="Reply to their message…"></textarea>
              <button class="btn btn-primary btn-sm" onclick="sendItemMsg(${t.other_user_id})">Send</button>
            </div>
          </div>
        </div>
      </div>`).join('');
  } catch (err) {
    console.error('Error loading message threads:', err);
    document.getElementById('messageThreadsList').innerHTML = '<div class="text-muted text-sm">Error loading messages</div>';
  }
}

async function toggleItemChat(otherUserId = null) {
  if (!otherUserId) {
    // Opening new chat
    const panel = document.getElementById('itemChatPanel');
    const open  = panel.style.display === 'none';
    panel.style.display = open ? 'block' : 'none';
    if (open) {
      // Get item owner's id
      try {
        const item = await API.get(`/api/items/${itemId}`);
        loadItemMessages(item.user_id);
      } catch {}
    }
  } else {
    // Opening existing thread
    const panel = document.getElementById(`itemChatPanel-${otherUserId}`);
    const open  = panel.style.display === 'none';
    panel.style.display = open ? 'block' : 'none';
    if (open) loadItemMessages(otherUserId);
  }
}

async function loadItemMessages(otherUserId) {
  try {
    // Determine which thread element to use
    let el = document.getElementById(`itemThread-${otherUserId}`);
    if (!el) {
      el = document.getElementById('itemThread');
    }
    
    if (!el) {
      console.error('Thread element not found:', `itemThread-${otherUserId}`, 'or itemThread');
      return;
    }
    
    el.innerHTML = '<div class="text-muted text-sm" style="padding:4px 0;">Loading messages…</div>';
    
    const msgs = await API.get(`/api/item-messages/item/${itemId}/user/${otherUserId}`);
    
    if (!msgs || !msgs.length) {
      el.innerHTML = '<div class="text-muted text-sm" style="padding:4px 0;">No messages yet. Start the conversation!</div>';
      return;
    }
    
    el.innerHTML = msgs.map(m => `
      <div class="bubble ${m.sender_id === meId ? 'me' : 'them'}">
        <div class="bw">${Helpers.escapeHtml(m.username)}</div>
        ${Helpers.escapeHtml(m.body)}
      </div>`).join('');
    el.scrollTop = el.scrollHeight;
  } catch (err) {
    console.error('Error loading messages:', err);
    const el = document.getElementById(`itemThread-${otherUserId}`) || document.getElementById('itemThread');
    if (el) el.innerHTML = '<div class="text-muted text-sm">Error loading messages</div>';
  }
}

async function sendItemMsg(otherUserId = null) {
  try {
    // Get item to find owner
    const item = await API.get(`/api/items/${itemId}`);
    const recipientId = otherUserId || item.user_id;
    const inputId = otherUserId ? `itemChatIn-${otherUserId}` : 'itemChatIn';
    const input = document.getElementById(inputId);
    const body  = input.value.trim();
    if (!body) return;
    
    await API.post(`/api/item-messages/item/${itemId}/user/${recipientId}`, { body });
    input.value = '';
    await loadItemMessages(recipientId);
    Toast.success('Message sent!');
  } catch(e) { 
    console.error('Error sending message:', e);
    Toast.error(e.message); 
  }
}

init();