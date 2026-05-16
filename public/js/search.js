// js/search.js
let currentType = '';

function setType(t) {
  currentType = t;
  document.getElementById('pillAll').className   = 'type-pill' + (t === ''      ? ' p-all'   : '');
  document.getElementById('pillLost').className  = 'type-pill' + (t === 'lost'  ? ' p-lost'  : '');
  document.getElementById('pillFound').className = 'type-pill' + (t === 'found' ? ' p-found' : '');
  doSearch();
}

function renderCard(item) {
  const icon = CAT_ICONS[item.category_name] || '📦';
  const img  = item.image_path
    ? `<img class="item-card-img" src="/uploads/${item.image_path}" alt="item"/>`
    : `<div class="item-card-placeholder ${item.report_type}">${icon}</div>`;
  return `
    <a class="item-card" href="/item.html?id=${item.item_id}">
      ${img}
      <div class="item-card-body">
        <div class="item-card-top">
          <span class="badge badge-${item.report_type}">${item.report_type === 'lost' ? '😟 Lost' : '🎉 Found'}</span>
          <span class="badge badge-${item.status}">${item.status}</span>
        </div>
        <div class="item-card-title mt-8">${Helpers.escapeHtml(item.category_name)}${item.color ? ' · ' + Helpers.escapeHtml(item.color) : ''}</div>
        <div class="item-card-meta">
          <span>📍 ${Helpers.escapeHtml(item.location)}</span>
          <span>📅 ${Helpers.formatDateShort(item.item_date)} · 👤 ${Helpers.escapeHtml(item.full_name)}</span>
        </div>
        <div class="item-card-desc">${Helpers.escapeHtml(item.description)}</div>
      </div>
    </a>`;
}

function renderSkeletons() {
  return Array(6).fill(0).map(() => `
    <div class="skel-card">
      <div class="skeleton skel-img"></div>
      <div class="skel-body">
        <div class="skeleton skel-line short"></div>
        <div class="skeleton skel-line"></div>
        <div class="skeleton skel-line short"></div>
      </div>
    </div>`).join('');
}

async function doSearch() {
  document.getElementById('grid').innerHTML = renderSkeletons();
  document.getElementById('resultCount').textContent = '';

  const p = new URLSearchParams();
  if (currentType) p.set('type', currentType);
  const kw  = document.getElementById('fKeyword').value.trim();
  const cat = document.getElementById('fCategory').value;
  const col = document.getElementById('fColor').value.trim();
  const loc = document.getElementById('fLocation').value.trim();
  if (kw)  p.set('keyword', kw);
  if (cat) p.set('category_id', cat);
  if (col) p.set('color', col);
  if (loc) p.set('location', loc);

  try {
    const items = await API.get('/api/items/search?' + p.toString());
    const n = items.length;
    document.getElementById('resultCount').textContent = `${n} item${n !== 1 ? 's' : ''} found`;

    if (!n) {
      document.getElementById('grid').innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-icon">🔍</div>
          <h3>No items match your search</h3>
          <p>Try different keywords or filters, or <a href="/report.html?type=lost">report a lost item</a>.</p>
        </div>`;
      return;
    }
    document.getElementById('grid').innerHTML = items.map(renderCard).join('');
    // stagger animation
    document.querySelectorAll('.item-card').forEach((el, i) => {
      el.style.animation = `fadeUp 0.4s ${0.04 * i}s var(--ease-out) both`;
    });
  } catch(e) {
    document.getElementById('grid').innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>Error loading items. Please try again.</p></div>`;
  }
}

function clearAll() {
  document.getElementById('fKeyword').value  = '';
  document.getElementById('fCategory').value = '';
  document.getElementById('fColor').value    = '';
  document.getElementById('fLocation').value = '';
  setType('');
}

async function init() {
  const user = await Auth.requireAuth();
  if (!user) return;
  Navbar.init('search');
  await loadCategories('fCategory');

  // URL param from home page
  const qp = new URLSearchParams(window.location.search);
  if (qp.get('keyword')) document.getElementById('fKeyword').value = qp.get('keyword');

  // Enter key
  ['fKeyword','fColor','fLocation'].forEach(id =>
    document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); })
  );

  doSearch();
}

init();