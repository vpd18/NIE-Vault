// js/login.js
function unwrapItems(resp) {
  return Array.isArray(resp) ? resp : (resp?.items || []);
}

function switchTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('tabLogin').classList.toggle('active', isLogin);
  document.getElementById('tabRegister').classList.toggle('active', !isLogin);
  document.getElementById('loginPanel').classList.toggle('active', isLogin);
  document.getElementById('registerPanel').classList.toggle('active', !isLogin);
  document.getElementById('alertBox').innerHTML = '';
}

function showAlert(msg, type = 'error') {
  document.getElementById('alertBox').innerHTML =
    `<div class="alert alert-${type}">${type === 'error' ? '✕' : '✓'}&nbsp;&nbsp;${msg}</div>`;
}

async function doLogin() {
  const login    = document.getElementById('loginId').value.trim();
  const password = document.getElementById('loginPwd').value;
  if (!login || !password) return showAlert('Please fill in both fields.');
  const btn = document.getElementById('loginBtn');
  btnLoading(btn, true, 'Signing in…');
  try {
    await API.post('/api/auth/login', { login, password });
    showAlert('Success! Redirecting…', 'success');
    setTimeout(() => window.location.href = '/home.html', 700);
  } catch(e) {
    showAlert(e.message);
    btnLoading(btn, false);
  }
}

async function doForgot() {
  const email = prompt('Enter your college email or username to reset your password:');
  if (!email) return;
  const btn = document.getElementById('loginBtn');
  btnLoading(btn, true, 'Sending…');
  try {
    await API.post('/api/auth/forgot', { email });
    showAlert('If an account exists, a reset link has been emailed.', 'success');
  } catch (e) {
    showAlert(e.message);
  } finally {
    btnLoading(btn, false);
  }
}

async function doRegister() {
  const full_name = document.getElementById('rName').value.trim();
  const username  = document.getElementById('rUser').value.trim();
  const email     = document.getElementById('rEmail').value.trim();
  const password  = document.getElementById('rPwd').value;
  const phone     = document.getElementById('rPhone').value.trim();
  if (!full_name || !username || !email || !password) return showAlert('Please fill all required fields.');
  if (password.length < 6) return showAlert('Password must be at least 6 characters.');
  const btn = document.getElementById('regBtn');
  btnLoading(btn, true, 'Creating account…');
  try {
    await API.post('/api/auth/register', { full_name, username, email, password, phone });
    showAlert('Registered. Check your college email to verify your account.', 'success');
    setTimeout(() => window.location.href = '/login.html', 1400);
  } catch(e) {
    showAlert(e.message);
    btnLoading(btn, false);
  }
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (document.getElementById('loginPanel').classList.contains('active')) doLogin();
  else doRegister();
});

async function loadStats() {
  try {
    const [lost, found, resolved] = await Promise.all([
      fetch('/api/items/search?type=lost&status=active').then(r=>r.json()),
      fetch('/api/items/search?type=found&status=active').then(r=>r.json()),
      fetch('/api/items/search?status=resolved').then(r=>r.json()),
    ]);
    document.getElementById('ls1').textContent = unwrapItems(lost).length;
    document.getElementById('ls2').textContent = unwrapItems(found).length;
    document.getElementById('ls3').textContent = unwrapItems(resolved).length;
  } catch {}
}
loadStats();