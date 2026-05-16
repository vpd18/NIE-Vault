/* ============================================================
  NIE-Vault — Global JS Utilities
   js/app.js
   ============================================================ */

// ── API Helper ───────────────────────────────────────────────
const API = {
  async get(url) {
    const res = await fetch(url, { credentials: 'include' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },
  async post(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },
  async postForm(url, formData) {
    const res = await fetch(url, { method: 'POST', credentials: 'include', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },
  async patch(url, body) {
    const res = await fetch(url, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },
  async delete(url) {
    const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }
};

// ── Toast Notifications ──────────────────────────────────────
const Toast = {
  container: null,
  init() {
    if (this.container) return;
    this.container = document.createElement('div');
    this.container.className = 'toast-container';
    document.body.appendChild(this.container);
  },
  show(message, type = 'default', duration = 3500) {
    this.init();
    const icons = { success: '✓', error: '✕', default: '●' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || icons.default}</span><span>${message}</span>`;
    this.container.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'fadeIn 0.3s reverse forwards';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },
  success(msg) { this.show(msg, 'success'); },
  error(msg)   { this.show(msg, 'error'); }
};

// ── Auth ─────────────────────────────────────────────────────
const Auth = {
  _user: null,
  async me() {
    if (this._user) return this._user;
    try {
      this._user = await API.get('/api/auth/me');
      return this._user;
    } catch {
      return null;
    }
  },
  async requireAuth() {
    const user = await this.me();
    if (!user) { window.location.href = '/login.html'; return null; }
    return user;
  },
  async logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/login.html';
  }
};

// ── Navbar ───────────────────────────────────────────────────
const Navbar = {
  async init(activePage) {
    const user = await Auth.me();

    const nav = document.getElementById('navbar');
    if (!nav) return;

    // Sticky shadow on scroll
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 10);
    }, { passive: true });

    // Highlight active link
    nav.querySelectorAll('.nav-item[data-page]').forEach(el => {
      if (el.dataset.page === activePage) el.classList.add('active');
    });

    // User display
    const userEl = nav.querySelector('#nav-user');
    if (userEl && user) userEl.textContent = user.full_name.split(' ')[0];

    // Logout
    const logoutBtn = nav.querySelector('#nav-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', () => Auth.logout());

    if (typeof NotificationCenter !== 'undefined') {
      NotificationCenter.init();
    }
  }
};

// ── Helpers ──────────────────────────────────────────────────
const Helpers = {
  formatDate(d) {
    return new Date(d).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  },
  formatDateShort(d) {
    return new Date(d).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short'
    });
  },
  initials(name) {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
  },
  truncate(str, n = 100) {
    return str.length > n ? str.substring(0, n) + '…' : str;
  },
  escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  },
  debounce(fn, delay = 300) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
  }
};

// Category emoji map
const CAT_ICONS = {
  'Wallet / Purse':        '👛',
  'ID Card':               '🪪',
  'Gadget / Electronics':  '📱',
  'Stationery':            '✏️',
  'Bag / Backpack':        '🎒',
  'Keys':                  '🔑',
  'Money':                 '💵',
  'Watch':                 '⌚',
  'Clothing':              '👕',
  'Other':                 '📦'
};

// ── Button Loading State ─────────────────────────────────────
function btnLoading(btn, loading, label) {
  if (loading) {
    btn._label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> ${label || 'Loading…'}`;
  } else {
    btn.disabled = false;
    btn.innerHTML = btn._label || label;
  }
}

// ── Image Upload Preview ─────────────────────────────────────
function initImageUpload(zoneId, inputId, previewId) {
  const zone    = document.getElementById(zoneId);
  const input   = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  if (!zone || !input) return;

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) { input.files = e.dataTransfer.files; handlePreview(); }
  });
  input.addEventListener('change', handlePreview);

  function handlePreview() {
    const file = input.files[0];
    if (!file || !preview) return;
    const reader = new FileReader();
    reader.onload = e => {
      preview.src = e.target.result;
      preview.style.display = 'block';
      zone.querySelector('.upload-icon').textContent = '✅';
      zone.querySelector('p').textContent = file.name;
    };
    reader.readAsDataURL(file);
  }
}

// ── Load categories into a <select> ─────────────────────────
async function loadCategories(selectId) {
  try {
    const cats = await API.get('/api/items/categories');
    const sel  = document.getElementById(selectId);
    if (!sel) return cats;
    cats.forEach(c => {
      const o = document.createElement('option');
      o.value = c.category_id;
      o.textContent = `${CAT_ICONS[c.name] || '📦'} ${c.name}`;
      sel.appendChild(o);
    });
    return cats;
  } catch { return []; }
}

// ── Persistent Notification Center ──────────────────────────
const NotificationCenter = {
  ready: false,
  items: [],
  unreadCount: 0,

  init() {
    if (this.ready) return;
    this.ready = true;

    if (!document.getElementById('notificationPanel')) {
      const panel = document.createElement('aside');
      panel.id = 'notificationPanel';
      panel.className = 'notification-panel';
      panel.innerHTML = `
        <div class="notification-panel-header">
          <div>
            <div class="notification-panel-eyebrow">Inbox</div>
            <h3>Notifications</h3>
          </div>
          <div class="notification-panel-actions">
            <button class="btn btn-ghost btn-sm" id="notifMarkAllBtn" type="button">Mark all read</button>
            <button class="btn btn-ghost btn-sm" id="notifCloseBtn" type="button">Close</button>
          </div>
        </div>
        <div class="notification-panel-body" id="notificationList">
          <div class="notification-empty">Loading…</div>
        </div>`;
      document.body.appendChild(panel);

      const backdrop = document.createElement('div');
      backdrop.id = 'notificationBackdrop';
      backdrop.className = 'notification-backdrop';
      document.body.appendChild(backdrop);
    }

    const navActions = document.querySelector('#navbar .navbar-actions');
    if (navActions && !document.getElementById('notificationBellBtn')) {
      const bell = document.createElement('button');
      bell.id = 'notificationBellBtn';
      bell.type = 'button';
      bell.className = 'btn btn-ghost btn-sm notification-bell';
      bell.innerHTML = '🔔 <span class="notification-badge" id="notificationBadge" hidden>0</span>';
      navActions.insertBefore(bell, navActions.firstChild);
    }

    this.bind();
    this.load();
  },

  bind() {
    const bell = document.getElementById('notificationBellBtn');
    const close = document.getElementById('notifCloseBtn');
    const markAll = document.getElementById('notifMarkAllBtn');
    const backdrop = document.getElementById('notificationBackdrop');

    if (bell && !bell.dataset.bound) {
      bell.dataset.bound = '1';
      bell.addEventListener('click', () => this.open());
    }
    if (close && !close.dataset.bound) {
      close.dataset.bound = '1';
      close.addEventListener('click', () => this.close());
    }
    if (backdrop && !backdrop.dataset.bound) {
      backdrop.dataset.bound = '1';
      backdrop.addEventListener('click', () => this.close());
    }
    if (markAll && !markAll.dataset.bound) {
      markAll.dataset.bound = '1';
      markAll.addEventListener('click', () => this.markAllRead());
    }
  },

  async load() {
    try {
      const data = await API.get('/api/notifications');
      this.items = data.items || [];
      this.unreadCount = data.unreadCount || 0;
      this.render();
    } catch (err) {
      this.items = [];
      this.unreadCount = 0;
      this.render('No notifications yet.');
    }
  },

  render(emptyMessage) {
    const list = document.getElementById('notificationList');
    if (!list) return;

    const badge = document.getElementById('notificationBadge');
    if (badge) {
      badge.textContent = this.unreadCount > 99 ? '99+' : String(this.unreadCount);
      badge.hidden = this.unreadCount === 0;
    }

    if (!this.items.length) {
      list.innerHTML = `<div class="notification-empty">${emptyMessage || 'No notifications yet.'}</div>`;
      return;
    }

    list.innerHTML = this.items.map(item => `
      <button class="notification-item ${item.is_read ? '' : 'unread'}" data-id="${item.notification_id}" data-link="${Helpers.escapeHtml(item.link || '')}">
        <div class="notification-dot"></div>
        <div class="notification-item-body">
          <div class="notification-item-top">
            <span class="notification-title">${Helpers.escapeHtml(item.title)}</span>
            <span class="notification-time">${Helpers.formatDateShort(item.created_at)}</span>
          </div>
          <div class="notification-message">${Helpers.escapeHtml(item.message)}</div>
        </div>
      </button>`).join('');

    list.querySelectorAll('.notification-item').forEach(el => {
      if (el.dataset.bound) return;
      el.dataset.bound = '1';
      el.addEventListener('click', () => this.openItem(el.dataset.id, el.dataset.link));
    });
  },

  async openItem(id, link) {
    if (id) await this.markRead(id);
    if (link) window.location.href = link;
  },

  async markRead(id) {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
      const item = this.items.find(entry => String(entry.notification_id) === String(id));
      if (item && !item.is_read) {
        item.is_read = 1;
        this.unreadCount = Math.max(0, this.unreadCount - 1);
        this.render();
      }
    } catch {}
  },

  async markAllRead() {
    try {
      await fetch('/api/notifications/read-all', { method: 'PATCH' });
      this.items = this.items.map(item => ({ ...item, is_read: 1 }));
      this.unreadCount = 0;
      this.render();
    } catch {}
  },

  open() {
    document.getElementById('notificationPanel')?.classList.add('open');
    document.getElementById('notificationBackdrop')?.classList.add('open');
    this.load();
  },

  close() {
    document.getElementById('notificationPanel')?.classList.remove('open');
    document.getElementById('notificationBackdrop')?.classList.remove('open');
  },

  ingest(notification) {
    const payload = {
      notification_id: notification.notification_id || notification.id || `live-${Date.now()}`,
      type: notification.type,
      title: notification.title || this.titleFor(notification),
      message: notification.message || this.messageFor(notification),
      link: notification.link || notification.data?.link || '',
      created_at: notification.timestamp || new Date().toISOString(),
      is_read: 0,
      data: notification.data || {}
    };

    this.items = [payload, ...this.items.filter(item => String(item.notification_id) !== String(payload.notification_id))];
    this.unreadCount += 1;
    this.render();
  },

  titleFor(notification) {
    const titles = {
      item_claimed: 'New claim received',
      claim_approved: 'Claim approved',
      claim_rejected: 'Claim rejected',
      new_message: 'New message',
      item_match: 'Possible item match'
    };
    return titles[notification.type] || 'Notification';
  },

  messageFor(notification) {
    if (notification.type === 'item_match') return 'This could be your lost item.';
    if (notification.type === 'new_message') return notification.data?.message || 'You received a message.';
    return notification.data?.message || 'You have a new notification.';
  }
};