/* ui.js: các bước nhập, kiểm tra từng ô, định dạng số, khung tạm tính. Chạy sau app.js, dùng TG_APP do app.js cung cấp. */
(function () {
  'use strict';
  var A = window.TG_APP, TG = window.TG, D = window.TG_DATA;
  var $ = function (id) { return document.getElementById(id); };
  var step = 1, timer = null;

  /* ---------- Chuyển bước ---------- */
  function go(n, noScroll) {
    step = n;
    document.querySelectorAll('.step').forEach(function (el) { el.hidden = Number(el.getAttribute('data-step')) !== n; });
    document.querySelectorAll('#stepper button').forEach(function (b) {
      var k = Number(b.getAttribute('data-go'));
      b.classList.toggle('on', k === n); b.classList.toggle('done', k < n);
      if (k === n) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    if (!noScroll) { var w = $('wizard'); window.scrollTo({ top: Math.max(0, w.getBoundingClientRect().top + window.pageYOffset - 12), behavior: 'smooth' }); }
    refresh();
  }

  /* ---------- Kiểm tra từng ô ---------- */
  function setBad(id, text) {
    var f = $(id).closest('.field'); if (!f) return;
    var m = f.querySelector('.msg');
    f.classList.toggle('bad', !!text);
    if (m) { m.textContent = text || ''; m.hidden = !text; }
  }
  function num(id) { return A.parseNum($(id).value); }
  function validate(n) {
    var us = A.market() === 'US', first = null;
    function bad(id, t) { setBad(id, t); if (t && !first) first = id; }
    if (n === 2) {
      var c = num('unit_cost');
      bad('unit_cost', c === null ? 'Hãy nhập giá nhập mỗi cái.' : (isNaN(c) || c <= 0 ? 'Giá nhập cần là một số lớn hơn 0.' : ''));
      var q = num('qty');
      bad('qty', (us && (q === null || isNaN(q) || q <= 0)) ? 'Hãy nhập số lượng nhập thử (cần lớn hơn 0).' : (q !== null && isNaN(q) ? 'Cần là một con số.' : ''));
      var w = num('weight_kg');
      bad('weight_kg', (us && (w === null || isNaN(w) || w <= 0)) ? 'Hãy nhập cân nặng mỗi cái (kg), ví dụ 0,2.' : (w !== null && isNaN(w) ? 'Cần là một con số.' : ''));
    }
    if (n === 3) {
      var mg = num('margin');
      bad('margin', (mg === null || isNaN(mg)) ? 'Hãy nhập lãi mong muốn, ví dụ 20.' : ((mg < 0 || mg >= 100) ? 'Lãi mong muốn phải từ 0 đến dưới 100.' : ''));
      var p = num('price');
      bad('price', (p !== null && (isNaN(p) || p <= 0)) ? 'Giá bán cần lớn hơn 0, hoặc để trống.' : '');
    }
    if (first) { $(first).focus(); }
    return !first;
  }
  function next() {
    if (step === 2 && !validate(2)) return;
    if (step === 1) { go(2); return; }
    if (step === 2) go(3);
  }

  /* ---------- Định dạng số kiểu Việt khi rời ô ---------- */
  function fmtShow(n) {
    if (Math.abs(n) >= 1000) return n.toLocaleString('vi-VN', { maximumFractionDigits: 4 });
    return A.fmtIn(n);
  }
  document.querySelectorAll('#form input[inputmode]').forEach(function (el) {
    el.addEventListener('blur', function () {
      var n = A.parseNum(el.value);
      if (n !== null && !isNaN(n)) el.value = fmtShow(n);
    });
    el.addEventListener('input', function () { var f = el.closest('.field'); if (f && f.classList.contains('bad')) setBad(el.id, ''); });
  });

  /* ---------- Khung tạm tính ---------- */
  function setLive(show, msg) {
    $('liveBody').hidden = !show; $('liveEmpty').hidden = show;
    if (!show) $('liveEmpty').textContent = msg || 'Nhập giá nhập ở bước 2, số tiền sẽ hiện ở đây ngay khi bạn gõ.';
  }
  function refresh() {
    var bar = $('liveBar'), m = A.market();
    if (document.body.classList.contains('show-result')) { bar.classList.remove('on'); bar.hidden = true; return; }
    bar.hidden = false;
    var ctx;
    try { ctx = A.collect(); } catch (e) {
      var hint = $('unit_cost').value.trim() === '' ? null : e.message;
      setLive(false, hint); bar.classList.remove('on'); return;
    }
    var r;
    try { r = TG.decide(ctx.inp, ctx.p, D.rates, ctx.stats, { today: new Date().toISOString().slice(0, 10) }); } catch (e2) { setLive(false); bar.classList.remove('on'); return; }
    var e = r.unit_economics;
    if (e.landed_cost === null || e.price === null) { setLive(false, ctx.inp.unit_cost === '' ? null : 'Nhập thêm giá bán dự kiến hoặc chọn nhóm có dữ liệu để thấy lãi.'); bar.classList.remove('on'); return; }
    var po = e.profit_organic;
    var big = $('liveProfit'); big.textContent = A.mny(po, m); big.className = po < 0 ? 'neg' : 'pos';
    $('liveMargin').textContent = 'Biên ' + TG.pctShow(po / e.price) + ' trên giá bán';
    $('livePrice').textContent = A.mny(e.price, m) + (e.price_source === 'trung vị thị trường' ? ' (trung vị TT)' : '');
    $('liveLanded').textContent = A.mny(e.landed_cost, m); $('liveFee').textContent = A.mny(e.platform_fee, m);
    $('liveNote').hidden = e.price_source !== 'trung vị thị trường';
    $('liveNote').textContent = 'Bạn chưa nhập giá bán, đang dùng giá trung vị của nhóm. Nhập giá bán ở bước 3 để chính xác hơn.';
    setLive(true);
    var bv = $('liveBarVal'); bv.textContent = A.mny(po, m); bv.className = po < 0 ? 'neg' : 'pos';
    bar.classList.toggle('on', step >= 2);
  }
  function refreshSoon() { clearTimeout(timer); timer = setTimeout(refresh, 140); }
  $('form').addEventListener('input', refreshSoon);
  $('form').addEventListener('change', refreshSoon);

  /* ---------- Nút và phím ---------- */
  document.querySelectorAll('[data-next]').forEach(function (b) { b.addEventListener('click', next); });
  document.querySelectorAll('[data-back]').forEach(function (b) { b.addEventListener('click', function () { go(Math.max(1, step - 1)); }); });
  document.querySelectorAll('#stepper button').forEach(function (b) {
    b.addEventListener('click', function () {
      var k = Number(b.getAttribute('data-go'));
      if (k <= step) { go(k); return; }
      if (k >= 3 && !validate(2)) { go(2); validate(2); return; }
      go(k);
    });
  });
  // Bắt sự kiện gửi form trước app.js: nhấn Enter ở bước 1, 2 thì sang bước tiếp, ở bước 3 kiểm tra mọi ô rồi mới tính.
  $('form').addEventListener('submit', function (ev) {
    if (step < 3) { ev.preventDefault(); ev.stopImmediatePropagation(); next(); return; }
    var ok2 = validate(2), ok3 = validate(3);
    if (!ok2) { ev.preventDefault(); ev.stopImmediatePropagation(); go(2); validate(2); return; }
    if (!ok3) { ev.preventDefault(); ev.stopImmediatePropagation(); }
  }, true);
  $('fillSample').addEventListener('click', function () {
    var us = A.market() === 'US';
    var v = us ? { unit_cost: '3,5', qty: '300', weight_kg: '0,25', L: '20', W: '15', H: '8', price: '19,99' } : { unit_cost: '35.000', qty: '200', weight_kg: '0,3', L: '', W: '', H: '', price: '89.000' };
    Object.keys(v).forEach(function (k) { $(k).value = v[k]; });
    $('cost_cur').value = us ? 'USD' : 'VND';
    ['unit_cost', 'qty', 'weight_kg'].forEach(function (id) { setBad(id, ''); });
    refresh();
  });

  window.TG_UI = { refresh: refresh, go: go };
  go(1, true);
})();
