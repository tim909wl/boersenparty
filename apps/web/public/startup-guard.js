(function () {
  var startupError = '';
  window.addEventListener('error', function (event) {
    startupError = event && event.message ? String(event.message) : 'Unbekannter JavaScript-Fehler';
  });
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event && event.reason;
    startupError = reason && reason.message ? String(reason.message) : String(reason || 'Unbehandelter Startfehler');
  });
  window.setTimeout(function () {
    var root = document.getElementById('root');
    if (!root || root.childNodes.length) return;
    var box = document.createElement('main');
    box.style.cssText = 'min-height:100vh;box-sizing:border-box;background:#0f1216;color:#f4f6f8;padding:28px;font:16px system-ui,-apple-system,Segoe UI,sans-serif';
    box.innerHTML = '<div style="max-width:560px;margin:10vh auto;border-top:2px solid #ff5a5f;padding-top:18px">' +
      '<div style="color:#ff5a5f;font-size:12px;font-weight:800;letter-spacing:.14em">LADEFEHLER</div>' +
      '<h1 style="font-size:24px;margin:10px 0">Die App konnte nicht starten.</h1>' +
      '<p style="color:#a1a9b5;line-height:1.5">Bitte die Seite neu laden. Falls sie wieder erscheint, diese Meldung fotografieren:</p>' +
      '<pre style="white-space:pre-wrap;word-break:break-word;background:#161b21;color:#ff7b7f;padding:12px;border-radius:8px">' + escapeHtml(startupError || 'App-Skript wurde nicht ausgeführt') + '</pre>' +
      '<button id="startupReload" style="width:100%;min-height:48px;margin-top:12px;border:0;border-radius:8px;background:#f2b84b;color:#16120a;font-weight:800;font-size:16px">Neu laden</button></div>';
    document.body.innerHTML = '';
    document.body.appendChild(box);
    document.getElementById('startupReload').onclick = function () { window.location.reload(); };
  }, 5000);
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }
}());
