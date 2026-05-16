// js/home.js
async function init() {
  const user = await Auth.requireAuth();
  if (!user) return;

  Navbar.init('home');

  // Set hero name
  document.getElementById('heroName').textContent = user.full_name.split(' ')[0];

  // Load stats
  try {
    const [lost, found, resolved] = await Promise.all([
      fetch('/api/items/search?type=lost&status=active').then(r => r.json()),
      fetch('/api/items/search?type=found&status=active').then(r => r.json()),
      fetch('/api/items/search?status=resolved').then(r => r.json()),
    ]);
    document.getElementById('sLost').textContent     = lost.length;
    document.getElementById('sFound').textContent    = found.length;
    document.getElementById('sResolved').textContent = resolved.length;
  } catch {}

  // Load recent items (latest 6)
  try {
    const items = await API.get('/api/items/search?status=active');
    const grid  = document.getElementById('recentGrid');
    const recent = items.slice(0, 6);
    if (!recent.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">📭</div>
        <h3>No items yet</h3>
        <p>Be the first to report a lost or found item on campus.</p>
      </div>`;
      return;
    }
    grid.innerHTML = recent.map(renderCard).join('');
  } catch {}
}

function renderCard(item) {
  const icon = CAT_ICONS[item.category_name] || '📦';
  const img  = item.image_path
    ? `<img class="item-card-img" src="/uploads/${item.image_path}" alt="item"/>`
    : `<div class="item-card-placeholder ${item.report_type}">${icon}</div>`;
  return `
    <a class="item-card animate-fade-up" href="/item.html?id=${item.item_id}">
      ${img}
      <div class="item-card-body">
        <div class="item-card-top">
          <span class="badge badge-${item.report_type}">${item.report_type === 'lost' ? '😟 Lost' : '🎉 Found'}</span>
          <span class="badge badge-${item.status}">${item.status}</span>
        </div>
        <div class="item-card-title mt-8">${item.category_name}${item.color ? ' · ' + item.color : ''}</div>
        <div class="item-card-meta">
          <span>📍 ${item.location}</span>
          <span>📅 ${Helpers.formatDateShort(item.item_date)}</span>
        </div>
        <div class="item-card-desc">${Helpers.escapeHtml(item.description)}</div>
      </div>
    </a>`;
}

function goSearch() {
  const q = document.getElementById('heroSearch').value.trim();
  window.location.href = q ? `/search.html?keyword=${encodeURIComponent(q)}` : '/search.html';
}

document.getElementById('heroSearch').addEventListener('keydown', e => {
  if (e.key === 'Enter') goSearch();
});

init();