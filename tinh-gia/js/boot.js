/* boot.js: lấy thống kê thị trường từ Supabase (khóa công khai, chỉ đọc), rồi mới chạy app.js.
 * Nếu mạng lỗi hoặc quá 4 giây thì dùng số có sẵn trong data/data.js. Chỉ đọc số tổng hợp, không có dữ liệu cá nhân. */
(function () {
  'use strict';
  var URL = 'https://rmodxwzuvwoullbbmnvk.supabase.co';
  var KEY = 'sb_publishable_zbJmWXScuLJCpu0Q41l0bg_3StyinpB';
  var started = false;
  function start() {
    if (started) return; started = true;
    var s = document.createElement('script'); s.src = 'js/app.js';
    s.onload = function () { var u = document.createElement('script'); u.src = 'js/ui.js'; document.body.appendChild(u); };
    document.body.appendChild(s);
  }
  var timer = setTimeout(start, 4000);
  fetch(URL + '/rest/v1/price_stats?select=*&order=market.asc,group_key.asc,source.asc', { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } })
    .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('http ' + r.status)); })
    .then(function (rows) {
      if (!started && Array.isArray(rows) && rows.length) {
        window.TG_DATA.stats = rows.map(function (x) { delete x.id; delete x.category_id; delete x.captured_at; delete x.gmv_28d; return x; });
        window.TG_DATA.stats_from = 'database';
      }
    })
    .catch(function () { /* dùng số có sẵn */ })
    .then(function () { clearTimeout(timer); start(); });
})();
