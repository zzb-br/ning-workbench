/* ============================================================
 * 宁宁的考公工作台 - 纯 SVG 图表组件（无需任何外部依赖）
 * ============================================================ */
(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var uidCounter = 0;

  function el(name, attrs, parent) {
    var node = document.createElementNS(NS, name);
    for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k)) node.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(node);
    return node;
  }

  function svgEl(container, w, h) {
    container.innerHTML = '';
    var svg = el('svg', { width: w, height: h, viewBox: '0 0 ' + w + ' ' + h });
    container.appendChild(svg);
    return svg;
  }

  function showEmpty(container, msg) {
    container.innerHTML = '<div class="chart-empty">' + msg + '</div>';
  }

  function text(svg, x, y, content, attrs) {
    var a = Util.extend({ x: x, y: y, 'text-anchor': 'middle', 'font-family': 'inherit' }, attrs || {});
    var t = el('text', a, svg);
    t.textContent = content;
    return t;
  }

  /* ---------------- 柱状图 ---------------- */
  function barChart(container, opts) {
    var labels = opts.labels || [];
    var values = opts.values || [];
    var color = opts.color || '#5B6CF0';
    var suffix = opts.suffix || '';
    var height = opts.height || 180;

    var max = Math.max.apply(null, values.concat([0]));
    var total = values.reduce(function (s, v) { return s + (v || 0); }, 0);
    if (total <= 0) { showEmpty(container, '这段时间还没有学习记录哦 🌱'); return; }

    var pad = { top: 24, right: 6, bottom: 30, left: 6 };
    var W = Math.max(container.clientWidth || 560, 300);
    var H = height;
    var plotW = W - pad.left - pad.right;
    var plotH = H - pad.top - pad.bottom;
    var n = values.length;
    var gap = 6;
    var bw = Math.min(46, Math.max(10, (plotW - gap * (n - 1)) / n));
    var svg = svgEl(container, W, H);

    for (var i = 0; i <= 4; i++) {
      var y = pad.top + plotH - (plotH * i) / 4;
      el('line', { x1: pad.left, y1: y, x2: W - pad.right, y2: y, stroke: '#EDF0F7', 'stroke-width': 1 }, svg);
    }

    values.forEach(function (v, i) {
      var x = pad.left + i * (bw + gap) + gap / 2;
      var h = max > 0 ? (v / max) * plotH : 0;
      var y = pad.top + plotH - h;
      el('rect', {
        x: x, y: y, width: bw,
        height: Math.max(h, v > 0 ? 2 : 0),
        rx: Math.min(6, bw / 2),
        fill: color,
        opacity: v > 0 ? 1 : 0.25
      }, svg);
      if (v > 0) {
        text(svg, x + bw / 2, Math.max(y - 6, 8), v + suffix, { 'font-size': 11, fill: '#6B7280' });
      }
      text(svg, x + bw / 2, H - 8, labels[i] || '', { 'font-size': 11, fill: '#9CA3AF' });
    });
  }

  /* ---------------- 折线图 ---------------- */
  function lineChart(container, opts) {
    var labels = opts.labels || [];
    var values = opts.values || [];
    var color = opts.color || '#2EC4B6';
    var suffix = opts.suffix || '';
    var height = opts.height || 180;

    var hasValue = values.some(function (v) { return v !== null && v !== undefined; });
    if (!hasValue) { showEmpty(container, '还没有可统计的正确率哦 📈'); return; }

    var pad = { top: 26, right: 14, bottom: 30, left: 42 };
    var W = Math.max(container.clientWidth || 560, 300);
    var H = height;
    var plotW = W - pad.left - pad.right;
    var plotH = H - pad.top - pad.bottom;
    var svg = svgEl(container, W, H);

    var nums = values.filter(function (v) { return v !== null && v !== undefined; });
    var max = Math.max.apply(null, nums.concat([100]));
    var min = Math.min.apply(null, nums.concat([0]));
    var span = (max - min) || 1;
    var bottom = max + ((max - min) || 1) * 0.25;

    for (var i = 0; i <= 4; i++) {
      var y = pad.top + (plotH * i) / 4;
      el('line', { x1: pad.left, y1: y, x2: W - pad.right, y2: y, stroke: '#EDF0F7', 'stroke-width': 1 }, svg);
      var val = bottom - ((bottom - min) * i) / 4;
      text(svg, pad.left - 8, y + 4, Math.round(val) + suffix, { 'text-anchor': 'end', 'font-size': 10, fill: '#9CA3AF' });
    }

    var points = [];
    values.forEach(function (v, i) {
      if (v === null || v === undefined) return;
      var x = pad.left + (plotW * i) / Math.max(values.length - 1, 1);
      var y = pad.top + plotH - ((v - min) / span) * plotH;
      points.push({ x: x, y: y, v: v, label: labels[i] });
    });

    if (points.length > 1) {
      var line = 'M' + points.map(function (p) { return p.x + ',' + p.y; }).join(' L');
      el('path', { d: line, fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);

      var gid = 'lineArea' + (++uidCounter);
      var defs = el('defs', {}, svg);
      var lg = el('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      el('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': 0.16 }, lg);
      el('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 0 }, lg);
      var area = 'M' + points[0].x + ',' + (pad.top + plotH) +
        ' L' + points.map(function (p) { return p.x + ',' + p.y; }).join(' L') +
        ' L' + points[points.length - 1].x + ',' + (pad.top + plotH) + ' Z';
      el('path', { d: area, fill: 'url(#' + gid + ')', stroke: 'none' }, svg);
    }

    points.forEach(function (p) {
      el('circle', { cx: p.x, cy: p.y, r: 3.5, fill: '#fff', stroke: color, 'stroke-width': 2 }, svg);
      text(svg, p.x, p.y - 9, p.v + suffix, { 'font-size': 10, fill: '#6B7280' });
    });

    values.forEach(function (v, i) {
      if (values.length > 8 && i % 2 !== 0) return;
      var x = pad.left + (plotW * i) / Math.max(values.length - 1, 1);
      text(svg, x, H - 8, labels[i] || '', { 'font-size': 10, fill: '#9CA3AF' });
    });
  }

  /* ---------------- 环形图 ---------------- */
  function donutChart(container, opts) {
    var labels = opts.labels || [];
    var values = opts.values || [];
    var colors = opts.colors || ['#5B6CF0', '#2EC4B6', '#FFB020', '#FF7A59', '#A78BFA', '#F472B6', '#38BDF8', '#FB7185', '#34D399', '#FBBF24'];

    var total = values.reduce(function (s, v) { return s + (v || 0); }, 0);
    if (total <= 0) { showEmpty(container, '还没有数据哦 🍩'); return; }

    container.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'donut-wrap';
    var svgBox = document.createElement('div');
    svgBox.className = 'donut-svg';

    var size = 170, r = 62, cx = size / 2, cy = size / 2;
    var C = 2 * Math.PI * r;
    var svg = svgEl(svgBox, size, size);
    el('circle', { cx: cx, cy: cy, r: r, fill: 'none', stroke: '#EEF1F8', 'stroke-width': 22 }, svg);

    var acc = 0;
    values.forEach(function (v, i) {
      if (v <= 0) return;
      var frac = v / total;
      var dash = frac * C;
      var seg = el('circle', {
        cx: cx, cy: cy, r: r, fill: 'none',
        stroke: colors[i % colors.length],
        'stroke-width': 22,
        'stroke-dasharray': dash + ' ' + (C - dash),
        'stroke-dashoffset': -acc * C,
        transform: 'rotate(-90 ' + cx + ' ' + cy + ')'
      }, svg);
      seg.style.transition = 'stroke-dasharray 0.4s ease';
      acc += frac;
    });

    text(svg, cx, cy - 4, total, { 'font-size': 22, 'font-weight': 700, fill: '#1F2937' });
    text(svg, cx, cy + 18, '分钟', { 'font-size': 11, fill: '#9CA3AF' });

    var legend = document.createElement('div');
    legend.className = 'donut-legend';
    values.forEach(function (v, i) {
      if (v <= 0) return;
      var row = document.createElement('div');
      row.className = 'legend-row';
      var dot = document.createElement('span');
      dot.className = 'legend-dot';
      dot.style.background = colors[i % colors.length];
      var name = document.createElement('span');
      name.className = 'legend-name';
      name.textContent = labels[i] || '';
      var val = document.createElement('span');
      val.className = 'legend-val';
      val.textContent = v + ' 分钟';
      row.appendChild(dot);
      row.appendChild(name);
      row.appendChild(val);
      legend.appendChild(row);
    });
    wrap.appendChild(svgBox);
    wrap.appendChild(legend);
    container.appendChild(wrap);
  }

  /* ---------------- 水平条形图 ---------------- */
  function hBarChart(container, opts) {
    var labels = opts.labels || [];
    var values = opts.values || [];
    var suffix = opts.suffix || '';
    var color = opts.color || '#A78BFA';
    var max = opts.max || 100;

    container.innerHTML = '';
    var valid = values.filter(function (v) { return v !== null && v !== undefined; });
    if (!valid.length) { showEmpty(container, '暂无数据'); return; }

    var wrap = document.createElement('div');
    wrap.className = 'hbar-wrap';
    values.forEach(function (v, i) {
      if (v === null || v === undefined) return;
      var num = Math.round(v * 10) / 10;
      var row = document.createElement('div');
      row.className = 'hbar-row';

      var lb = document.createElement('div');
      lb.className = 'hbar-label';
      lb.textContent = labels[i] || '';

      var track = document.createElement('div');
      track.className = 'hbar-track';
      var fill = document.createElement('div');
      fill.className = 'hbar-fill';
      fill.style.width = Math.min(100, (num / max) * 100) + '%';
      fill.style.background = color;
      track.appendChild(fill);

      var val = document.createElement('div');
      val.className = 'hbar-val';
      val.textContent = num + suffix;

      row.appendChild(lb);
      row.appendChild(track);
      row.appendChild(val);
      wrap.appendChild(row);
    });
    container.appendChild(wrap);
  }

  /* ---------------- 热力图（打卡日历） ---------------- */
  function heatmap(container, opts) {
    var days = opts.days || [];
    var values = opts.values || [];
    var colors = ['#EEF1F8', '#DCE4FF', '#B9C8FF', '#8BA6FF', '#5B6CF0'];

    container.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'heat-wrap';
    var max = Math.max.apply(null, values.concat([0]));
    days.forEach(function (d, i) {
      var v = values[i] || 0;
      var level = 0;
      if (v > 0) {
        level = max > 0 ? Math.max(1, Math.min(4, Math.ceil((v / max) * 4))) : 1;
      }
      var cell = document.createElement('div');
      cell.className = 'heat-cell';
      cell.style.background = colors[level];
      cell.title = d + '：' + v + ' 分钟';
      wrap.appendChild(cell);
    });
    container.appendChild(wrap);
  }

  global.Charts = {
    barChart: barChart,
    lineChart: lineChart,
    donutChart: donutChart,
    hBarChart: hBarChart,
    heatmap: heatmap
  };
})(window);