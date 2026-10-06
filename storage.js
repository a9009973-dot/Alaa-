/* وتر: تخزين دائم + نسخة احتياطية تلقائية لـ localStorage داخل IndexedDB */
(function () {
  'use strict';
  var DBN = 'watar-ls', ST = 'kv', KEY = 'snapshot', FLAG = 'watar-restored';
  var ls, proto = Storage.prototype;
  try { ls = window.localStorage; ls.length; } catch (e) { return; }

  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {}); } catch (e) {}

  function open() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open(DBN, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(ST); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function run(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(ST, mode), q = fn(tx.objectStore(ST));
        tx.oncomplete = function () { res(q && q.result); db.close(); };
        tx.onerror = tx.onabort = function () { rej(tx.error); db.close(); };
      });
    });
  }
  function snap() {
    var o = {}, i, k;
    for (i = 0; i < ls.length; i++) { k = ls.key(i); o[k] = ls.getItem(k); }
    return o;
  }

  var pending = false, queue = [], tm = 0;
  var rawSet = proto.setItem, rawRemove = proto.removeItem, rawClear = proto.clear;

  function save() {
    if (pending) return;
    clearTimeout(tm);
    tm = setTimeout(flush, 400);
  }
  function flush() {
    tm = 0;
    if (pending) return;
    var s = snap();
    run('readwrite', function (o) { return o.put(s, KEY); }).catch(function () {});
  }

  // نمسك الكتابات لحين انتهاء الاستعادة كي لا تُدهس البيانات المستعادة
  proto.setItem = function (k, v) {
    if (this !== ls) return rawSet.call(this, k, v);
    if (pending) { queue.push(['s', k, v]); return; }
    rawSet.call(this, k, v); save();
  };
  proto.removeItem = function (k) {
    if (this !== ls) return rawRemove.call(this, k);
    if (pending) { queue.push(['r', k]); return; }
    rawRemove.call(this, k); save();
  };
  proto.clear = function () {
    if (this !== ls) return rawClear.call(this);
    if (pending) { queue.push(['c']); return; }
    rawClear.call(this); save();
  };

  function drain() {
    pending = false;
    queue.splice(0).forEach(function (q) {
      if (q[0] === 's') rawSet.call(ls, q[1], q[2]);
      else if (q[0] === 'r') rawRemove.call(ls, q[1]);
      else rawClear.call(ls);
    });
    save();
  }

  // إن كان localStorage فارغًا (مُسح) نحاول الاستعادة من IndexedDB
  if (ls.length === 0 && window.indexedDB) {
    pending = true;
    run('readonly', function (o) { return o.get(KEY); }).then(function (s) {
      var n = s ? Object.keys(s) : [];
      if (n.length) {
        n.forEach(function (k) { rawSet.call(ls, k, s[k]); });
        pending = false; queue.length = 0;
        var done = false;
        try { done = sessionStorage.getItem(FLAG); sessionStorage.setItem(FLAG, '1'); } catch (e) {}
        if (!done) { location.reload(); return; }
        save();
      } else drain();
    }).catch(drain);
  } else {
    save();
  }

  addEventListener('pagehide', function () { if (!pending) flush(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden && !pending) flush(); });
  window.__watarRestore = function () {
    return run('readonly', function (o) { return o.get(KEY); }).then(function (s) {
      if (s) Object.keys(s).forEach(function (k) { rawSet.call(ls, k, s[k]); });
      return !!s;
    });
  };
})();
