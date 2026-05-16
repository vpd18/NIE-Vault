// js/report.js
let selectedType = '';

const params = new URLSearchParams(window.location.search);
const urlType = params.get('type');

function selectType(type) {
  selectedType = type;
  document.getElementById('btnLost').classList.toggle('sel-lost',  type === 'lost');
  document.getElementById('btnFound').classList.toggle('sel-found', type === 'found');

  const vSection = document.getElementById('verificationSection');
  vSection.classList.toggle('visible', type === 'lost');

  document.getElementById('pageTitle').textContent = type === 'lost' ? 'Report a Lost Item' : 'Report a Found Item';
  document.getElementById('pageDesc').textContent  = type === 'lost'
    ? 'Fill in the details so finders can identify your item'
    : 'Log the item you found so its owner can claim it';

  const btn = document.getElementById('submitBtn');
  btn.textContent   = type === 'lost' ? 'Submit Lost Report →' : 'Submit Found Report →';
  btn.className     = `btn btn-full btn-${type === 'lost' ? 'amber' : 'jade'}`;
}

function showAlert(msg, type = 'error') {
  document.getElementById('alertBox').innerHTML =
    `<div class="alert alert-${type}">${type === 'error' ? '✕' : '✓'}&nbsp;&nbsp;${msg}</div>`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function submitReport() {
  if (!selectedType) return showAlert('Please select Lost or Found first.');

  const category_id = document.getElementById('category').value;
  const description = document.getElementById('description').value.trim();
  const location    = document.getElementById('location').value.trim();
  const item_date   = document.getElementById('itemDate').value;

  if (!category_id) return showAlert('Please select a category.');
  if (!description)  return showAlert('Please enter a description.');
  if (!location)     return showAlert('Please enter the location.');
  if (!item_date)    return showAlert('Please enter the date.');

  const fd = new FormData();
  fd.append('report_type', selectedType);
  fd.append('category_id', category_id);
  fd.append('color',       document.getElementById('color').value.trim());
  fd.append('description', description);
  fd.append('location',    location);
  fd.append('item_date',   item_date);
  fd.append('item_time',   document.getElementById('itemTime').value);
  if (selectedType === 'lost') {
    fd.append('verification_detail', document.getElementById('verificationDetail').value.trim());
  }
  const img = document.getElementById('imgInput').files[0];
  if (img) fd.append('image', img);

  const btn = document.getElementById('submitBtn');
  btnLoading(btn, true, 'Submitting…');

  try {
    await API.postForm('/api/items', fd);
    Toast.success('Report submitted successfully!');
    setTimeout(() => window.location.href = '/search.html', 900);
  } catch(e) {
    showAlert(e.message);
    btnLoading(btn, false);
  }
}

async function init() {
  const user = await Auth.requireAuth();
  if (!user) return;
  Navbar.init('report');

  // Set today's date
  document.getElementById('itemDate').value = new Date().toISOString().split('T')[0];

  // Load categories
  await loadCategories('category');

  // Image upload
  initImageUpload('uploadZone', 'imgInput', 'imgPreview');

  // Pre-select type from URL
  if (urlType === 'lost' || urlType === 'found') selectType(urlType);
}

init();