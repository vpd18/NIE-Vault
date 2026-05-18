// js/reset.js
function showAlert(msg, type='error'){
  const el = document.getElementById('alertBox');
  el.innerHTML = `<div class="alert alert-${type}">${type==='error' ? '✕' : '✓'}&nbsp;&nbsp;${msg}</div>`;
}

function getToken(){
  const p = new URLSearchParams(window.location.search);
  return p.get('token');
}

async function doReset(){
  const pwd = document.getElementById('newPwd').value;
  const c = document.getElementById('confirmPwd').value;
  if (!pwd || !c) return showAlert('Please fill both fields.');
  if (pwd !== c) return showAlert('Passwords do not match.');
  if (pwd.length < 6) return showAlert('Password must be at least 6 characters.');
  const token = getToken();
  if (!token) return showAlert('Invalid reset link.');
  const btn = document.getElementById('resetBtn');
  btnLoading(btn, true, 'Setting…');
  try {
    await API.post('/api/auth/reset', { token, password: pwd });
    showAlert('Password updated. Redirecting to sign in…', 'success');
    setTimeout(() => window.location.href = '/login.html', 1400);
  } catch (e) {
    showAlert(e.message);
    btnLoading(btn, false);
  }
}

// If token missing, show message
if (!getToken()) showAlert('Missing or invalid reset token.');
