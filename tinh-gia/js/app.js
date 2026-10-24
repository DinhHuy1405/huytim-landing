/* app.js: giao diện công cụ tính giá. Chỉ xử lý form, gọi TG.decide (pricing.js) và vẽ kết quả.
 * Toàn bộ chạy trong trình duyệt, không gửi dữ liệu đi đâu. Lịch sử lưu ở localStorage của máy này. */
(function () {
  'use strict';
  var D = window.TG_DATA, TG = window.TG;
  var $ = function (id) { return document.getElementById(id); };
  var HKEY = 'tg_hist_v1';

  /* ---------- Đọc và hiển thị số kiểu Việt ---------- */
  function parseNum(v) {
    if (v === null || v === undefined) return null;
    var s = String(v).trim().replace(/\s/g, '');
    if (s === '') return null;
    if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.indexOf(',') >= 0) s = s.replace(',', '.');
    else if (s.indexOf('.') >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    var n = Number(s);
    return isFinite(n) ? n : NaN;
  }
  function fmtIn(n) { return (n === null || n === undefined) ? '' : String(Math.round(n * 10000) / 10000).replace('.', ','); }
  function val(id) { return $(id).value; }
  function market() { return document.querySelector('input[name=market]:checked').value; }
  function statsFor(m) { return D.stats.filter(function (s) { return s.market === m; }); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------- Khởi tạo ---------- */
  function fillAdvanced(m) {
    var p = D.params, f = p.fees[m];
    $('ads_pct').value = fmtIn(p.ads_pct * 100); $('returns_pct').value = fmtIn(p.returns_pct * 100);
    $('other_marketing').value = fmtIn(p.other_marketing); $('variable_cost').value = fmtIn(p.variable_cost);
    $('fixed_monthly').value = fmtIn(p.fixed_monthly); $('orders_monthly').value = fmtIn(p.orders_monthly);
    $('fx').value = fmtIn(p.fx); $('f_trans').value = fmtIn(f.transaction_pct * 100); $('f_comm').value = fmtIn(f.commission_pct * 100);
    $('f_proc').value = fmtIn(f.processing_per_order); $('f_tax').value = fmtIn(f.tax_pct * 100);
    $('margin').value = fmtIn(p.target_margin * 100);
  }
  function applyMarket() {
    var m = market(), isUS = m === 'US';
    document.querySelectorAll('[data-for=US]').forEach(function (el) { el.hidden = !isUS; });
    $('cost_cur').value = isUS ? 'USD' : 'VND';
    $('unit_cost').placeholder = isUS ? 'Ví dụ 4,5' : 'Ví dụ 25.000';
    $('price').placeholder = 'Để trống: dùng giá trung vị thị trường';
    $('priceHelp').textContent = isUS ? 'Giá bạn định bán cho khách Mỹ, bằng USD.' : 'Giá bạn định bán trong nước, bằng đồng (VND).';
    $('qtyHelp').textContent = isUS ? 'Lô thử bạn định nhập. Lô càng lớn thì cước vận chuyển mỗi cái càng rẻ.' : 'Số lượng bạn định nhập thử.';
    $('dimHelp').textContent = isUS ? 'Hàng nhẹ mà cồng kềnh sẽ bị tính cước theo thể tích.' : 'Có thể để trống nếu không cần.';
    $('vnLogLabel').textContent = isUS ? 'Vận chuyển trong Việt Nam (từ nhà cung cấp tới nơi gom hàng)' : 'Vận chuyển về kho của bạn';
    $('vnLogHelp').textContent = isUS ? 'Bằng USD mỗi đơn.' : 'Bằng đồng (VND) mỗi đơn.';
    $('vnLogUnit').textContent = isUS ? 'USD' : 'đ'; $('packUnit').textContent = isUS ? 'USD' : 'đ'; $('priceUnit').textContent = isUS ? 'USD' : 'đ';
    $('qtyReq').hidden = !isUS; $('wReq').hidden = !isUS;
    $('fulfillment').value = '0'; $('last_mile').value = '0'; $('vn_logistics').value = '0'; $('packing').value = '0';
    fillAdvanced(m);
    var sel = $('group'); sel.innerHTML = '';
    var list = statsFor(m);
    var multi = {}; list.forEach(function (s) { multi[s.group_key] = (multi[s.group_key] || {}); multi[s.group_key][s.source] = 1; });
    var L1 = { 10: 'Đồ gia dụng', 11: 'Nhà bếp', 12: 'Chăn ga, vải', 13: 'Điện gia dụng', 3: 'Thời trang nam', 2: 'Thời trang nữ', 6: 'Giày dép', 7: 'Túi, vali', 14: 'Làm đẹp', 15: 'Máy tính, văn phòng', 16: 'Điện thoại, điện tử', 18: 'Mẹ và bé', 9: 'Thể thao, dã ngoại', 19: 'Đồ chơi', 20: 'Nội thất', 23: 'Ô tô, xe máy', 8: 'Phụ kiện thời trang', 21: 'Dụng cụ, ngũ kim', 4: 'Thời trang trẻ em', 22: 'Cải tạo nhà cửa', 17: 'Thú cưng', 24: 'Thực phẩm, đồ uống' };
    var buckets = {}, order = [];
    list.forEach(function (s, i) { var k = (s.category_path && L1[s.category_path[0]]) || 'Khác'; if (!buckets[k]) { buckets[k] = []; order.push(k); } buckets[k].push([s, i]); });
    order.sort(function (a, b) { return a.localeCompare(b, 'vi'); });
    order.forEach(function (k) {
      var g = document.createElement('optgroup'); g.label = k;
      buckets[k].sort(function (a, b) { return a[0].group_label.localeCompare(b[0].group_label, 'vi'); }).forEach(function (x) {
        var s = x[0], o = document.createElement('option'); o.value = String(x[1]);
        o.textContent = s.group_label + (Object.keys(multi[s.group_key]).length > 1 ? ' [' + srcName(s.source) + ']' : ''); g.appendChild(o);
      });
      sel.appendChild(g);
    });
    var o2 = document.createElement('option'); o2.value = 'none'; o2.textContent = 'Nhóm khác (chưa có dữ liệu thị trường)'; sel.appendChild(o2);
    updateGroupHelp();
    $('result').hidden = true; $('err').hidden = true; document.body.classList.remove('show-result');
    if (window.TG_UI) window.TG_UI.refresh();
  }
  function srcName(x) { return x === 'kalodata' ? 'Kalodata' : 'FastMoss'; }
  function currentStats() { var v = $('group').value; if (v === 'none') return null; return statsFor(market())[Number(v)] || null; }
  function updateGroupHelp() {
    var s = currentStats(), m = market(), mm = $('miniMarket');
    if (s) {
      mm.hidden = false;
      mm.innerHTML = '<div><div class="k">Giá trung vị</div><div class="v">' + esc(TG.money(s.price_p50, m)) + '</div></div>' +
        '<div><div class="k">Vùng giá chính</div><div class="v">' + esc(TG.money(s.price_p10, m)) + ' đến ' + esc(TG.money(s.price_p90, m)) + '</div></div>' +
        '<div><div class="k">Bán tốt nhất, 28 ngày</div><div class="v">' + esc(TG.intFmt(s.top_product_units_28d)) + ' cái</div></div>';
    } else mm.hidden = true;
    if (window.TG_UI) window.TG_UI.refresh();
    $('groupHelp').textContent = s ? ('Dữ liệu ' + srcName(s.source) + ' ngày ' + s.period_end + ', mẫu ' + s.n_listings + ' listing bán chạy nhất (bản thử nghiệm).' + (s.category_path && s.category_path.length === 2 ? ' Đây là nhóm rộng (cả ngành con), mức giá có thể trải dài hơn nhóm hẹp.' : '')) : 'Chưa có dữ liệu: bạn nhập giá bán dự kiến, kết luận cao nhất chỉ là "Cân nhắc".';
  }

  /* ---------- Thu thập dữ liệu từ form ---------- */
  function collect() {
    var m = market(), p = JSON.parse(JSON.stringify(D.params)), f = p.fees[m];
    function n(id) { var x = parseNum(val(id)); return x; }
    function numOr0(id, label) { var x = n(id); if (x === null) return 0; if (isNaN(x)) throw new Error('Ô "' + label + '" cần là một con số.'); return x; }
    function opt(id, label) { var x = n(id); if (x !== null && isNaN(x)) throw new Error('Ô "' + label + '" cần là một con số.'); return x; }
    var margin = n('margin'); if (margin === null || isNaN(margin)) throw new Error('Hãy nhập lãi mong muốn (ví dụ 20).');
    if (margin < 0 || margin >= 100) throw new Error('Lãi mong muốn phải từ 0 đến dưới 100%.');
    p.target_margin = margin / 100;
    p.ads_pct = numOr0('ads_pct', 'Chi phí quảng cáo') / 100; p.returns_pct = numOr0('returns_pct', 'Hoàn, hủy, hỏng') / 100;
    p.other_marketing = numOr0('other_marketing', 'Marketing khác'); p.variable_cost = numOr0('variable_cost', 'Biến phí khác');
    p.fixed_monthly = numOr0('fixed_monthly', 'Chi phí cố định'); p.orders_monthly = numOr0('orders_monthly', 'Số đơn mỗi tháng');
    var fx = n('fx'); if (fx === null || isNaN(fx) || fx <= 0) throw new Error('Cần nhập tỷ giá VND mỗi USD (ví dụ 26.000).'); p.fx = fx;
    var cny = opt('cny_vnd', 'Tỷ giá NDT'); p.cny_vnd = cny;
    f.transaction_pct = numOr0('f_trans', 'Phí giao dịch') / 100; f.commission_pct = numOr0('f_comm', 'Hoa hồng sàn') / 100;
    f.processing_per_order = numOr0('f_proc', 'Phí xử lý'); f.tax_pct = numOr0('f_tax', 'Thuế') / 100;
    p.fees_verified = $('fees_verified').checked;
    p.carrier = m === 'US' ? $('carrier').value : 'Rẻ nhất';
    var stats = currentStats();
    var cost = opt('unit_cost', 'Giá nhập'); var unitCost = '';
    if (cost !== null) { if (cost <= 0) throw new Error('Giá nhập phải lớn hơn 0.'); unitCost = TG.toMarketCurrency(cost, $('cost_cur').value, m, p); }
    var qty = opt('qty', 'Số lượng nhập thử');
    var price = opt('price', 'Giá bán dự kiến');
    var aff = opt('affiliate_pct', 'Hoa hồng affiliate');
    var inp = {
      market: m, price: price === null ? '' : price, unit_cost: unitCost,
      weight_kg: numOr0('weight_kg', 'Cân nặng'), L: opt('L', 'Dài'), W: opt('W', 'Rộng'), H: opt('H', 'Cao'), qty: qty === null ? 0 : qty,
      ship_per_kg: m === 'US' ? opt('ship_per_kg', 'Giá ship mỗi kg') : null,
      fulfillment: m === 'US' ? numOr0('fulfillment', 'Fulfillment') : 0, last_mile: m === 'US' ? numOr0('last_mile', 'Giao hàng cuối') : 0,
      vn_logistics: numOr0('vn_logistics', 'Vận chuyển'), packing: numOr0('packing', 'Đóng gói'),
      affiliate_pct: aff !== null ? aff : (stats && stats.avg_commission_pct != null ? stats.avg_commission_pct : 0)
    };
    if (unitCost !== '' && m === 'US' && !(inp.qty > 0)) throw new Error('Hãy nhập số lượng nhập thử để tính cước vận chuyển đi Mỹ.');
    if (price !== null && price <= 0) throw new Error('Giá bán dự kiến phải lớn hơn 0, hoặc để trống.');
    return { inp: inp, p: p, stats: stats, m: m };
  }

  /* ---------- Vẽ kết quả ---------- */
  var SUMMARY = { NHAP: 'Với số liệu hiện tại, sản phẩm này đáng nhập thử.', CAN_NHAC: 'Có điểm cần cân nhắc kỹ trước khi bỏ tiền nhập hàng.', KHONG_NHAP: 'Với số liệu hiện tại, bạn không nên nhập sản phẩm này.', CHO: '' };
  var STLBL = { pass: 'Đạt', warn: 'Chú ý', fail: 'Không đạt', na: 'Chưa có dữ liệu' };
  function mny(v, m) { return TG.money(v, m); }

  function render(r, ctx) {
    var m = ctx.m, e = r.unit_economics;
    $('result').hidden = false; document.body.classList.add('show-result'); window.scrollTo(0, 0);
    var v = $('verdict'); v.className = 'verdict ' + r.verdict;
    v.innerHTML = '<div class="k">Kết luận của công cụ</div><div class="v">' + esc(r.verdict_label) + '</div><div class="s">' + esc(r.verdict === 'CHO' ? r.reasons[0] : SUMMARY[r.verdict]) + '</div>' +
      '<div class="meta"><span class="chip">Thị trường: ' + (m === 'US' ? 'Mỹ' : 'Việt Nam') + '</span><span class="chip">Độ tin cậy dữ liệu thị trường: ' + esc(r.confidence) + '</span></div>';
    var ol = $('reasons'); ol.innerHTML = '';
    (r.verdict === 'CHO' ? r.reasons : r.reasons_top3).forEach(function (t) { var li = document.createElement('li'); li.textContent = t; ol.appendChild(li); });
    var gl = $('gates'); gl.innerHTML = '';
    (r.gates || []).forEach(function (g) { var li = document.createElement('li'); li.className = g.status; li.innerHTML = '<span class="st">' + STLBL[g.status] + '</span><div><b>' + esc(g.name) + '</b>' + esc(g.text) + '</div>'; gl.appendChild(li); });
    $('gates').parentNode.hidden = !(r.gates && r.gates.length);

    // Bảng lợi nhuận
    var tb = $('econ');
    if (e.landed_cost === null || e.price === null) { tb.innerHTML = ''; $('keys').innerHTML = ''; $('tiles').innerHTML = ''; $('splitBar').innerHTML = ''; }
    else {
      var P = e.price, neg = function (x) { return x < 0 ? ' class="neg"' : ''; };
      var adsCost = P * ctx.p.ads_pct;
      function cell(x, sign) { return '<td>' + (x === null ? '' : ((sign && x > 0) ? '-' : '') + mny(x, m)) + '</td>'; }
      function prof(x) { return '<td' + neg(x) + '>' + mny(x, m) + '</td>'; }
      tb.innerHTML = '<thead><tr><th></th><th>Đơn tự nhiên</th><th>Đơn affiliate</th><th>Đơn chạy quảng cáo</th></tr></thead><tbody>' +
        '<tr><td>Giá bán' + (e.price_source === 'trung vị thị trường' ? ' (trung vị thị trường)' : '') + '</td>' + cell(P) + cell(P) + cell(P) + '</tr>' +
        '<tr><td>Giá vốn hàng về tới khách</td>' + cell(e.landed_cost, 1) + cell(e.landed_cost, 1) + cell(e.landed_cost, 1) + '</tr>' +
        '<tr><td>Phí sàn</td>' + cell(e.platform_fee, 1) + cell(e.platform_fee, 1) + cell(e.platform_fee, 1) + '</tr>' +
        '<tr><td>Vận hành và marketing</td>' + cell(e.H, 1) + cell(e.H, 1) + cell(e.H, 1) + '</tr>' +
        '<tr><td>Hoàn, hủy, hỏng</td>' + cell(e.returns, 1) + cell(e.returns, 1) + cell(e.returns, 1) + '</tr>' +
        '<tr><td>Hoa hồng affiliate</td><td></td>' + cell(e.affiliate, 1) + '<td></td></tr>' +
        '<tr><td>Quảng cáo</td><td></td><td></td>' + cell(adsCost, 1) + '</tr>' +
        '<tr class="total"><td>Lợi nhuận mỗi đơn</td>' + prof(e.profit_organic) + prof(e.profit_affiliate) + prof(e.profit_ads) + '</tr>' +
        '<tr><td>Biên lợi nhuận</td><td' + neg(e.profit_organic) + '>' + TG.pctShow(e.profit_organic / P) + '</td><td' + neg(e.profit_affiliate) + '>' + TG.pctShow(e.profit_affiliate / P) + '</td><td' + neg(e.profit_ads) + '>' + TG.pctShow(e.profit_ads / P) + '</td></tr></tbody>';
      var tg0 = TG.pctShow(ctx.p.target_margin), po = e.profit_organic;
      $('tiles').innerHTML =
        '<div class="tile"><div class="k">Lãi mỗi đơn (đơn tự nhiên)</div><div class="v ' + (po < 0 ? 'neg' : 'pos') + '">' + mny(po, m) + '</div><div class="d">Biên ' + TG.pctShow(po / P) + ' trên giá bán</div></div>' +
        '<div class="tile"><div class="k">Giá nhập tối đa để đạt lãi ' + tg0 + '</div><div class="v">' + mny(e.max_unit_cost, m) + '</div><div class="d">Bạn đang nhập ' + mny(num(ctx.inp.unit_cost), m) + '</div></div>' +
        '<div class="tile"><div class="k">Giá bán đề xuất để đạt lãi ' + tg0 + '</div><div class="v">' + (e.recommended_feasible ? mny(e.recommended_price, m) : 'Không khả thi') + '</div><div class="d">' + (e.price_source === 'trung vị thị trường' ? 'Bạn dùng giá trung vị thị trường' : 'Giá bạn nhập ' + mny(P, m)) + '</div></div>';
      var segs = [['Giá vốn về tới khách', e.landed_cost, '#111'], ['Phí sàn', e.platform_fee, '#6f6a5d'], ['Vận hành, marketing', e.H, '#aaa393'], ['Hoàn, hủy, hỏng', e.returns, '#e3b4ad']];
      var costSum = segs.reduce(function (a, x) { return a + x[1]; }, 0), base = Math.max(P, costSum);
      if (po > 0) segs.push(['Lãi', po, '#1d7a47']);
      $('splitBar').innerHTML = '<div class="split">' + segs.map(function (x) { return '<i style="width:' + (x[1] / base * 100) + '%;background:' + x[2] + '" title="' + esc(x[0]) + '"></i>'; }).join('') + '</div>' +
        '<div class="split-leg">' + segs.map(function (x) { return '<span><em style="background:' + x[2] + '"></em>' + esc(x[0]) + ' ' + TG.pctShow(x[1] / P) + '</span>'; }).join('') + '</div>' +
        (po < 0 ? '<p class="hint">Tổng chi phí vượt giá bán, nên đơn tự nhiên bị lỗ ' + esc(mny(-po, m)) + '.</p>' : '<p class="hint">Mỗi 100 đồng giá bán chia ra như thanh trên (đơn tự nhiên).</p>');
      var parts = ['giá nhập ' + mny(num(ctx.inp.unit_cost), m)];
      if (m === 'US') parts.push('ship quốc tế ' + mny(e.ship.ship_each, m) + (e.ship.carrier ? ' (' + (e.ship.carrier === 'VPS' ? 'VPS' : 'AM') + ', ' + (Math.round(e.ship.lot_kg * 10) / 10).toString().replace('.', ',') + ' kg cả lô)' : ''));
      if (num(ctx.inp.fulfillment)) parts.push('fulfillment ' + mny(num(ctx.inp.fulfillment), m));
      if (num(ctx.inp.last_mile)) parts.push('giao cuối ' + mny(num(ctx.inp.last_mile), m));
      if (num(ctx.inp.vn_logistics)) parts.push('vận chuyển trong nước ' + mny(num(ctx.inp.vn_logistics), m));
      if (num(ctx.inp.packing)) parts.push('đóng gói ' + mny(num(ctx.inp.packing), m));
      var tgt = TG.pctShow(ctx.p.target_margin);
      var recTxt = e.recommended_feasible ? mny(e.recommended_price, m) : 'Không khả thi';
      var recDet = e.recommended_feasible ? (r.recommended_position ? 'Vị trí so với thị trường: ' + r.recommended_position + '.' : 'Giá để đạt lãi ' + tgt + ' trên giá bán.') : 'Tổng phí sàn, hoàn hủy và lãi mong muốn từ 100% giá bán trở lên.';
      var maxDet = e.max_unit_cost < 0 ? 'Âm: dù nhập miễn phí cũng không đạt lãi ' + tgt + ' (cước, fulfillment và phí sàn quá lớn).' : 'Giá nhập cao nhất để vẫn đạt lãi ' + tgt + '. Bạn đang nhập ở ' + mny(num(ctx.inp.unit_cost), m) + '.';
      $('keys').innerHTML = '<div class="key"><div class="k">Giá nhập tối đa để đạt lãi ' + tgt + '</div><div class="v">' + mny(e.max_unit_cost, m) + '</div><div class="d">' + esc(maxDet) + '</div></div>' +
        '<div class="key"><div class="k">Giá bán đề xuất để đạt lãi ' + tgt + '</div><div class="v">' + recTxt + '</div><div class="d">' + esc(recDet) + '</div></div>' +
        '<p class="help" style="grid-column:1/-1">Giá vốn về tới khách = ' + esc(parts.join(' + ')) + '.</p>';
    }

    // Thị trường
    var mc = $('marketCard'), ms = r.market;
    if (!ms) { mc.hidden = false; $('rangeBar').innerHTML = ''; $('mkt').innerHTML = '<p class="help">Nhóm sản phẩm này chưa có dữ liệu thị trường, nên chưa so sánh được giá, nhu cầu và cạnh tranh.</p>'; }
    else {
      mc.hidden = false;
      drawRange(ms, e, m);
      var rows = [
        ['Nhóm sản phẩm', ms.group_label], ['Giá thấp nhất, trung vị, cao nhất', mny(ms.price_min, m) + ', ' + mny(ms.price_p50, m) + ', ' + mny(ms.price_max, m)],
        ['Vùng giá chính (p10 đến p90)', mny(ms.price_p10, m) + ' đến ' + mny(ms.price_p90, m)],
        ['Sản phẩm bán tốt nhất, 28 ngày', TG.intFmt(ms.top_product_units_28d) + ' cái'], ['Tổng số bán của mẫu, 28 ngày', TG.intFmt(ms.units_28d_sample) + ' cái'],
        ['3 shop đầu chiếm số bán của mẫu', TG.pctShow(ms.top_shop_share)],
        ['Doanh thu từ quảng cáo', ms.ads_gmv_share == null ? 'Chưa có dữ liệu' : TG.pctShow(ms.ads_gmv_share)],
        ['Hoa hồng affiliate trung bình', String(ms.avg_commission_pct).replace('.', ',') + '%'],
        ['Số listing trong mẫu', String(ms.n_listings)], ['Ngày dữ liệu', ms.period_end + (ms.age_days != null ? ' (cách ' + ms.age_days + ' ngày)' : '')],
        ['Độ tin cậy', ms.confidence + (ms.is_trial_data ? ' (bản thử nghiệm)' : '')], ['Nguồn', srcName((currentStats() || {}).source) + ', TikTok Shop']
      ];
      $('mkt').innerHTML = rows.map(function (x) { return '<div><dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd></div>'; }).join('');
    }
    var wl = $('warns'); wl.innerHTML = '';
    r.warnings.forEach(function (w) { var li = document.createElement('li'); li.textContent = w; wl.appendChild(li); });
    $('warnCard').hidden = !r.warnings.length;
  }
  function num(x) { var n = Number(x); return isFinite(n) ? n : 0; }

  function drawRange(ms, e, m) {
    var vals = [ms.price_min, ms.price_max]; if (e.price) vals.push(e.price); if (e.recommended_feasible && e.recommended_price) vals.push(e.recommended_price);
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), pad = (hi - lo) * 0.06 || hi * 0.1; lo = Math.max(0, lo - pad); hi = hi + pad;
    var pos = function (x) { return Math.max(0, Math.min(100, (x - lo) / (hi - lo) * 100)); };
    var html = '<div class="range"><div class="bar"></div><div class="core" style="left:' + pos(ms.price_p10) + '%;width:' + (pos(ms.price_p90) - pos(ms.price_p10)) + '%"></div>';
    [['p10', ms.price_p10], ['trung vị', ms.price_p50], ['p90', ms.price_p90]].forEach(function (a) { html += '<div class="mk" style="left:' + pos(a[1]) + '%">' + a[0] + '<br>' + esc(mny(a[1], m)) + '<i></i></div>'; });
    if (e.price) html += '<div class="you-dot" style="left:' + pos(e.price) + '%"></div><div class="you-lbl" style="left:' + pos(e.price) + '%">Giá của bạn ' + esc(mny(e.price, m)) + '</div>';
    html += '</div><p class="rng-note">Thanh vàng là vùng giá p10 đến p90 của nhóm. Chấm đen là giá bán của bạn.</p>';
    $('rangeBar').innerHTML = html;
  }

  /* ---------- Lịch sử trên máy này ---------- */
  function loadHist() { try { return JSON.parse(localStorage.getItem(HKEY) || '[]'); } catch (e) { return []; } }
  function saveHist(list) { try { localStorage.setItem(HKEY, JSON.stringify(list.slice(0, 10))); } catch (e) { /* bỏ qua */ } }
  function renderHist() {
    var h = loadHist(), ul = $('hist'); ul.innerHTML = '';
    $('histCard').hidden = !h.length;
    h.forEach(function (x) { var li = document.createElement('li'); li.innerHTML = '<span>' + esc(x.when) + ' | ' + (x.market === 'US' ? 'Mỹ' : 'Việt Nam') + ' | ' + esc(x.group) + '</span><span class="vd">' + esc(x.verdict) + '</span>'; ul.appendChild(li); });
  }
  function pushHist(r, ctx) {
    var list = loadHist(), d = new Date();
    var s = ctx.stats ? ctx.stats.group_label : 'Nhóm khác';
    list.unshift({ when: d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }), market: ctx.m, group: s, verdict: r.verdict_label });
    saveHist(list); renderHist();
  }

  /* ---------- Sự kiện ---------- */
  document.querySelectorAll('input[name=market]').forEach(function (el) { el.addEventListener('change', applyMarket); });
  $('group').addEventListener('change', updateGroupHelp);
  $('clearHist').addEventListener('click', function () { try { localStorage.removeItem(HKEY); } catch (e) { /* bỏ qua */ } renderHist(); });
  $('form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var err = $('err'); err.hidden = true;
    try {
      var ctx = collect();
      var r = TG.decide(ctx.inp, ctx.p, D.rates, ctx.stats, { today: new Date().toISOString().slice(0, 10) });
      render(r, ctx); pushHist(r, ctx);
    } catch (e) { err.textContent = e.message; err.hidden = false; err.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  });
  $('editBtn').addEventListener('click', function () { document.body.classList.remove('show-result'); $('result').hidden = true; window.scrollTo(0, 0); });
  $('newBtn').addEventListener('click', function () {
    document.body.classList.remove('show-result'); $('result').hidden = true;
    ['unit_cost', 'qty', 'weight_kg', 'L', 'W', 'H', 'price', 'ship_per_kg'].forEach(function (id) { $(id).value = ''; });
    applyMarket(); if (window.TG_UI) window.TG_UI.go(1); window.scrollTo(0, 0);
  });
  window.TG_APP = { collect: collect, market: market, currentStats: currentStats, parseNum: parseNum, fmtIn: fmtIn, mny: mny };
  applyMarket(); renderHist();
})();
