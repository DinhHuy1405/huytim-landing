/* pricing.js: lõi tính giá bán và quyết định "Nhập / Cân nhắc / Không nhập".
 * Công thức lấy từ handoff file 02 (nguồn chân lý: TinhGia_TuDong.xlsx). Kiểm bằng tests/pricing.test.js với test_vectors.json.
 * Chạy được cả trong trình duyệt (window.TG) lẫn Node (require). Không phụ thuộc thư viện nào.
 * Quy ước: thị trường US tính bằng USD, VN tính bằng VND. Cước đi US lấy từ bảng VND rồi đổi sang USD bằng tỷ giá. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TG = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EPS = 1e-9;
  function num(x) { var n = Number(x); return isFinite(n) ? n : 0; }
  function has(x) { return x !== null && x !== undefined && x !== '' && isFinite(Number(x)); }
  function roundUp0(x) { return Math.ceil(x - EPS); }            // ROUNDUP(x,0)
  function ceilTo(x, step) { return Math.ceil(x / step - EPS) * step; } // CEILING(x,step)
  function r2(x) { return Math.round(x * 100) / 100; }

  /* ---------- Ngưỡng của các cổng dữ liệu thị trường (ĐỀ XUẤT, cần Huy duyệt và hiệu chỉnh bằng dữ liệu thật) ---------- */
  var DEFAULT_GATES = {
    demand_min_top_units_28d: { VN: 5500, US: 1000 },   // hiệu chỉnh theo phân vị 10 của top sản phẩm trong 16 nhóm mỗi thị trường (2026-10-24); đề xuất, chờ Huy duyệt
    demand_severe_ratio: 0.25,                         // dưới 25% ngưỡng thì "Không nhập"
    top_shop_share_warn: 0.6,
    ads_share_warn: 0.6,
    stale_days: 60,
    low_n_listings: 5,
    good_n_listings: 10,
    fresh_days: 30
  };

  /* ---------- Đổi tiền ---------- */
  // amount tính bằng cur ('VND' | 'USD' | 'CNY'), trả về tiền của thị trường (US: USD, VN: VND).
  function toMarketCurrency(amount, cur, market, p) {
    var a = num(amount);
    var fx = num(p.fx);              // VND mỗi USD
    var cny = num(p.cny_vnd);        // VND mỗi NDT (người dùng nhập, KHÔNG có mặc định)
    var vnd;
    if (cur === 'VND') vnd = a;
    else if (cur === 'USD') vnd = a * fx;
    else if (cur === 'CNY') {
      if (!(cny > 0)) throw new Error('Cần nhập tỷ giá NDT sang VND để đổi giá nhập.');
      vnd = a * cny;
    } else throw new Error('Đơn vị tiền không hợp lệ: ' + cur);
    if (market === 'US') { if (!(fx > 0)) throw new Error('Cần tỷ giá VND mỗi USD.'); return vnd / fx; }
    return vnd;
  }

  /* ---------- Cước vận chuyển đi US (chỉ khi thị trường là US) ---------- */
  function lookup(tiers, key) {
    for (var i = 0; i < tiers.length; i++) if (Math.abs(tiers[i].kg - key) < 1e-9) return tiers[i].vnd;
    return null;
  }
  function computeShipping(inp, rates, p) {
    var divisor = rates.volumetric_divisor || 5000;
    var vol = (has(inp.L) && has(inp.W) && has(inp.H) && num(inp.L) > 0 && num(inp.W) > 0 && num(inp.H) > 0) ? num(inp.L) * num(inp.W) * num(inp.H) / divisor : 0;
    var Q = Math.max(num(inp.weight_kg), vol);                  // cân tính cước mỗi cái (kg)
    var qty = num(inp.qty);
    var R = Q * qty;                                            // tổng cân cả lô
    var out = { chargeable_kg_each: Q, lot_kg: R, vps_vnd: null, am_vnd: null, carrier: null, lot_vnd: null, ship_each: 0 };
    if (R > 0) {
      var k = roundUp0(R);
      out.vps_vnd = (k > 20) ? k * rates.vps.per_kg_from_21kg_vnd : lookup(rates.vps.tiers_kg_to_vnd, Math.max(1, k));
      out.am_vnd = (R > 20) ? roundUp0(R) * rates.am.per_kg_from_21kg_vnd : lookup(rates.am.tiers_kg_to_vnd, Math.max(0.5, ceilTo(R, 0.5)));
      var pick = p.carrier;
      if (pick === 'VPS' || pick === 'AM') out.carrier = pick;
      else out.carrier = (out.vps_vnd <= out.am_vnd) ? 'VPS' : 'AM';   // "Rẻ nhất": VPS khi bằng nhau
      out.lot_vnd = out.carrier === 'VPS' ? out.vps_vnd : out.am_vnd;
    }
    if (has(inp.ship_per_kg) && num(inp.ship_per_kg) > 0) out.ship_each = num(inp.ship_per_kg) * Q;
    else if (inp.market === 'US' && out.lot_vnd !== null && qty > 0) out.ship_each = out.lot_vnd / num(p.fx) / qty;
    else out.ship_each = 0;                                     // thị trường VN: W = 0
    if (inp.market !== 'US' && !(has(inp.ship_per_kg) && num(inp.ship_per_kg) > 0)) out.ship_each = 0;
    return out;
  }

  /* ---------- Phí sàn ---------- */
  function feeFor(p, market) { return p.fees[market]; }

  /* ---------- Đơn vị lợi nhuận cho một đơn ---------- */
  function unitEconomics(inp, p, rates, marketStats) {
    var market = inp.market;
    var fee = feeFor(p, market);
    var ship = computeShipping(inp, rates, p);
    var price = has(inp.price) && num(inp.price) > 0 ? num(inp.price) : (marketStats ? marketStats.price_p50 : null);
    var out = { ship: ship, price: price, price_source: has(inp.price) && num(inp.price) > 0 ? 'nhập' : (marketStats ? 'trung vị thị trường' : null) };
    var hasCost = has(inp.unit_cost) && num(inp.unit_cost) > 0;
    var unitCost = num(inp.unit_cost);
    var H = (num(p.orders_monthly) > 0 ? num(p.fixed_monthly) / num(p.orders_monthly) : 0) + num(p.variable_cost) + num(p.other_marketing);
    var rateSum = num(fee.transaction_pct) + num(fee.commission_pct) + num(fee.tax_pct);
    var extra = num(inp.fulfillment) + num(inp.last_mile) + num(inp.vn_logistics) + num(inp.packing);
    out.H = H;
    out.landed_cost = hasCost ? unitCost + ship.ship_each + extra : null;                    // E
    if (price === null) return out;
    var P = price;
    out.platform_fee = P * rateSum + num(fee.processing_per_order);                          // F
    out.affiliate_pct = has(inp.affiliate_pct) ? num(inp.affiliate_pct) : 0;
    out.affiliate = P * out.affiliate_pct / 100;                                             // G
    out.returns = P * num(p.returns_pct);                                                    // I
    if (hasCost) {
      var E = out.landed_cost;
      out.profit_organic = P - E - out.platform_fee - H - out.returns;                       // J
      out.margin_organic = out.profit_organic / P;                                           // K
      out.profit_affiliate = out.profit_organic - out.affiliate;                             // L
      out.profit_ads = out.profit_organic - P * num(p.ads_pct);                              // M
      out.max_unit_cost = P * (1 - rateSum - num(p.returns_pct) - num(p.target_margin)) - (num(fee.processing_per_order) + H + (E - unitCost)); // N
      var denom = 1 - rateSum - num(p.returns_pct) - num(p.target_margin);
      out.recommended_price = denom <= 0 ? null : (E + num(fee.processing_per_order) + H) / denom;  // O (null = Không khả thi)
      out.recommended_feasible = denom > 0;
    }
    return out;
  }

  /* ---------- Vị trí giá đề xuất so với thị trường (dùng thấp nhất, trung vị, cao nhất) ---------- */
  function positionVsMarket(O, s) {
    if (O === null || O === undefined || !s) return '';
    if (O < s.price_min) return 'Thấp hơn mọi đối thủ';
    if (O <= s.price_p50) return 'Dưới hoặc bằng trung vị';
    if (O <= s.price_max) return 'Trên trung vị, trong vùng giá';
    return 'Cao hơn mọi đối thủ';
  }

  /* ---------- Kết luận cũ của file Excel (dùng để so khớp test vector) ---------- */
  function legacyVerdict(econ, targetMargin, position) {
    if (econ.landed_cost === null || econ.landed_cost === undefined) return 'Chờ nhập hàng';
    if (econ.margin_organic >= targetMargin && position !== 'Cao hơn mọi đối thủ') return 'Làm';
    if (econ.profit_organic > 0) return 'Cân nhắc';
    return 'Bỏ';
  }

  /* ---------- Định dạng tiền ---------- */
  function money(v, market) {
    if (v === null || v === undefined || !isFinite(v)) return '';
    if (market === 'US') {
      var s = (Math.round(Math.abs(v) * 100) / 100).toFixed(2).replace('.', ',');
      return (v < 0 ? '-' : '') + s + ' USD';
    }
    var n = Math.round(Math.abs(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (v < 0 ? '-' : '') + n + 'đ';
  }
  function pct(v, d) { return (Math.round(v * Math.pow(10, d == null ? 1 : d + 2)) / Math.pow(10, d == null ? 1 : d)).toString().replace('.', ',') + '%'; }
  function pctShow(v) { return (Math.round(v * 1000) / 10).toString().replace('.', ',') + '%'; }
  function intFmt(v) { return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

  function ageDays(periodEnd, today) {
    if (!periodEnd) return null;
    var a = new Date(periodEnd + 'T00:00:00Z').getTime(), b = new Date((today || new Date().toISOString().slice(0, 10)) + 'T00:00:00Z').getTime();
    return Math.round((b - a) / 86400000);
  }

  /* ---------- Quyết định có dữ liệu thị trường (handoff file 03, mục "Quy tắc quyết định") ---------- */
  var LEVELS = ['KHONG_NHAP', 'CAN_NHAC', 'NHAP'];
  var LABEL = { NHAP: 'Nhập', CAN_NHAC: 'Cân nhắc', KHONG_NHAP: 'Không nhập', CHO: 'Chờ nhập hàng' };

  function decide(inp, p, rates, marketStats, opts) {
    opts = opts || {};
    var gatesCfg = Object.assign({}, DEFAULT_GATES, opts.gates || {});
    var market = inp.market;
    var s = marketStats || null;
    var econ = unitEconomics(inp, p, rates, s);
    var m = market;
    var gates = [], warnings = [];
    var result = { market: market, unit_economics: econ, gates: gates, warnings: warnings };

    // Cảnh báo chung
    var fee = feeFor(p, market);
    if (!p.fees_verified) warnings.push('Phí sàn đang là số MẪU, chưa xác minh. Hãy thay bằng mức phí thật của sàn và ngành của bạn trước khi quyết định.');
    if (econ.ship.lot_kg <= 0 && econ.landed_cost !== null) warnings.push(market === 'US' ? 'Chưa có cân nặng hoặc kích thước, nên chưa tính được cước vận chuyển đi Mỹ (đang tính bằng 0).' : 'Chưa có cân nặng thật.');
    if (market === 'US' && econ.ship.carrier === 'AM') warnings.push('Hãng AM Express: bảng giá hiệu lực 01/10 đến 31/10/2026 và công thức quy đổi thể tích của AM chưa có trong báo giá (tạm chia 5000).');
    if (market === 'US' && econ.ship.carrier) warnings.push('Cước VPS chưa gồm VAT, bảo hiểm, thuế nhập khẩu. AM giao tận nhà và bao thuế nhập khẩu. Hai hãng khác điều kiện nên "rẻ nhất" chưa chắc tốt nhất.');
    if (!s) warnings.push('Chưa có dữ liệu thị trường cho nhóm sản phẩm này, nên kết quả chỉ dựa vào công thức chi phí.');
    if (s && s.is_trial_data) warnings.push('Dữ liệu thị trường là bản thử nghiệm: chỉ gồm top ' + s.n_listings + ' listing theo số bán 28 ngày, không phải toàn bộ ngách.');
    if (s && (s.ads_gmv_share === null || s.ads_gmv_share === undefined)) warnings.push('Chưa có tỷ lệ doanh thu từ quảng cáo của nhóm này.');
    if (econ.price === null) {
      result.verdict = 'CHO'; result.verdict_label = 'Chờ nhập hàng'; result.reasons = ['Cần giá bán dự kiến hoặc dữ liệu thị trường để tính.'];
      result.confidence = 'không có'; return result;
    }
    if (econ.landed_cost === null) {
      result.verdict = 'CHO'; result.verdict_label = LABEL.CHO; result.reasons = ['Cần nhập giá nhập mỗi cái để tính lợi nhuận.'];
      result.market = marketSummary(s, m, gatesCfg, opts.today); result.confidence = result.market ? result.market.confidence : 'không có';
      return result;
    }

    var level = 2; // bắt đầu từ NHAP, các cổng hạ dần
    function cap(to) { if (level > to) level = to; }

    // Cổng 1: tài chính (bắt buộc)
    var J = econ.profit_organic, K = econ.margin_organic, N = econ.max_unit_cost, target = num(p.target_margin);
    if (N < 0) {
      cap(0);
      gates.push({ id: 'finance', name: 'Tài chính', status: 'fail', text: 'Giá nhập tối đa để đạt biên ' + pctShow(target) + ' là ' + money(N, m) + ' (âm): dù nhập miễn phí cũng không đạt biên, vì cước, fulfillment và phí sàn đã quá lớn so với giá bán ' + money(econ.price, m) + '.' });
    } else if (J <= 0) {
      cap(0);
      gates.push({ id: 'finance', name: 'Tài chính', status: 'fail', text: 'Mỗi đơn tự nhiên lỗ ' + money(-J, m) + ' (giá vốn về tới khách ' + money(econ.landed_cost, m) + ', giá bán ' + money(econ.price, m) + ').' });
    } else if (K < target) {
      cap(1);
      gates.push({ id: 'finance', name: 'Tài chính', status: 'warn', text: 'Mỗi đơn tự nhiên lãi ' + money(J, m) + ' (biên ' + pctShow(K) + '), thấp hơn biên mong muốn ' + pctShow(target) + '.' });
    } else {
      gates.push({ id: 'finance', name: 'Tài chính', status: 'pass', text: 'Mỗi đơn tự nhiên lãi ' + money(J, m) + ' (biên ' + pctShow(K) + '), đạt biên mong muốn ' + pctShow(target) + '.' });
    }

    // Cổng 2: giá so với thị trường
    if (s) {
      var P = econ.price;
      if (P > s.price_p90) { cap(0); gates.push({ id: 'price', name: 'Giá', status: 'fail', text: 'Giá bán ' + money(P, m) + ' cao hơn p90 của nhóm (' + money(s.price_p90, m) + '). Trừ khi sản phẩm có điểm khác biệt rõ, rất khó bán.' }); }
      else if (P < s.price_p10) { gates.push({ id: 'price', name: 'Giá', status: 'warn', text: 'Giá bán ' + money(P, m) + ' thấp hơn p10 của nhóm (' + money(s.price_p10, m) + '): bạn bán rẻ hơn gần như mọi đối thủ, dễ bị ép biên.' }); }
      else { gates.push({ id: 'price', name: 'Giá', status: 'pass', text: 'Giá bán ' + money(P, m) + ' nằm trong vùng p10 đến p90 của nhóm (' + money(s.price_p10, m) + ' đến ' + money(s.price_p90, m) + '), trung vị ' + money(s.price_p50, m) + '.' }); }
    } else gates.push({ id: 'price', name: 'Giá', status: 'na', text: 'Chưa có dữ liệu giá của nhóm để so sánh.' });

    // Cổng 3: cầu
    if (s && has(s.top_product_units_28d)) {
      var need = gatesCfg.demand_min_top_units_28d[market], top = s.top_product_units_28d;
      if (top < need * gatesCfg.demand_severe_ratio) { cap(0); gates.push({ id: 'demand', name: 'Cầu', status: 'fail', text: 'Cầu rất thấp: sản phẩm bán tốt nhất của nhóm chỉ bán ' + intFmt(top) + ' cái trong 28 ngày (ngưỡng tối thiểu ' + intFmt(need) + ').' }); }
      else if (top < need) { cap(1); gates.push({ id: 'demand', name: 'Cầu', status: 'warn', text: 'Cầu thấp: sản phẩm bán tốt nhất của nhóm bán ' + intFmt(top) + ' cái trong 28 ngày, dưới ngưỡng ' + intFmt(need) + '.' }); }
      else gates.push({ id: 'demand', name: 'Cầu', status: 'pass', text: 'Sản phẩm bán tốt nhất của nhóm bán ' + intFmt(top) + ' cái trong 28 ngày, đạt ngưỡng ' + intFmt(need) + '.' });
    } else gates.push({ id: 'demand', name: 'Cầu', status: 'na', text: 'Chưa có số bán của nhóm.' });

    // Cổng 4: cạnh tranh và quảng cáo
    if (s) {
      var heavy = [];
      if (has(s.top_shop_share) && s.top_shop_share > gatesCfg.top_shop_share_warn) heavy.push('3 shop đầu chiếm ' + pctShow(s.top_shop_share) + ' số bán của mẫu');
      if (has(s.ads_gmv_share) && s.ads_gmv_share > gatesCfg.ads_share_warn) heavy.push(pctShow(s.ads_gmv_share) + ' doanh thu đến từ quảng cáo');
      if (heavy.length) {
        if (econ.profit_ads <= 0) { cap(1); gates.push({ id: 'competition', name: 'Cạnh tranh', status: 'warn', text: heavy.join(', ') + '. Cần ngân sách quảng cáo, mà đơn chạy quảng cáo lỗ ' + money(-econ.profit_ads, m) + ' mỗi đơn.' }); }
        else gates.push({ id: 'competition', name: 'Cạnh tranh', status: 'warn', text: heavy.join(', ') + '. Cần ngân sách quảng cáo; đơn chạy quảng cáo còn lãi ' + money(econ.profit_ads, m) + '.' });
      } else if (has(s.top_shop_share)) gates.push({ id: 'competition', name: 'Cạnh tranh', status: 'pass', text: '3 shop đầu chiếm ' + pctShow(s.top_shop_share) + ' số bán của mẫu, chưa vượt ' + pctShow(gatesCfg.top_shop_share_warn) + '.' });
      else gates.push({ id: 'competition', name: 'Cạnh tranh', status: 'na', text: 'Chưa có dữ liệu cạnh tranh.' });
    } else gates.push({ id: 'competition', name: 'Cạnh tranh', status: 'na', text: 'Chưa có dữ liệu cạnh tranh.' });

    // Cổng 5: độ tin cậy
    var ms = marketSummary(s, m, gatesCfg, opts.today);
    result.market = ms;
    if (s) {
      var age = ms.age_days, low = s.n_listings < gatesCfg.low_n_listings, stale = age !== null && age > gatesCfg.stale_days;
      if (low || stale) {
        var why = [];
        if (low) why.push('chỉ có ' + s.n_listings + ' listing trong mẫu');
        if (stale) why.push('dữ liệu cũ ' + age + ' ngày');
        if (level > 0) level -= 1;
        gates.push({ id: 'confidence', name: 'Độ tin cậy', status: 'warn', text: 'Độ tin cậy thấp (' + why.join(', ') + '), nên hạ kết luận một mức.' });
      } else gates.push({ id: 'confidence', name: 'Độ tin cậy', status: 'pass', text: 'Mẫu ' + s.n_listings + ' listing, dữ liệu ngày ' + s.period_end + (age !== null ? ' (cách ' + age + ' ngày).' : '.') });
    } else {
      cap(1);
      gates.push({ id: 'confidence', name: 'Độ tin cậy', status: 'warn', text: 'Không có dữ liệu thị trường, nên kết luận cao nhất chỉ là "Cân nhắc".' });
    }

    var key = LEVELS[level];
    result.verdict = key; result.verdict_label = LABEL[key];
    result.confidence = ms ? ms.confidence : 'không có';
    result.max_unit_cost = econ.max_unit_cost; result.recommended_price = econ.recommended_price;
    result.recommended_position = s ? positionVsMarket(econ.recommended_price, s) : '';
    result.legacy_verdict = legacyVerdict(econ, target, result.recommended_position);
    // 3 lý do chính: cổng không đạt trước, rồi cảnh báo, rồi đạt
    var rank = { fail: 0, warn: 1, pass: 2, na: 3 };
    result.reasons = gates.filter(function (g) { return g.status !== 'na'; }).slice().sort(function (a, b) { return rank[a.status] - rank[b.status]; }).map(function (g) { return g.text; });
    result.reasons_top3 = result.reasons.slice(0, 3);
    return result;
  }

  function marketSummary(s, market, cfg, today) {
    if (!s) return null;
    var age = ageDays(s.period_end, today);
    var conf = 'thấp';
    if (s.n_listings >= cfg.good_n_listings && (age === null || age <= cfg.fresh_days)) conf = 'cao';
    else if (s.n_listings >= cfg.low_n_listings && (age === null || age <= cfg.stale_days)) conf = 'trung bình';
    if (s.is_trial_data && conf === 'cao') conf = 'trung bình';   // mẫu top-N thử nghiệm, chưa phải toàn bộ ngách
    return {
      group_label: s.group_label, price_min: s.price_min, price_p10: s.price_p10, price_p50: s.price_p50, price_p90: s.price_p90, price_max: s.price_max,
      units_28d_sample: s.units_28d_sample, top_product_units_28d: s.top_product_units_28d, top_shop_share: s.top_shop_share,
      ads_gmv_share: s.ads_gmv_share, affiliate_gmv_share: s.affiliate_gmv_share, avg_commission_pct: s.avg_commission_pct,
      n_listings: s.n_listings, period_end: s.period_end, age_days: age, source: s.source, confidence: conf, is_trial_data: !!s.is_trial_data
    };
  }

  return {
    DEFAULT_GATES: DEFAULT_GATES, LABEL: LABEL,
    toMarketCurrency: toMarketCurrency, computeShipping: computeShipping, unitEconomics: unitEconomics,
    positionVsMarket: positionVsMarket, legacyVerdict: legacyVerdict, decide: decide, marketSummary: marketSummary,
    money: money, pctShow: pctShow, intFmt: intFmt, ageDays: ageDays, r2: r2
  };
});
