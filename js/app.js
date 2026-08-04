/* ============================================================
 * 宁宁的考公工作台 - 应用逻辑
 * 页面：工作台 / 每日记录 / 模块学习 / 错题本 / 统计 / 设置
 * ============================================================ */
(function () {
  'use strict';

  var S = window.Store;
  var Charts = window.Charts;
  var app = document.getElementById('app');

  var PALETTE = ['#5B6CF0', '#2EC4B6', '#FFB020', '#FF7A59', '#A78BFA', '#F472B6', '#38BDF8', '#FB7185', '#34D399', '#FBBF24'];

  var state = {
    route: 'dashboard',
    params: {},
    dailyDate: S.todayKey(),
    dailyMonth: S.todayKey().slice(0, 7),
    timer: {
      running: false,
      paused: false,
      moduleId: '',
      startTs: 0,
      accumulatedMs: 0,
      tick: null
    }
  };

  /* ================= 工具函数 ================= */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtDuration(min) {
    min = Math.round(min || 0);
    if (min <= 0) return '0 分钟';
    var h = Math.floor(min / 60);
    var m = min % 60;
    if (h && m) return h + ' 小时 ' + m + ' 分';
    if (h) return h + ' 小时';
    return m + ' 分钟';
  }

  function fmtDateCN(key) {
    var parts = String(key).split('-');
    return parseInt(parts[1], 10) + '月' + parseInt(parts[2], 10) + '日';
  }

  function fmtDateFull(key) {
    return fmtDateCN(key) + ' ' + S.weekdayCN(key);
  }

  function toast(msg, type) {
    var wrap = document.getElementById('toastWrap');
    var t = document.createElement('div');
    t.className = 'toast ' + (type || 'info');
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(function () { t.classList.add('show'); }, 10);
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { t.remove(); }, 300);
    }, 2600);
  }

  function confirmDialog(msg) {
    return window.confirm(msg);
  }

  /* ================= 弹窗 ================= */

  function openModal(opts) {
    var backdrop = document.getElementById('modalBackdrop');
    backdrop.hidden = false;
    backdrop.innerHTML =
      '<div class="modal" role="dialog">' +
      '<div class="modal-head"><h3 class="modal-title">' + opts.title + '</h3>' +
      '<button class="modal-close" type="button" aria-label="关闭">✕</button></div>' +
      '<div class="modal-body">' + opts.body + '</div></div>';
    $('.modal-close', backdrop).addEventListener('click', closeModal);
    backdrop._onClose = opts.onClose || null;
    if (opts.onOpen) opts.onOpen(backdrop);
    document.body.classList.add('modal-open');
  }

  function closeModal() {
    var backdrop = document.getElementById('modalBackdrop');
    if (backdrop._onClose) { backdrop._onClose(); backdrop._onClose = null; }
    backdrop.hidden = true;
    backdrop.innerHTML = '';
    document.body.classList.remove('modal-open');
  }

  /* ================= 表单辅助 ================= */

  function field(label, controlHtml) {
    return '<label class="field"><span class="field-label">' + label + '</span>' + controlHtml + '</label>';
  }

  function moduleOptions(selectedId) {
    return S.MODULES.map(function (m) {
      return '<option value="' + m.id + '"' + (m.id === selectedId ? ' selected' : '') + '>' + m.group + '·' + m.name + '</option>';
    }).join('');
  }

  function valuesFromModal(bd) {
    return {
      date: $('[name=date]', bd).value || S.todayKey(),
      moduleId: $('[name=moduleId]', bd).value,
      durationMin: Number($('[name=durationMin]', bd).value) || 0,
      questionCount: Number($('[name=questionCount]', bd).value) || 0,
      correctCount: Number($('[name=correctCount]', bd).value) || 0,
      note: $('[name=note]', bd).value
    };
  }

  function openRecordModal(date, moduleId, rec) {
    openModal({
      title: rec ? '✏️ 编辑学习记录' : '📝 添加学习记录',
      body:
        '<div class="form-grid">' +
        field('日期', '<input type="date" name="date" value="' + (rec ? rec.date : date) + '">') +
        field('模块', '<select name="moduleId">' + moduleOptions(rec ? rec.moduleId : moduleId) + '</select>') +
        field('学习时长（分钟）', '<input type="number" name="durationMin" min="0" step="1" placeholder="如 45" value="' + (rec ? rec.durationMin : '') + '">') +
        field('刷题数', '<input type="number" name="questionCount" min="0" step="1" placeholder="如 20" value="' + (rec ? rec.questionCount : '') + '">') +
        field('做对题数', '<input type="number" name="correctCount" min="0" step="1" placeholder="可留空" value="' + (rec ? rec.correctCount : '') + '">') +
        field('学习内容 / 备注', '<textarea name="note" rows="2" placeholder="例如：逻辑填空专项训练">' + (rec ? esc(rec.note) : '') + '</textarea>') +
        '</div>' +
        '<div class="modal-actions"><button class="btn" type="button" data-cancel>取消</button><button class="btn btn-primary" type="button" data-submit>' + (rec ? '保存修改' : '添加记录') + '</button></div>',
      onOpen: function (bd) {
        $('[data-cancel]', bd).addEventListener('click', closeModal);
        $('[data-submit]', bd).addEventListener('click', function () {
          var v = valuesFromModal(bd);
          if (!v.date) { toast('请选择日期', 'error'); return; }
          if (rec) S.updateRecord(rec.id, v); else S.addRecord(v);
          closeModal();
          renderAll();
          toast(rec ? '记录已更新 ✏️' : '记录已添加 ✅');
        });
      }
    });
  }

  function openMistakeModal(mis, prefill) {
    prefill = prefill || {};
    var defDate = mis ? mis.date : (prefill.date || S.todayKey());
    var defModule = mis ? mis.moduleId : (prefill.moduleId || '');
    openModal({
      title: mis ? '✏️ 编辑错题' : '📝 添加错题',
      body:
        '<div class="form-grid">' +
        field('日期', '<input type="date" name="date" value="' + defDate + '">') +
        field('所属模块', '<select name="moduleId">' + moduleOptions(defModule) + '</select>') +
        field('题目内容', '<textarea name="question" rows="3" placeholder="抄录或粘贴题目…">' + (mis ? esc(mis.question) : '') + '</textarea>') +
        field('我的答案', '<input type="text" name="myAnswer" value="' + (mis ? esc(mis.myAnswer) : '') + '" placeholder="你当时选的答案">') +
        field('正确答案', '<input type="text" name="correctAnswer" value="' + (mis ? esc(mis.correctAnswer) : '') + '" placeholder="正确答案">') +
        field('知识点', '<input type="text" name="knowledge" value="' + (mis ? esc(mis.knowledge) : '') + '" placeholder="例如：增长率计算">') +
        field('解析 / 笔记', '<textarea name="analysis" rows="3" placeholder="错因分析、正确思路…">' + (mis ? esc(mis.analysis) : '') + '</textarea>') +
        '<div class="field field-full">' +
        '<span class="field-label">题目照片（可选：拍照或从相册选）</span>' +
        '<div class="img-pick-row">' +
        '<button class="btn" type="button" data-take-photo>📷 拍照</button>' +
        '<button class="btn" type="button" data-upload-photo>🖼️ 从相册选择</button>' +
        (mis && mis.img ? '<button class="btn btn-sm btn-danger-ghost" type="button" data-remove-photo>🗑️ 删除照片</button>' : '') +
        '</div>' +
        '<input type="file" accept="image/*" data-photo-input hidden>' +
        '<div class="img-preview" data-img-preview></div>' +
        '</div>' +
        '</div>' +
        '<div class="modal-actions"><button class="btn" type="button" data-cancel>取消</button><button class="btn btn-primary" type="button" data-submit>' + (mis ? '保存修改' : '添加错题') + '</button></div>',
      onOpen: function (bd) {
        $('[data-cancel]', bd).addEventListener('click', closeModal);
        setupMistakePhoto(bd, mis);
        $('[data-submit]', bd).addEventListener('click', function () {
          var v = {
            date: $('[name=date]', bd).value || S.todayKey(),
            moduleId: $('[name=moduleId]', bd).value,
            question: $('[name=question]', bd).value,
            myAnswer: $('[name=myAnswer]', bd).value,
            correctAnswer: $('[name=correctAnswer]', bd).value,
            knowledge: $('[name=knowledge]', bd).value,
            analysis: $('[name=analysis]', bd).value,
            mastered: mis ? mis.mastered : false
          };
          if (!String(v.question).trim() && !modalPhotoBlob && !(mis && mis.img)) { toast('请填写题目内容或添加照片', 'error'); return; }
          if (mis) {
            S.updateMistake(mis.id, v);
            if (modalPhotoBlob) {
              S.putImage(mis.id, modalPhotoBlob, function () {});
              S.updateMistake(mis.id, { img: 1 });
            } else if (modalPhotoRemoved) {
              S.deleteImage(mis.id, function () {});
              S.updateMistake(mis.id, { img: 0 });
            }
          } else {
            var item = S.addMistake(v);
            if (modalPhotoBlob) {
              S.putImage(item.id, modalPhotoBlob, function () {});
              S.updateMistake(item.id, { img: 1 });
            }
          }
          closeModal();
          renderAll();
          toast(mis ? '错题已更新 ✏️' : '错题已加入错题本 📖');
        });
      },
      onClose: function () {
        if (modalPhotoUrl) { revokeObjUrl(modalPhotoUrl); modalPhotoUrl = null; }
      }
    });
  }

  /* ================= 通用渲染片段 ================= */

  function statCard(ic, label, num, sub) {
    return '<div class="stat-card">' +
      '<div class="stat-ic">' + ic + '</div>' +
      '<div class="stat-num">' + num + '</div>' +
      '<div class="stat-label">' + label + '</div>' +
      (sub ? '<div class="stat-sub">' + sub + '</div>' : '') +
      '</div>';
  }

  function progressRow(label, val, goal, unit, pct, color) {
    return '<div class="goal-row">' +
      '<div class="goal-line"><span>' + label + '</span><span>' + val + ' / ' + goal + ' ' + unit + '</span></div>' +
      '<div class="progress"><div class="progress-fill" style="width:' + pct + '%' + (color ? ';background:' + color : '') + '"></div></div>' +
      '</div>';
  }

  function emptyBlock(msg, sub, href, linkText) {
    return '<div class="empty">' +
      '<div class="empty-ic">🌱</div>' +
      '<div class="empty-msg">' + msg + '</div>' +
      (sub ? '<div class="empty-sub">' + sub + '</div>' : '') +
      (href ? '<a class="btn btn-primary btn-sm" href="' + href + '">' + linkText + '</a>' : '') +
      '</div>';
  }

  function recordItem(r, opts) {
    opts = opts || {};
    var m = S.getModule(r.moduleId);
    var acc = r.questionCount > 0 ? S.accuracyOf([r]) : null;
    return '<div class="record-item">' +
      '<div class="record-ic">' + (m ? m.icon : '📘') + '</div>' +
      '<div class="record-main">' +
      '<div class="record-title">' + (m ? esc(m.name) : '未知模块') +
      (opts.showDate ? '<span class="record-date">' + fmtDateCN(r.date) + '</span>' : '') + '</div>' +
      '<div class="record-note">' + esc(r.note || '未填写备注') + '</div>' +
      '</div>' +
      '<div class="record-meta">' +
      '<span class="chip chip-time">⏱️ ' + fmtDuration(r.durationMin) + '</span>' +
      '<span class="chip chip-ques">📝 ' + r.questionCount + ' 题</span>' +
      (acc !== null ? '<span class="chip chip-acc">✅ ' + acc + '%</span>' : '') +
      '</div>' +
      (opts.actions || opts.mistakeBtn ? '<div class="record-actions">' +
        (opts.mistakeBtn ? '<button class="btn btn-sm btn-ghost" data-mistake-record="' + r.id + '" title="记错题">📝</button>' : '') +
        (opts.actions ? '<button class="btn btn-sm btn-ghost" data-edit-record="' + r.id + '" title="编辑">✏️</button>' +
        '<button class="btn btn-sm btn-danger-ghost" data-del-record="' + r.id + '" title="删除">🗑️</button>' : '') +
        '</div>' : '') +
      '</div>';
  }

  function mistakeMini(m) {
    var mod = S.getModule(m.moduleId);
    var q = String(m.question || '');
    return '<a class="mistake-mini" href="#/mistakes">' +
      '<span class="mistake-mini-ic">' + (mod ? mod.icon : '📝') + '</span>' +
      '<span class="mistake-mini-text">' + esc(q.slice(0, 36)) + (q.length > 36 ? '…' : '') + '</span>' +
      '<span class="badge ' + (m.mastered ? 'badge-ok' : 'badge-warn') + '">' + (m.mastered ? '已掌握' : '待复习') + '</span>' +
      '</a>';
  }

  function mistakeCard(m) {
    var mod = S.getModule(m.moduleId);
    return '<div class="mistake-card' + (m.mastered ? ' mastered' : '') + '">' +
      '<div class="mistake-top">' +
      '<span class="badge">' + (mod ? mod.icon + ' ' + esc(mod.name) : '未知模块') + '</span>' +
      '<span class="mistake-date">' + fmtDateFull(m.date) + '</span>' +
      '<span class="badge ' + (m.mastered ? 'badge-ok' : 'badge-warn') + '">' + (m.mastered ? '✅ 已掌握' : '🔴 待复习') + '</span>' +
      '</div>' +
      '<div class="mistake-q">' + esc(m.question) + '</div>' +
      '<div class="mistake-img' + (m.img ? ' has' : '') + '" data-mistake-img="' + m.id + '" data-has-img="' + (m.img ? '1' : '0') + '"></div>' +
      (m.knowledge ? '<div class="mistake-tag">🏷️ ' + esc(m.knowledge) + '</div>' : '') +
      '<div class="mistake-answer-grid">' +
      '<div class="mistake-ans wrong"><span class="ans-label">我的答案</span><span>' + esc(m.myAnswer || '—') + '</span></div>' +
      '<div class="mistake-ans right"><span class="ans-label">正确答案</span><span>' + esc(m.correctAnswer || '—') + '</span></div>' +
      '</div>' +
      (m.analysis ? '<details class="mistake-analysis"><summary>查看解析</summary><p>' + esc(m.analysis) + '</p></details>' : '') +
      '<div class="mistake-actions">' +
      '<button class="btn btn-sm ' + (m.mastered ? 'btn-ghost' : 'btn-ok') + '" data-toggle-mastered="' + m.id + '">' + (m.mastered ? '↩️ 标记为待复习' : '✅ 标记已掌握') + '</button>' +
      '<button class="btn btn-sm btn-ghost" data-edit-mistake="' + m.id + '">✏️ 编辑</button>' +
      '<button class="btn btn-sm btn-danger-ghost" data-del-mistake="' + m.id + '">🗑️ 删除</button>' +
      '</div>' +
      '</div>';
  }

  function bindRecordActions() {
    $$('[data-mistake-record]', app).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var r = Util.findBy(S.load().records, function (x) { return x.id === btn.getAttribute('data-mistake-record'); });
        if (r) openMistakeModal(null, { date: r.date, moduleId: r.moduleId });
      });
    });
    $$('[data-edit-record]', app).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var r = Util.findBy(S.load().records, function (x) { return x.id === btn.getAttribute('data-edit-record'); });
        if (r) openRecordModal(r.date, r.moduleId, r);
      });
    });
    $$('[data-del-record]', app).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-del-record');
        if (confirmDialog('确定删除这条学习记录吗？')) {
          S.deleteRecord(id);
          renderAll();
          toast('记录已删除');
        }
      });
    });
  }

  function bindMistakeActions() {
    $$('[data-toggle-mastered]', app).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-toggle-mastered');
        var m = Util.findBy(S.load().mistakes, function (x) { return x.id === id; });
        if (m) {
          S.updateMistake(id, { mastered: !m.mastered });
          renderAll();
          toast(m.mastered ? '已标记为待复习' : '恭喜掌握！🎉');
        }
      });
    });
    $$('[data-edit-mistake]', app).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var m = Util.findBy(S.load().mistakes, function (x) { return x.id === btn.getAttribute('data-edit-mistake'); });
        if (m) openMistakeModal(m);
      });
    });
    $$('[data-del-mistake]', app).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-del-mistake');
        if (confirmDialog('确定删除这道错题吗？')) {
          S.deleteMistake(id);
          S.deleteImage(id, function () {});
          renderAll();
          toast('错题已删除');
        }
      });
    });
    $$('[data-mistake-img]', app).forEach(function (box) {
      box.addEventListener('click', function () {
        if (box.getAttribute('data-has-img') === '1') {
          showImageLightbox(box.getAttribute('data-mistake-img'));
        }
      });
    });
    loadMistakeImages();
  }

  /* ---- 错题照片：IndexedDB 存储 + 压缩 + 预览 ---- */
  var modalPhotoBlob = null;
  var modalPhotoUrl = null;
  var modalPhotoRemoved = false;

  function makeObjUrl(blob) { return (window.URL || window.webkitURL).createObjectURL(blob); }
  function revokeObjUrl(u) { (window.URL || window.webkitURL).revokeObjectURL(u); }

  function dataUrlToBlob(dataUrl) {
    var parts = dataUrl.split(',');
    var mime = parts[0].match(/:(.*?);/)[1];
    var bin = atob(parts[1]);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function fileToCompressedBlob(file, cb) {
    if (!file || !/^image\//.test(file.type)) { cb(null); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var MAX = 1000;
        var w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        if (canvas.toBlob) {
          canvas.toBlob(function (blob) { cb(blob || null); }, 'image/jpeg', 0.72);
        } else {
          cb(dataUrlToBlob(canvas.toDataURL('image/jpeg', 0.72)));
        }
      };
      img.onerror = function () { cb(null); };
      img.src = reader.result;
    };
    reader.onerror = function () { cb(null); };
    reader.readAsDataURL(file);
  }

  function setupMistakePhoto(bd, mis) {
    modalPhotoBlob = null;
    if (modalPhotoUrl) { revokeObjUrl(modalPhotoUrl); modalPhotoUrl = null; }
    modalPhotoRemoved = false;
    var input = $('[data-photo-input]', bd);
    var preview = $('[data-img-preview]', bd);

    function showBlob(blob) {
      if (modalPhotoUrl) revokeObjUrl(modalPhotoUrl);
      modalPhotoUrl = makeObjUrl(blob);
      modalPhotoBlob = blob;
      modalPhotoRemoved = false;
      preview.innerHTML = '<div class="img-preview-item"><img src="' + modalPhotoUrl + '" alt="题目照片"><span class="img-preview-tag">新照片</span></div>';
    }

    $('[data-take-photo]', bd).addEventListener('click', function () {
      input.setAttribute('capture', 'environment');
      input.click();
    });
    $('[data-upload-photo]', bd).addEventListener('click', function () {
      input.removeAttribute('capture');
      input.click();
    });
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (!f) return;
      fileToCompressedBlob(f, function (blob) {
        if (blob) showBlob(blob);
        else toast('照片处理失败，请换一张试试', 'error');
      });
      input.value = '';
    });

    if (mis && mis.img) {
      S.getImage(mis.id, function (err, blob) {
        if (!err && blob) {
          preview.innerHTML = '<div class="img-preview-item"><img src="' + makeObjUrl(blob) + '" alt="当前照片"><span class="img-preview-tag">当前照片</span></div>';
        }
      });
    }
    var rm = $('[data-remove-photo]', bd);
    if (rm) {
      rm.addEventListener('click', function () {
        if (modalPhotoUrl) { revokeObjUrl(modalPhotoUrl); modalPhotoUrl = null; }
        modalPhotoBlob = null;
        modalPhotoRemoved = true;
        preview.innerHTML = '<div class="img-preview-empty">已移除照片</div>';
      });
    }
  }

  function loadMistakeImages() {
    $$('[data-mistake-img]', app).forEach(function (box) {
      if (box.getAttribute('data-has-img') !== '1') return;
      var id = box.getAttribute('data-mistake-img');
      S.getImage(id, function (err, blob) {
        if (err || !blob) return;
        box.innerHTML = '<img src="' + makeObjUrl(blob) + '" alt="题目照片">';
      });
    });
  }

  function showImageLightbox(mid) {
    S.getImage(mid, function (err, blob) {
      if (err || !blob) { toast('照片不存在', 'error'); return; }
      var url = makeObjUrl(blob);
      openModal({
        title: '📷 题目照片',
        body: '<div class="lightbox-img"><img src="' + url + '" alt="题目照片"></div>',
        onClose: function () { revokeObjUrl(url); }
      });
    });
  }


  /* ---- 任务完成庆祝 ---- */
  var ENCOURAGE_MSGS = [
    '太棒了！今天的任务全部完成，你是最棒的！🎉',
    '任务清零！快去奖励一下努力了一天的自己～',
    '今天也超级自律，为你骄傲！💪',
    '所有任务都完成了，离上岸又近了一步！🌟',
    '坚持的每一天都在发光，继续加油！✨',
    '任务全搞定，今晚可以安心睡个好觉啦～🌙',
    '哇，今天效率满分！记得也要好好休息哦～',
    '又向目标前进了一大步，好样的！🚀'
  ];

  var TROPHY_SVG = '<svg viewBox="0 0 220 180" xmlns="http://www.w3.org/2000/svg" style="width:190px;height:auto">' +
    '<defs>' +
    '<linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#FFE08A"/><stop offset="100%" stop-color="#F5B40E"/></linearGradient>' +
    '<linearGradient id="tr" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#FFC233"/><stop offset="100%" stop-color="#FF9F1C"/></linearGradient>' +
    '</defs>' +
    '<circle cx="110" cy="85" r="72" fill="#FFF6DC"/>' +
    '<circle cx="110" cy="85" r="56" fill="#FFEEC2" opacity="0.65"/>' +
    '<path d="M176 34 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 z" fill="#FFD34D"/>' +
    '<path d="M38 48 l2.5 7 7 2.5 -7 2.5 -2.5 7 -2.5 -7 -7 -2.5 7 -2.5 z" fill="#FFB020"/>' +
    '<path d="M196 112 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2 z" fill="#FFD34D"/>' +
    '<path d="M28 118 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z" fill="#FFC233"/>' +
    '<rect x="85" y="28" width="50" height="16" rx="8" fill="url(#tr)"/>' +
    '<path d="M90 44 h40 v16 a20 20 0 0 1 -40 0 z" fill="url(#tg)"/>' +
    '<path d="M95 68 h30 v26 a15 15 0 0 1 -30 0 z" fill="url(#tg)" opacity="0.9"/>' +
    '<rect x="77" y="40" width="12" height="40" rx="6" fill="url(#tr)"/>' +
    '<rect x="131" y="40" width="12" height="40" rx="6" fill="url(#tr)"/>' +
    '<path d="M77 44 l-7 -9 M77 48 l-8 -4" stroke="#FF8F00" stroke-width="3" stroke-linecap="round" fill="none"/>' +
    '<path d="M143 44 l7 -9 M143 48 l8 -4" stroke="#FF8F00" stroke-width="3" stroke-linecap="round" fill="none"/>' +
    '<rect x="96" y="100" width="28" height="9" rx="4.5" fill="#E8A90C"/>' +
    '<rect x="104" y="109" width="12" height="16" rx="4" fill="#E8A90C"/>' +
    '</svg>';

  function showEncourage() {
    var el = document.getElementById('celebrate');
    if (!el) return;
    document.getElementById('celebrateSvg').innerHTML = TROPHY_SVG;
    document.getElementById('celebrateMsg').textContent = ENCOURAGE_MSGS[Math.floor(Math.random() * ENCOURAGE_MSGS.length)];
    var conf = document.getElementById('celebrateConfetti');
    conf.innerHTML = '';
    var colors = ['#FF7A59', '#FFB020', '#2EC4B6', '#5B6CF0', '#F472B6', '#34D399'];
    for (var i = 0; i < 16; i++) {
      var d = document.createElement('span');
      d.className = 'confetti-dot';
      d.style.left = (Math.random() * 96 + 2) + '%';
      d.style.background = colors[i % colors.length];
      d.style.animationDelay = (Math.random() * 1.6) + 's';
      d.style.animationDuration = (1.6 + Math.random() * 1.2) + 's';
      conf.appendChild(d);
    }
    el.hidden = false;
  }


  /* ---- 主题 ---- */
  var THEMES = [
    { id: 'default', name: '默认', icon: '🌈', bg: 'linear-gradient(135deg,#F4F6FB,#FFFFFF)', line: '#E7EAF2' },
    { id: 'fresh', name: '清新', icon: '🌿', bg: 'linear-gradient(135deg,#F0FAF6,#FFFFFF)', line: '#D9EDE6' },
    { id: 'literary', name: '文艺', icon: '📖', bg: 'linear-gradient(135deg,#F6F1E7,#FFFDF7)', line: '#E5DBC6' },
    { id: 'energy', name: '活力', icon: '☀️', bg: 'linear-gradient(135deg,#FFF6F0,#FFFFFF)', line: '#F2DED2' },
    { id: 'dark', name: '暗夜', icon: '🌙', bg: 'linear-gradient(135deg,#15171C,#1E2128)', line: '#2C313B' }
  ];

  function cssVar(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name);
      return (v && v.trim()) ? v.trim() : fallback;
    } catch (e) { return fallback; }
  }

  function applyTheme(theme) {
    var t = theme || 'default';
    if (t === 'default') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }

  /* ---- 任务提醒闹钟 ---- */
  var audioCtx = null;

  function playBeep() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var now = audioCtx.currentTime;
      for (var i = 0; i < 3; i++) {
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        var t0 = now + i * 0.35;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.3);
      }
    } catch (e) {}
  }

  function showReminderAlert(text) {
    var bar = document.getElementById('reminderBar');
    if (!bar) return;
    document.getElementById('reminderBarText').textContent = '⏰ 该完成任务啦：' + text;
    bar.hidden = false;
    clearTimeout(showReminderAlert._t);
    showReminderAlert._t = setTimeout(function () { bar.hidden = true; }, 10000);
  }

  function fireReminder(task) {
    showReminderAlert(task.text);
    playBeep();
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('宁宁的考公工作台', { body: '⏰ 该完成任务啦：' + task.text, tag: task.id });
      }
    } catch (e) {}
  }

  function requestNotifyPermission() {
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    } catch (e) {}
  }

  function checkReminders() {
    var now = new Date();
    var cur = Util.pad(now.getHours(), 2) + ':' + Util.pad(now.getMinutes(), 2);
    S.getTasks(S.todayKey()).forEach(function (t) {
      if (t.remind && !t.reminded && !t.done && t.remind <= cur) {
        S.markReminded(t.id);
        fireReminder(t);
      }
    });
  }

  /* ================= 工作台 ================= */

  function renderDashboard() {
    var today = S.todayKey();
    var all = S.load();
    var tRecs = S.recordsByDate(today);
    var minutes = S.sumDuration(tRecs);
    var questions = S.sumQuestions(tRecs);
    var acc = S.accuracyOf(tRecs);
    var streak = S.streakDays();
    var set = all.settings;
    var hour = new Date().getHours();
    var greet = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';

    var goalMinPct = Math.min(100, Math.round((minutes / Math.max(set.goalMinutes, 1)) * 100));
    var goalQPct = Math.min(100, Math.round((questions / Math.max(set.goalQuestions, 1)) * 100));

    var week = S.seriesForLastNDays(7, function (key) { return S.sumDuration(S.recordsByDate(key)); });
    var weekQ = S.seriesForLastNDays(7, function (key) { return S.sumQuestions(S.recordsByDate(key)); });
    var labels7 = week.map(function (w) { return S.parseKey(w.key).getDate() + '日'; });

    var mods = S.moduleSummary().filter(function (m) { return m.minutes > 0 || m.questions > 0; }).sort(function (a, b) { return b.minutes - a.minutes; });
    var recent = all.records.slice().sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); }).slice(0, 5);
    var recentMis = all.mistakes.slice().sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); }).slice(0, 3);
    var isEmpty = all.records.length === 0 && all.mistakes.length === 0;

    var goalMetHtml = '';
    if (minutes >= set.goalMinutes && questions >= set.goalQuestions && (minutes > 0 || questions > 0)) {
      goalMetHtml = '<div class="goal-done">🎉 今日目标全部达成！太棒了！</div>';
    }

    var examHtml = '';
    if (set.examGuokao || set.examHenan) {
      examHtml = '<div class="countdown-row">' +
        countdownCard('🇨🇳 国考倒计时', set.examGuokao, S.daysUntil(set.examGuokao)) +
        countdownCard('🏛️ 河南省考倒计时', set.examHenan, S.daysUntil(set.examHenan)) +
        '</div>';
    }

    var tStats = S.taskStats(today);
    var activeTasks = S.getTasks(today).filter(function (x) { return !x.done; });
    var tasksHtml = '<div class="card"><div class="card-head"><h3>✅ 今日任务</h3>' +
      '<a class="link" href="#/tasks">任务页 ›</a></div>' +
      '<div class="task-add-row"><input type="text" data-add-task-dash placeholder="添加任务，如：行测 100 题" maxlength="60">' +
      '<button class="btn btn-primary btn-sm" data-add-task-btn>＋ 添加</button></div>' +
      '<div class="task-list">' +
      (activeTasks.length ? activeTasks.map(taskItemDash).join('')
        : emptyBlock('今天还没有任务', '添加任务，完成一项就去掉一项', '#/tasks', '去设置任务')) +
      '</div>' +
      (tStats.done ? '<div class="task-summary">今日已完成 ' + tStats.done + ' 项 🎉</div>' : '') +
      '</div>';

    var habits = S.getHealthHabits();
    var flowersToday = S.flowersOn(today);
    var flowersTotal = S.totalFlowers();
    var healthHtml = '<div class="card"><div class="card-head"><h3>🌺 健康生活</h3>' +
      '<a class="link" href="#/health">更多 ›</a></div>' +
      '<div class="health-quick">' +
      habits.slice(0, 4).map(function (h) {
        var done = S.isHabitDone(h, today);
        return '<button class="habit-chip' + (done ? ' done' : '') + '" data-toggle-habit="' + esc(h) + '">' + (done ? '🌺 ' : '') + esc(h) + '</button>';
      }).join('') +
      '</div>' +
      '<div class="flower-line">今日已得 <b>' + flowersToday + '</b> 朵小红花 · 累计 <b>' + flowersTotal + '</b> 朵</div>' +
      '</div>';

    app.innerHTML =
      '<section class="page">' +
      '<div class="hero card">' +
      '<div class="hero-left"><h2>' + greet + '，' + esc(set.name) + ' 🌈</h2>' +
      '<p>' + fmtDateFull(today) + ' · 今天也要元气满满地学习呀</p></div>' +
      '<div class="hero-right"><div class="streak-badge">🔥 连续打卡 ' + streak + ' 天</div></div>' +
      '</div>' +

      examHtml +

      '<div class="stats-grid">' +
      statCard('⏱️', '今日学习时长', fmtDuration(minutes), '目标 ' + fmtDuration(set.goalMinutes)) +
      statCard('📝', '今日刷题', questions + ' 题', '目标 ' + set.goalQuestions + ' 题') +
      statCard('🎯', '今日正确率', acc === null ? '—' : acc + '%', acc === null ? '刷题后自动统计' : '共 ' + S.sumQuestions(tRecs) + ' 题') +
      statCard('🗓️', '今日记录', tRecs.length + ' 条', '坚持记录每一天') +
      '</div>' +

      '<div class="grid-2">' +
      '<div class="card"><div class="card-head"><h3>🎯 今日目标进度</h3></div>' +
      '<div class="goal-rows">' +
      progressRow('学习时长', minutes, set.goalMinutes, '分钟', goalMinPct, cssVar('--primary', '#5B6CF0')) +
      progressRow('刷题数量', questions, set.goalQuestions, '题', goalQPct, cssVar('--teal', '#2EC4B6')) +
      '</div>' + goalMetHtml + '</div>' +
      '<div class="card"><div class="card-head"><h3>🥧 各模块累计时长</h3><a class="link" href="#/stats">更多 ›</a></div>' +
      '<div id="dashDonut"></div></div>' +
      '</div>' +

      tasksHtml +

      '<div class="grid-2">' +
      '<div class="card"><div class="card-head"><h3>📈 近 7 天学习时长</h3></div><div class="chart" id="dashBar"></div></div>' +
      '<div class="card"><div class="card-head"><h3>📝 近 7 天刷题量</h3></div><div class="chart" id="dashBarQ"></div></div>' +
      '</div>' +

      '<div class="grid-2">' +
      '<div class="card"><div class="card-head"><h3>🕒 最近学习记录</h3><a class="link" href="#/daily">全部 ›</a></div>' +
      '<div class="record-list">' +
      (recent.length ? recent.map(function (r) { return recordItem(r, { showDate: true, mistakeBtn: true }); }).join('')
        : emptyBlock('还没有学习记录', '点击「开始计时」或到每日记录里添加吧', '#/daily', '去记录')) +
      '</div></div>' +
      '<div class="card"><div class="card-head"><h3>📝 最近错题</h3><div style="display:flex;gap:8px;align-items:center"><a class="link" href="#/mistakes">错题本 ›</a><button class="btn btn-sm btn-danger-ghost" data-quick-mistake>📝 记错题</button></div></div>' +
      '<div class="mistake-mini-list">' +
      (recentMis.length ? recentMis.map(mistakeMini).join('')
        : emptyBlock('还没有错题', '做题出错很正常，记得整理进错题本', '#/mistakes', '去整理')) +
      '</div></div>' +
      '</div>' +

      healthHtml +

      (isEmpty ? '<div class="first-run">' +
        '<div class="empty-ic">👋</div>' +
        '<p>欢迎来到宁宁的考公工作台！这里会记录你的每一次学习、每一个模块的进度和错题。想先看看效果？可以载入一组示例数据。</p>' +
        '<button class="btn btn-primary" data-sample-now>🎲 载入示例数据</button>' +
        '<a class="btn" href="#/settings">去设置</a>' +
        '</div>' : '') +
      '</section>';

    Charts.donutChart($('#dashDonut'), {
      labels: mods.map(function (m) { return m.module.name; }),
      values: mods.map(function (m) { return m.minutes; }),
      colors: PALETTE
    });
    Charts.barChart($('#dashBar'), { labels: labels7, values: week.map(function (w) { return w.value; }), suffix: '分', color: cssVar('--primary', '#5B6CF0') });
    Charts.barChart($('#dashBarQ'), { labels: labels7, values: weekQ.map(function (w) { return w.value; }), suffix: '题', color: cssVar('--teal', '#2EC4B6') });

    var dashAddInput = $('[data-add-task-dash]', app);
    if (dashAddInput) {
      function addDashTask() {
        var txt = dashAddInput.value;
        if (!String(txt).trim()) { toast('请输入任务内容', 'error'); return; }
        S.addTask(txt, today);
        renderAll();
      }
      $('[data-add-task-btn]', app).addEventListener('click', addDashTask);
      dashAddInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') addDashTask(); });
      $$('[data-done-task]', app).forEach(function (btn) {
        btn.addEventListener('click', function () {
          S.completeTask(btn.getAttribute('data-done-task'));
          renderAll();
          var st = S.taskStats(today);
          if (st.total > 0 && st.done === st.total) showEncourage();
          toast('任务完成 ✅');
        });
      });
      $$('[data-toggle-habit]', app).forEach(function (btn) {
        btn.addEventListener('click', function () {
          var h = btn.getAttribute('data-toggle-habit');
          if (S.isHabitDone(h, today)) {
            S.unlogHabit(h, today);
            renderAll();
          } else {
            S.logHabit(h, today);
            renderAll();
            toast('奖励一朵小红花 🌺');
          }
        });
      });
    }

    var sampleBtn = $('[data-sample-now]', app);
    if (sampleBtn) {
      sampleBtn.addEventListener('click', function () {
        if (!confirmDialog('载入示例数据会覆盖当前数据，确定吗？')) return;
        S.clearAll();
        S.loadSample();
        renderAll();
        toast('示例数据已载入 🎲');
      });
    }
    var qmBtn = $('[data-quick-mistake]', app);
    if (qmBtn) {
      qmBtn.addEventListener('click', function () { openMistakeModal(null, { date: S.todayKey() }); });
    }
  }

  /* ================= 每日记录 ================= */

  function renderDaily() {
    var selDate = state.dailyDate;
    var parts = state.dailyMonth.split('-');
    var year = Number(parts[0]);
    var month = Number(parts[1]);
    var firstDay = new Date(year, month - 1, 1);
    var startOffset = (firstDay.getDay() + 6) % 7;
    var daysInMonth = new Date(year, month, 0).getDate();
    var today = S.todayKey();
    var dayMap = S.daysWithData();

    var cells = '';
    for (var i = 0; i < startOffset; i++) cells += '<div class="cal-cell empty"></div>';
    for (var d = 1; d <= daysInMonth; d++) {
      var key = S.toDateKey(new Date(year, month - 1, d));
      var isToday = key === today;
      var isSel = key === selDate;
      var has = dayMap[key];
      cells += '<div class="cal-cell' + (isToday ? ' today' : '') + (isSel ? ' selected' : '') + '" data-date="' + key + '">' +
        '<span class="cal-num">' + d + '</span>' +
        (has ? '<span class="cal-dot"></span>' : '') +
        '</div>';
    }

    var recs = S.recordsByDate(selDate).slice().sort(function (a, b) { return (a.createdAt || '').localeCompare(b.createdAt || ''); });
    var minutes = S.sumDuration(recs);
    var questions = S.sumQuestions(recs);
    var acc = S.accuracyOf(recs);

    app.innerHTML =
      '<section class="page">' +
      '<div class="card">' +
      '<div class="card-head">' +
      '<h3>📅 打卡日历</h3>' +
      '<div class="cal-nav">' +
      '<button class="btn btn-ghost" data-month="-1">‹ 上月</button>' +
      '<span class="cal-month">' + year + ' 年 ' + month + ' 月</span>' +
      '<button class="btn btn-ghost" data-month="1">下月 ›</button>' +
      '</div></div>' +
      '<div class="cal-week">' + ['一', '二', '三', '四', '五', '六', '日'].map(function (w) { return '<div class="cal-weekday">' + w + '</div>'; }).join('') + '</div>' +
      '<div class="cal-grid">' + cells + '</div>' +
      '</div>' +

      '<div class="card">' +
      '<div class="card-head"><h3>🗓️ ' + fmtDateFull(selDate) + ' 的学习</h3>' +
      '<button class="btn btn-sm btn-danger-ghost" data-quick-mistake>📝 记错题</button>' +
      '<button class="btn btn-primary" data-add-record>＋ 添加记录</button></div>' +
      '<div class="day-summary">' +
      '<div class="day-stat"><span class="day-stat-num">' + fmtDuration(minutes) + '</span><span class="day-stat-label">学习时长</span></div>' +
      '<div class="day-stat"><span class="day-stat-num">' + questions + ' 题</span><span class="day-stat-label">刷题</span></div>' +
      '<div class="day-stat"><span class="day-stat-num">' + (acc === null ? '—' : acc + '%') + '</span><span class="day-stat-label">正确率</span></div>' +
      '<div class="day-stat"><span class="day-stat-num">' + recs.length + ' 条</span><span class="day-stat-label">记录</span></div>' +
      '</div>' +
      '<div class="record-list">' +
      (recs.length ? recs.map(function (r) { return recordItem(r, { actions: true, mistakeBtn: true }); }).join('')
        : emptyBlock('这一天还没有记录', '点击右上角「添加记录」，或用计时器记录学习', null, '')) +
      '</div></div>' +
      '</section>';

    $$('.cal-cell[data-date]', app).forEach(function (cell) {
      cell.addEventListener('click', function () {
        state.dailyDate = cell.getAttribute('data-date');
        renderDaily();
      });
    });
    $$('[data-month]', app).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var y = year;
        var m = month + Number(btn.getAttribute('data-month'));
        if (m < 1) { m = 12; y--; }
        if (m > 12) { m = 1; y++; }
        state.dailyMonth = y + '-' + Util.pad(m, 2);
        if (state.dailyDate.indexOf(state.dailyMonth) !== 0) {
          state.dailyDate = state.dailyMonth + '-01';
        }
        renderDaily();
      });
    });
    $('[data-add-record]', app).addEventListener('click', function () { openRecordModal(selDate); });
    $('[data-quick-mistake]', app).addEventListener('click', function () { openMistakeModal(null, { date: selDate }); });
    bindRecordActions();
  }

  /* ================= 模块学习 ================= */

  function renderModules() {
    var all = S.load();
    var overallAcc = S.accuracyOf(all.records);
    var summaries = S.moduleSummary();
    app.innerHTML =
      '<section class="page">' +
      '<div class="card"><div class="card-head"><h3>📚 模块学习总览</h3></div>' +
      '<div class="stats-grid">' +
      statCard('⏱️', '累计学习', fmtDuration(S.sumDuration(all.records)), '全部模块') +
      statCard('📝', '累计刷题', S.sumQuestions(all.records) + ' 题', '全部模块') +
      statCard('🎯', '总正确率', overallAcc === null ? '—' : overallAcc + '%', '全部模块') +
      statCard('📖', '错题总数', all.mistakes.length + ' 题', '待复习 ' + all.mistakes.filter(function (m) { return !m.mastered; }).length + ' 题') +
      '</div></div>' +
      '<div class="module-grid">' +
      S.MODULES.map(function (m) {
        var s = summaries.filter(function (x) { return x.module.id === m.id; })[0];
        return '<a class="module-card card" href="#/module/' + m.id + '">' +
          '<div class="module-card-head"><span class="module-ic">' + m.icon + '</span>' +
          '<div><div class="module-name">' + m.name + '</div><div class="module-group">' + m.group + '</div></div></div>' +
          '<div class="module-stats">' +
          '<div><span class="ms-num">' + fmtDuration(s.minutes) + '</span><span class="ms-label">累计时长</span></div>' +
          '<div><span class="ms-num">' + s.questions + ' 题</span><span class="ms-label">累计刷题</span></div>' +
          '<div><span class="ms-num">' + (s.accuracy === null ? '—' : s.accuracy + '%') + '</span><span class="ms-label">正确率</span></div>' +
          '<div><span class="ms-num">' + s.unmastered + ' 题</span><span class="ms-label">待复习错题</span></div>' +
          '</div>' +
          '<div class="module-tip">💡 ' + m.tip + '</div>' +
          '</a>';
      }).join('') +
      '</div>' +
      '</section>';
  }

  function renderModule(id) {
    var m = S.getModule(id);
    if (!m) { location.hash = '#/modules'; return; }
    var recs = S.recordsByModule(id).slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    var minutes = S.sumDuration(recs);
    var questions = S.sumQuestions(recs);
    var acc = S.accuracyOf(recs);
    var mis = S.mistakesByModule(id);
    var unmastered = mis.filter(function (x) { return !x.mastered; }).length;
    var series = S.seriesForLastNDays(14, function (key) {
      return S.sumDuration(S.recordsByDate(key).filter(function (r) { return r.moduleId === id; }));
    });
    var accSeries = S.seriesForLastNDays(14, function (key) {
      return S.accuracyOf(S.recordsByDate(key).filter(function (r) { return r.moduleId === id; }));
    });

    app.innerHTML =
      '<section class="page">' +
      '<div class="card module-hero">' +
      '<div class="module-hero-left">' +
      '<div class="module-hero-ic">' + m.icon + '</div>' +
      '<div><h2 style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' + m.name + '<span class="badge">' + m.group + '</span></h2>' +
      '<p class="module-desc">' + m.desc + '</p></div>' +
      '</div>' +
      '<div class="module-hero-tip">💡 学习建议：' + m.tip + '</div>' +
      '</div>' +

      '<div class="stats-grid">' +
      statCard('⏱️', '累计时长', fmtDuration(minutes), '本模块') +
      statCard('📝', '累计刷题', questions + ' 题', '本模块') +
      statCard('🎯', '正确率', acc === null ? '—' : acc + '%', '本模块') +
      statCard('📖', '错题', mis.length + ' 题', unmastered + ' 题待复习') +
      '</div>' +

      '<div class="grid-2">' +
      '<div class="card"><div class="card-head"><h3>📈 近 14 天时长</h3></div><div class="chart" id="modBar"></div></div>' +
      '<div class="card"><div class="card-head"><h3>🎯 近 14 天正确率</h3></div><div class="chart" id="modLine"></div></div>' +
      '</div>' +

      '<div class="card">' +
      '<div class="card-head"><h3>🕒 学习记录</h3>' +
      '<button class="btn btn-sm btn-danger-ghost" data-quick-mistake>📝 记错题</button>' +
      '<button class="btn btn-primary" data-add-record>＋ 添加记录</button></div>' +
      '<div class="record-list">' +
      (recs.length ? recs.map(function (r) { return recordItem(r, { showDate: true, actions: true, mistakeBtn: true }); }).join('')
        : emptyBlock('这个模块还没有记录', '开始你的第一段学习吧', null, '')) +
      '</div></div>' +
      '</section>';

    Charts.barChart($('#modBar'), {
      labels: series.map(function (s) { return S.parseKey(s.key).getDate() + '日'; }),
      values: series.map(function (s) { return s.value; }),
      suffix: '分',
      color: cssVar('--primary', '#5B6CF0')
    });
    Charts.lineChart($('#modLine'), {
      labels: accSeries.map(function (s) { return S.parseKey(s.key).getDate() + '日'; }),
      values: accSeries.map(function (s) { return s.value; }),
      suffix: '%',
      color: cssVar('--teal', '#2EC4B6')
    });
    $('[data-add-record]', app).addEventListener('click', function () { openRecordModal(S.todayKey(), id); });
    var qmBtn = $('[data-quick-mistake]', app);
    if (qmBtn) qmBtn.addEventListener('click', function () { openMistakeModal(null, { date: S.todayKey(), moduleId: id }); });
    bindRecordActions();
  }

  /* ================= 错题本 ================= */

  function renderMistakes() {
    var filterModule = state.params.module || 'all';
    var filterStatus = state.params.status || 'all';
    var q = (state.params.q || '').toLowerCase();
    var all = S.load();
    var list = all.mistakes.slice().sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
    if (filterModule !== 'all') list = list.filter(function (m) { return m.moduleId === filterModule; });
    if (filterStatus === 'un') list = list.filter(function (m) { return !m.mastered; });
    if (filterStatus === 'ok') list = list.filter(function (m) { return m.mastered; });
    if (q) {
      list = list.filter(function (m) {
        var mod = S.getModule(m.moduleId);
        return String(m.question + ' ' + m.knowledge + ' ' + m.analysis + ' ' + (mod ? mod.name : '')).toLowerCase().indexOf(q) !== -1;
      });
    }

    var todayMis = all.mistakes.filter(function (m) { return m.date === S.todayKey(); }).length;
    var hasFilter = filterModule !== 'all' || filterStatus !== 'all' || q;

    app.innerHTML =
      '<section class="page">' +
      '<div class="stats-grid">' +
      statCard('📖', '错题总数', all.mistakes.length + ' 题', '错题本') +
      statCard('🔴', '待复习', all.mistakes.filter(function (m) { return !m.mastered; }).length + ' 题', '需要定期回顾') +
      statCard('✅', '已掌握', all.mistakes.filter(function (m) { return m.mastered; }).length + ' 题', '继续保持') +
      statCard('🆕', '今日新增', todayMis + ' 题', '今日整理') +
      '</div>' +

      '<div class="card">' +
      '<div class="card-head"><h3>📝 错题本</h3>' +
      '<button class="btn btn-primary" data-add-mistake>＋ 添加错题</button></div>' +
      '<div class="filter-bar">' +
      '<select data-filter-module>' +
      '<option value="all">全部模块</option>' +
      S.MODULES.map(function (m) { return '<option value="' + m.id + '"' + (filterModule === m.id ? ' selected' : '') + '>' + m.group + '·' + m.name + '</option>'; }).join('') +
      '</select>' +
      '<select data-filter-status>' +
      '<option value="all">全部状态</option>' +
      '<option value="un"' + (filterStatus === 'un' ? ' selected' : '') + '>待复习</option>' +
      '<option value="ok"' + (filterStatus === 'ok' ? ' selected' : '') + '>已掌握</option>' +
      '</select>' +
      '<input class="search-input" data-search type="search" placeholder="🔍 搜索题目 / 知识点…" value="' + esc(state.params.q || '') + '">' +
      '</div>' +
      '<div class="mistake-list">' +
      (list.length ? list.map(mistakeCard).join('')
        : emptyBlock(hasFilter ? '没有找到符合条件的错题' : '还没有错题', hasFilter ? '换个筛选条件试试' : '添加一道错题开始整理吧', null, '')) +
      '</div></div>' +
      '</section>';

    $('[data-add-mistake]', app).addEventListener('click', function () { openMistakeModal(); });
    $('[data-filter-module]', app).addEventListener('change', function (e) { updateParams({ module: e.target.value }); });
    $('[data-filter-status]', app).addEventListener('change', function (e) { updateParams({ status: e.target.value }); });
    var searchTimer = null;
    $('[data-search]', app).addEventListener('input', function (e) {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { updateParams({ q: e.target.value }); }, 300);
    });
    bindMistakeActions();
  }

  /* ================= 统计 ================= */

  function renderStats() {
    var all = S.load();
    var recs = all.records;
    var series14 = S.seriesForLastNDays(14, function (key) { return S.sumDuration(S.recordsByDate(key)); });
    var seriesQ = S.seriesForLastNDays(14, function (key) { return S.sumQuestions(S.recordsByDate(key)); });
    var seriesAcc = S.seriesForLastNDays(14, function (key) { return S.accuracyOf(S.recordsByDate(key)); });
    var labels14 = series14.map(function (s) {
      var d = S.parseKey(s.key);
      return (d.getMonth() + 1) + '/' + d.getDate();
    });
    var mods = S.moduleSummary().sort(function (a, b) { return b.minutes - a.minutes; });
    var heat = S.seriesForLastNDays(84, function (key) { return S.sumDuration(S.recordsByDate(key)); });
    var daysActive = {};
    recs.forEach(function (r) { daysActive[r.date] = true; });

    app.innerHTML =
      '<section class="page">' +
      '<div class="stats-grid">' +
      statCard('🗓️', '累计学习天数', Object.keys(daysActive).length + ' 天', '有记录的天数') +
      statCard('⏱️', '累计时长', fmtDuration(S.sumDuration(recs)), '全部模块') +
      statCard('📝', '累计刷题', S.sumQuestions(recs) + ' 题', '全部模块') +
      statCard('📖', '错题总数', all.mistakes.length + ' 题', '待复习 ' + all.mistakes.filter(function (m) { return !m.mastered; }).length + ' 题') +
      '</div>' +

      '<div class="card"><div class="card-head"><h3>🔥 近 84 天打卡热力图</h3></div>' +
      '<div class="heat-scroll"><div id="heatmap"></div></div>' +
      '<div class="heat-legend"><span>少</span>' +
      '<div class="heat-cell" style="background:#EEF1F8"></div>' +
      '<div class="heat-cell" style="background:#DCE4FF"></div>' +
      '<div class="heat-cell" style="background:#B9C8FF"></div>' +
      '<div class="heat-cell" style="background:#8BA6FF"></div>' +
      '<div class="heat-cell" style="background:#5B6CF0"></div>' +
      '<span>多</span></div></div>' +

      '<div class="grid-2">' +
      '<div class="card"><div class="card-head"><h3>📈 近 14 天学习时长</h3></div><div class="chart" id="statBar"></div></div>' +
      '<div class="card"><div class="card-head"><h3>📝 近 14 天刷题量</h3></div><div class="chart" id="statBarQ"></div></div>' +
      '</div>' +

      '<div class="grid-2">' +
      '<div class="card"><div class="card-head"><h3>🥧 各模块累计时长占比</h3></div><div id="statDonut"></div></div>' +
      '<div class="card"><div class="card-head"><h3>🎯 各模块正确率对比</h3></div><div id="statAcc"></div></div>' +
      '</div>' +
      '</section>';

    Charts.heatmap($('#heatmap'), { days: heat.map(function (h) { return h.key; }), values: heat.map(function (h) { return h.value; }) });
    Charts.barChart($('#statBar'), { labels: labels14, values: series14.map(function (s) { return s.value; }), suffix: '分', color: cssVar('--primary', '#5B6CF0') });
    Charts.barChart($('#statBarQ'), { labels: labels14, values: seriesQ.map(function (s) { return s.value; }), suffix: '题', color: cssVar('--teal', '#2EC4B6') });
    Charts.donutChart($('#statDonut'), {
      labels: mods.map(function (m) { return m.module.name; }),
      values: mods.map(function (m) { return m.minutes; }),
      colors: PALETTE
    });
    Charts.hBarChart($('#statAcc'), {
      labels: mods.map(function (m) { return m.module.name; }),
      values: mods.map(function (m) { return m.accuracy; }),
      suffix: '%',
      color: '#A78BFA'
    });
  }


  /* ================= 每日任务 ================= */

  function countdownCard(label, dateKey, days) {
    var txt = '';
    if (!dateKey) {
      txt = '<div class="countdown-num">--</div><div class="countdown-date">未设置日期</div>';
    } else if (days > 0) {
      txt = '<div class="countdown-num">' + days + '<span class="countdown-unit">天</span></div>' +
        '<div class="countdown-date">' + fmtDateCN(dateKey) + ' 笔试</div>';
    } else if (days === 0) {
      txt = '<div class="countdown-num today">就是今天！</div><div class="countdown-date">' + fmtDateCN(dateKey) + ' 加油！</div>';
    } else {
      txt = '<div class="countdown-num done">已结束</div><div class="countdown-date">' + fmtDateCN(dateKey) + '</div>';
    }
    return '<a class="countdown-card card" href="#/settings">' +
      '<div class="countdown-label">' + label + '</div>' + txt +
      '<div class="countdown-tip">点击可修改考试日期</div>' +
      '</a>';
  }

  function taskItemDash(t) {
    return '<div class="task-item">' +
      '<span class="task-text">' + esc(t.text) + '</span>' +
      (t.remind ? '<span class="chip chip-time">⏰ ' + esc(t.remind) + '</span>' : '') +
      '<button class="btn btn-sm btn-ok" data-done-task="' + t.id + '">✅ 完成</button>' +
      '</div>';
  }

  function taskItemFull(t) {
    return '<div class="task-item">' +
      '<span class="task-text">' + esc(t.text) + '</span>' +
      (t.remind ? '<span class="chip chip-time">⏰ ' + esc(t.remind) + '</span>' : '') +
      '<div class="task-item-actions">' +
      '<button class="btn btn-sm btn-ok" data-done-task="' + t.id + '">✅ 完成</button>' +
      '<button class="btn btn-sm btn-danger-ghost" data-del-task="' + t.id + '">🗑️ 删除</button>' +
      '</div>' +
      '</div>';
  }

  function renderTasks() {
    var today = S.todayKey();
    var all = S.getTasks(today);
    var active = all.filter(function (t) { return !t.done; }).sort(function (a, b) { return (a.createdAt || '').localeCompare(b.createdAt || ''); });
    var done = all.filter(function (t) { return t.done; }).sort(function (a, b) { return (a.doneAt || '').localeCompare(b.doneAt || ''); });
    var stats = S.taskStats(today);

    app.innerHTML =
      '<section class="page">' +
      '<div class="stats-grid">' +
      statCard('✅', '今日任务', stats.total + ' 项', '待完成 ' + active.length + ' 项') +
      statCard('🎉', '今日已完成', stats.done + ' 项', '完成一项就去掉一项') +
      '</div>' +
      '<div class="card">' +
      '<div class="card-head"><h3>📝 ' + fmtDateFull(today) + ' 的任务清单</h3></div>' +
      '<div class="task-add-row"><input type="text" data-add-task placeholder="添加任务，如：行测 100 题 / 背 30 个成语" maxlength="60">' +
      '<input type="time" data-add-remind title="提醒时间（可选）">' +
      '<button class="btn btn-primary" data-add-task-btn>＋ 添加任务</button></div>' +
      '<div class="task-list">' +
      (active.length ? active.map(taskItemFull).join('')
        : emptyBlock('没有待办任务', stats.done ? '今天的任务都完成啦，真棒 🎉' : '添加一个今天想完成的任务吧', null, '')) +
      '</div>' +
      (done.length ? '<details class="task-done-list"><summary>已完成 ' + done.length + ' 项（点击展开）</summary>' +
        done.map(function (t) {
          return '<div class="task-item done"><span class="task-text">✅ ' + esc(t.text) + '</span>' +
            '<button class="btn btn-sm btn-danger-ghost" data-del-task="' + t.id + '">🗑️</button></div>';
        }).join('') +
        '</details>' : '') +
      '</div>' +
      '</section>';

    $('[data-add-task-btn]', app).addEventListener('click', addTaskFromInput);
    $('[data-add-task]', app).addEventListener('keydown', function (e) { if (e.key === 'Enter') addTaskFromInput(); });
    $$('[data-done-task]', app).forEach(function (btn) {
      btn.addEventListener('click', function () {
        S.completeTask(btn.getAttribute('data-done-task'));
        renderAll();
        var st = S.taskStats(today);
        if (st.total > 0 && st.done === st.total) showEncourage();
        toast('任务完成 ✅');
      });
    });
    $$('[data-del-task]', app).forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (confirmDialog('确定删除这个任务吗？')) {
          S.deleteTask(btn.getAttribute('data-del-task'));
          renderAll();
          toast('任务已删除');
        }
      });
    });

    function addTaskFromInput() {
      var txt = $('[data-add-task]', app).value;
      if (!String(txt).trim()) { toast('请输入任务内容', 'error'); return; }
      var rm = $('[data-add-remind]', app).value || '';
      S.addTask(txt, today, rm);
      if (rm) requestNotifyPermission();
      renderAll();
      toast(rm ? ('任务已添加，将在 ' + rm + ' 提醒 ⏰') : '任务已添加 ✅');
    }
  }

  /* ================= 健康生活（小红花） ================= */

  function habitIcon(name) {
    var map = { '健康饮食': '🥗', '按时睡觉': '🌙', '认真运动': '🏃', '努力学习': '📚', '多喝水': '💧', '保持好心情': '😊' };
    return map[name] || '🌸';
  }

  function renderHealth() {
    var today = S.todayKey();
    var habits = S.getHealthHabits();
    var tFlowers = S.flowersOn(today);
    var total = S.totalFlowers();
    var week = S.flowersSeries(7).reduce(function (s2, x) { return s2 + x.value; }, 0);
    var wall = S.flowersSeries(14);

    app.innerHTML =
      '<section class="page">' +
      '<div class="hero card health-hero">' +
      '<div class="hero-left"><h2>🌺 健康生活</h2>' +
      '<p>' + fmtDateFull(today) + ' · 好习惯带来好状态</p></div>' +
      '<div class="hero-right"><div class="streak-badge">今日 🌺×' + tFlowers + '</div></div>' +
      '</div>' +

      '<div class="stats-grid">' +
      statCard('🌺', '今日小红花', tFlowers + ' 朵', '完成一项得一朵') +
      statCard('🏆', '累计小红花', total + ' 朵', '坚持的见证') +
      statCard('📅', '近 7 天', week + ' 朵', '继续保持') +
      statCard('💪', '习惯项目', habits.length + ' 项', '可自行增删') +
      '</div>' +

      '<div class="card">' +
      '<div class="card-head"><h3>🌸 今日打卡</h3></div>' +
      '<div class="health-grid">' +
      habits.map(function (h) {
        var done = S.isHabitDone(h, today);
        return '<div class="habit-card' + (done ? ' done' : '') + '" data-toggle-habit="' + esc(h) + '">' +
          '<button class="habit-rm" data-del-habit="' + esc(h) + '" title="删除习惯">✕</button>' +
          '<span class="habit-ic">' + habitIcon(h) + '</span>' +
          '<span class="habit-name">' + esc(h) + '</span>' +
          '<span class="habit-state">' + (done ? '🌺 已打卡' : '点击打卡') + '</span>' +
          '</div>';
      }).join('') +
      '</div>' +
      (habits.length === 0 ? emptyBlock('还没有习惯项目', '下面可以添加，如：多喝水、不熬夜', null, '') : '') +
      '<div class="habit-manage-row">' +
      '<input type="text" data-add-habit placeholder="添加新习惯，如：多喝水" maxlength="20">' +
      '<button class="btn btn-primary" data-add-habit-btn>＋ 添加</button>' +
      '</div>' +
      '</div>' +

      '<div class="card">' +
      '<div class="card-head"><h3>🌷 近 14 天小红花墙</h3></div>' +
      '<div class="flower-wall">' +
      wall.map(function (w) {
        var fs = '';
        for (var i = 0; i < Math.min(w.value, 8); i++) fs += '🌺';
        if (w.value > 8) fs = '🌺×' + w.value;
        if (!fs) fs = '·';
        return '<div class="flower-day"><span class="flower-date">' + (S.parseKey(w.key).getMonth() + 1) + '/' + S.parseKey(w.key).getDate() + '</span><span class="flower-emojis">' + fs + '</span></div>';
      }).join('') +
      '</div>' +
      '<div class="flower-note">每天按时打卡，小红花会越来越多～</div>' +
      '</div>' +
      '</section>';

    $$('[data-toggle-habit]', app).forEach(function (box) {
      box.addEventListener('click', function (e) {
        if (e.target.getAttribute && e.target.getAttribute('data-del-habit')) return;
        var h = box.getAttribute('data-toggle-habit');
        if (S.isHabitDone(h, today)) {
          S.unlogHabit(h, today);
          renderAll();
          toast('已取消今日打卡');
        } else {
          S.logHabit(h, today);
          renderAll();
          toast('奖励一朵小红花 🌺');
        }
      });
    });
    $$('[data-del-habit]', app).forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var name = btn.getAttribute('data-del-habit');
        if (confirmDialog('删除习惯「' + name + '」？已得的小红花会保留。')) {
          S.removeHabit(name);
          renderAll();
          toast('习惯已删除');
        }
      });
    });
    $('[data-add-habit-btn]', app).addEventListener('click', function () {
      var name = $('[data-add-habit]', app).value;
      if (!String(name).trim()) { toast('请输入习惯名称', 'error'); return; }
      if (!S.addHabit(name)) { toast('该习惯已存在', 'error'); return; }
      renderAll();
      toast('习惯已添加 🌱');
    });
  }

  /* ================= 设置 ================= */

  function renderSettings() {
    var set = S.load().settings;
    app.innerHTML =
      '<section class="page">' +
      '<div class="card">' +
      '<div class="card-head"><h3>👤 个人设置</h3></div>' +
      '<div class="form-grid">' +
      field('你的昵称', '<input type="text" name="name" value="' + esc(set.name) + '" placeholder="例如：宁宁">') +
      field('每日学习时长目标（分钟）', '<input type="number" name="goalMinutes" min="1" step="10" value="' + set.goalMinutes + '">') +
      field('每日刷题目标（题）', '<input type="number" name="goalQuestions" min="1" step="5" value="' + set.goalQuestions + '">') +
      field('国考笔试日期（倒计时用）', '<input type="date" name="examGuokao" value="' + (set.examGuokao || '') + '">') +
      field('河南省考笔试日期（倒计时用）', '<input type="date" name="examHenan" value="' + (set.examHenan || '') + '">') +
      '</div>' +
      '<div class="modal-actions"><button class="btn btn-primary" data-save-settings>保存设置</button></div>' +
      '</div>' +

      '<div class="card">' +
      '<div class="card-head"><h3>🎨 主题</h3></div>' +
      '<div class="theme-grid">' +
      THEMES.map(function (t) {
        return '<div class="theme-item' + (set.theme === t.id ? ' active' : '') + '" data-theme-pick="' + t.id + '">' +
          '<span class="theme-check">' + (set.theme === t.id ? '✓' : '') + '</span>' +
          '<span class="theme-swatch" style="background:' + t.bg + ';border:1px solid ' + t.line + '"></span>' +
          '<span class="theme-name">' + t.icon + ' ' + t.name + '</span>' +
          '</div>';
      }).join('') +
      '</div>' +
      '</div>' +

      '<div class="card">' +
      '<div class="card-head"><h3>🌺 健康习惯管理</h3></div>' +
      '<div class="habit-manage-list">' +
      S.getHealthHabits().map(function (h) {
        return '<div class="habit-manage-item"><span>' + habitIcon(h) + ' ' + esc(h) + '</span>' +
          '<button class="btn btn-sm btn-danger-ghost" data-del-habit-set="' + esc(h) + '">删除</button></div>';
      }).join('') +
      '</div>' +
      '<div class="habit-manage-row"><input type="text" data-add-habit-set placeholder="添加新习惯" maxlength="20">' +
      '<button class="btn btn-primary" data-add-habit-set-btn>＋ 添加</button></div>' +
      '</div>' +

      '<div class="card">' +
      '<div class="card-head"><h3>💾 数据管理</h3></div>' +
      '<p class="muted">数据保存在当前浏览器的本地存储中，不会上传到任何服务器。建议定期导出备份，换设备时用导入恢复。</p>' +
      '<div class="btn-row">' +
      '<button class="btn" data-export>⬇️ 导出数据（JSON）</button>' +
      '<label class="btn file-btn">⬆️ 导入数据<input type="file" accept=".json,application/json" data-import hidden></label>' +
      '<button class="btn" data-sample>🎲 载入示例数据</button>' +
      '<button class="btn btn-danger" data-clear>🗑️ 清空全部数据</button>' +
      '</div>' +
      '</div>' +

      '<div class="card">' +
      '<div class="card-head"><h3>📖 使用小贴士</h3></div>' +
      '<ul class="tips">' +
      '<li>⏱️ 学习时点击右上角「开始计时」，结束时自动生成学习记录。</li>' +
      '<li>📅 「每日记录」页可以按日期查看每天做了什么，日历上的小圆点表示当天有打卡。</li>' +
      '<li>📝 做错的题及时记进「错题本」，定期复习并标记掌握。</li>' +
      '<li>📷 错题支持拍照/上传照片，照片存在浏览器本地；导出 JSON 只包含文字不包含照片。</li>' +
      '<li>💾 数据只存在浏览器里，换设备记得导出 / 导入。</li>' +
      '</ul>' +
      '</div>' +
      '</section>';

    $('[data-save-settings]', app).addEventListener('click', function () {
      var d = S.load();
      d.settings.name = $('[name=name]', app).value.trim() || '宁宁';
      d.settings.goalMinutes = Math.max(1, Number($('[name=goalMinutes]', app).value) || 120);
      d.settings.goalQuestions = Math.max(1, Number($('[name=goalQuestions]', app).value) || 100);
      d.settings.examGuokao = $('[name=examGuokao]', app).value || '';
      d.settings.examHenan = $('[name=examHenan]', app).value || '';
      S.save();
      renderSidebar();
      renderPageTitle();
      toast('设置已保存 ✅');
    });
    $$('[data-theme-pick]', app).forEach(function (item) {
      item.addEventListener('click', function () {
        var d = S.load();
        d.settings.theme = item.getAttribute('data-theme-pick');
        S.save();
        applyTheme(d.settings.theme);
        renderAll();
        toast('主题已切换 🎨');
      });
    });
    $('[data-add-habit-set-btn]', app).addEventListener('click', function () {
      var name = $('[data-add-habit-set]', app).value;
      if (!String(name).trim()) { toast('请输入习惯名称', 'error'); return; }
      if (!S.addHabit(name)) { toast('该习惯已存在', 'error'); return; }
      renderAll();
      toast('习惯已添加 🌱');
    });
    $$('[data-del-habit-set]', app).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var name = btn.getAttribute('data-del-habit-set');
        if (confirmDialog('删除习惯「' + name + '」？')) {
          S.removeHabit(name);
          renderAll();
          toast('习惯已删除');
        }
      });
    });
    $('[data-export]', app).addEventListener('click', exportData);
    $('[data-import]', app).addEventListener('change', function (e) {
      var f = e.target.files[0];
      if (f) importData(f);
      e.target.value = '';
    });
    $('[data-sample]', app).addEventListener('click', function () {
      if (!confirmDialog('载入示例数据会覆盖当前数据，确定吗？')) return;
      S.clearAll();
      S.loadSample();
      renderAll();
      toast('示例数据已载入 🎲');
    });
    $('[data-clear]', app).addEventListener('click', function () {
      if (!confirmDialog('确定要清空所有数据吗？此操作不可恢复！')) return;
      S.clearAll();
      renderAll();
      toast('已清空所有数据');
    });
  }

  function exportData() {
    var blob = new Blob([S.exportJSON()], { type: 'application/json' });
    var url = (window.URL || window.webkitURL).createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'ningning-workbench-backup-' + S.todayKey() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    (window.URL || window.webkitURL).revokeObjectURL(url);
    toast('已导出备份文件 ⬇️');
  }

  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        S.importJSON(reader.result);
        renderAll();
        toast('数据导入成功 🎉');
      } catch (err) {
        toast('导入失败：' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  /* ================= 计时器 ================= */

  function currentElapsedMs() {
    return state.timer.accumulatedMs + (state.timer.running ? Date.now() - state.timer.startTs : 0);
  }

  function fmtClock(ms) {
    var total = Math.floor(ms / 1000);
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    function p(n) { return Util.pad(n, 2); }
    return (h > 0 ? p(h) + ':' : '') + p(m) + ':' + p(s);
  }

  var timerClockEl = null;

  function renderTimerPop() {
    var pop = document.getElementById('timerPop');
    var btn = document.getElementById('timerBtn');
    if (!state.timer.moduleId) {
      pop.hidden = true;
      btn.textContent = '⏱️ 开始计时';
      timerClockEl = null;
      return;
    }
    pop.hidden = false;
    btn.textContent = '⏱️ 学习中…';
    var mod = S.getModule(state.timer.moduleId);
    if (!timerClockEl || pop.getAttribute('data-module') !== state.timer.moduleId) {
      pop.setAttribute('data-module', state.timer.moduleId);
      pop.innerHTML =
        '<div class="timer-pop-head">' +
        '<span>' + (mod ? mod.icon + ' ' + esc(mod.name) : '⏱️ 学习') + '</span>' +
        '<span class="timer-clock">' + fmtClock(currentElapsedMs()) + '</span>' +
        '</div>' +
        '<div class="timer-pop-actions">' +
        '<button class="btn btn-sm btn-ghost" data-pause>' + (state.timer.paused ? '▶️ 继续' : '⏸️ 暂停') + '</button>' +
        '<button class="btn btn-sm btn-primary" data-finish>✅ 完成</button>' +
        '</div>';
      timerClockEl = $('.timer-clock', pop);
      $('[data-pause]', pop).addEventListener('click', function () {
        if (state.timer.paused) {
          state.timer.startTs = Date.now();
          state.timer.running = true;
          state.timer.paused = false;
          startTicking();
        } else {
          state.timer.accumulatedMs += Date.now() - state.timer.startTs;
          state.timer.running = false;
          state.timer.paused = true;
          if (state.timer.tick) clearInterval(state.timer.tick);
          state.timer.tick = null;
        }
        S.saveTimerSession(timerSession());
        renderTimerPop();
      });
      $('[data-finish]', pop).addEventListener('click', finishTimer);
    }
    if (timerClockEl) timerClockEl.textContent = fmtClock(currentElapsedMs());
    var pauseBtn = pop.querySelector('[data-pause]');
    if (pauseBtn) pauseBtn.textContent = state.timer.paused ? '▶️ 继续' : '⏸️ 暂停';
  }

  function timerSession() {
    return {
      running: state.timer.running,
      paused: state.timer.paused,
      moduleId: state.timer.moduleId,
      startTs: state.timer.startTs,
      accumulatedMs: state.timer.accumulatedMs
    };
  }

  function startTicking() {
    if (state.timer.tick) clearInterval(state.timer.tick);
    state.timer.tick = setInterval(function () { renderTimerPop(); }, 1000);
    renderTimerPop();
  }

  function openTimerStartModal() {
    openModal({
      title: '⏱️ 开始计时',
      body:
        '<p class="muted">选择本次要学习的模块，开始专注吧～</p>' +
        field('模块', '<select name="moduleId">' + moduleOptions('') + '</select>') +
        '<div class="modal-actions"><button class="btn" type="button" data-cancel>取消</button>' +
        '<button class="btn btn-primary" type="button" data-submit>开始学习 🚀</button></div>',
      onOpen: function (bd) {
        $('[data-cancel]', bd).addEventListener('click', closeModal);
        $('[data-submit]', bd).addEventListener('click', function () {
          var mid = $('[name=moduleId]', bd).value;
          state.timer.moduleId = mid;
          state.timer.startTs = Date.now();
          state.timer.accumulatedMs = 0;
          state.timer.running = true;
          state.timer.paused = false;
          closeModal();
          S.saveTimerSession(timerSession());
          startTicking();
          toast('开始学习 ' + S.getModule(mid).name + ' 💪');
        });
      }
    });
  }

  function finishTimer() {
    var minutes = Math.max(1, Math.round(currentElapsedMs() / 60000));
    var mid = state.timer.moduleId;
    stopTimer();
    openModal({
      title: '🎉 完成本次学习',
      body:
        '<p class="muted">本次学习了 ' + fmtDuration(minutes) + '，补充一下刷题情况吧：</p>' +
        '<div class="form-grid">' +
        field('日期', '<input type="date" name="date" value="' + S.todayKey() + '">') +
        field('模块', '<select name="moduleId">' + moduleOptions(mid) + '</select>') +
        field('学习时长（分钟）', '<input type="number" name="durationMin" min="1" value="' + minutes + '">') +
        field('刷题数', '<input type="number" name="questionCount" min="0" placeholder="如 20">') +
        field('做对题数', '<input type="number" name="correctCount" min="0" placeholder="可留空">') +
        field('学习内容 / 备注', '<textarea name="note" rows="2" placeholder="例如：资料分析限时训练"></textarea>') +
        '</div>' +
        '<div class="modal-actions"><button class="btn" type="button" data-cancel>放弃</button>' +
        '<button class="btn btn-primary" type="button" data-submit>保存记录 💾</button></div>',
      onOpen: function (bd) {
        $('[data-cancel]', bd).addEventListener('click', closeModal);
        $('[data-submit]', bd).addEventListener('click', function () {
          S.addRecord(valuesFromModal(bd));
          closeModal();
          renderAll();
          toast('记录已保存 🎉');
        });
      }
    });
  }

  function stopTimer() {
    state.timer.running = false;
    state.timer.paused = false;
    state.timer.accumulatedMs = 0;
    state.timer.startTs = 0;
    state.timer.moduleId = '';
    if (state.timer.tick) clearInterval(state.timer.tick);
    state.timer.tick = null;
    S.clearTimerSession();
    renderTimerPop();
  }

  function initTimer() {
    var btn = document.getElementById('timerBtn');
    btn.addEventListener('click', function () {
      if (state.timer.moduleId) {
        renderTimerPop();
      } else {
        openTimerStartModal();
      }
    });
    var saved = S.loadTimerSession();
    if (saved && saved.moduleId) {
      state.timer.moduleId = saved.moduleId;
      state.timer.accumulatedMs = saved.accumulatedMs || 0;
      state.timer.startTs = saved.startTs || 0;
      state.timer.running = !!saved.running;
      state.timer.paused = !saved.running;
      if (state.timer.running) startTicking(); else renderTimerPop();
    }
  }

  /* ================= 路由 ================= */

  var routeMeta = {
    dashboard: '工作台',
    daily: '每日记录',
    tasks: '每日任务',
    health: '健康生活',
    modules: '模块学习',
    mistakes: '错题本',
    stats: '统计',
    settings: '设置'
  };

  function parseQuery(str) {
    var params = {};
    if (!str) return params;
    var pairs = String(str).split('&');
    for (var i = 0; i < pairs.length; i++) {
      if (!pairs[i]) continue;
      var eq = pairs[i].indexOf('=');
      var k = eq >= 0 ? decodeURIComponent(pairs[i].slice(0, eq)) : decodeURIComponent(pairs[i]);
      var v = eq >= 0 ? decodeURIComponent(pairs[i].slice(eq + 1)) : '';
      params[k] = v;
    }
    return params;
  }

  function serializeQuery(obj) {
    var parts = [];
    for (var k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      var v = obj[k];
      if (v === undefined || v === null || v === '') continue;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    }
    return parts.join('&');
  }

  function parseHash() {
    var h = location.hash.replace(/^#\/?/, '');
    var qIndex = h.indexOf('?');
    var pathPart = qIndex >= 0 ? h.slice(0, qIndex) : h;
    var queryPart = qIndex >= 0 ? h.slice(qIndex + 1) : '';
    var segs = pathPart.split('/').filter(Boolean);
    var params = parseQuery(queryPart);
    var route = segs[0] || 'dashboard';
    if (route === 'module' && segs[1]) params.id = decodeURIComponent(segs[1]);
    if (!routeMeta[route] && route !== 'module') route = 'dashboard';
    return { route: route, params: params };
  }

  function updateParams(patch) {
    var merged = Util.extend({}, state.params, patch);
    var q = serializeQuery(merged);
    location.hash = '#/' + state.route + (q ? '?' + q : '');
  }

  function router() {
    var parsed = parseHash();
    state.route = parsed.route;
    state.params = parsed.params;
    renderSidebar();
    renderPageTitle();
    if (parsed.route === 'dashboard') renderDashboard();
    else if (parsed.route === 'daily') renderDaily();
    else if (parsed.route === 'tasks') renderTasks();
    else if (parsed.route === 'health') renderHealth();
    else if (parsed.route === 'modules') renderModules();
    else if (parsed.route === 'module') renderModule(parsed.params.id);
    else if (parsed.route === 'mistakes') renderMistakes();
    else if (parsed.route === 'stats') renderStats();
    else if (parsed.route === 'settings') renderSettings();
    window.scrollTo(0, 0);
  }

  /* ================= 侧边栏 ================= */

  function renderSidebar() {
    var nav = document.getElementById('moduleNav');
    var grouped = {};
    S.MODULES.forEach(function (m) {
      (grouped[m.group] = grouped[m.group] || []).push(m);
    });
    var html = '';
    Object.keys(grouped).forEach(function (g) {
      html += '<div class="nav-group-label">' + g + '</div>';
      html += grouped[g].map(function (m) {
        return '<a class="nav-item nav-module" href="#/module/' + m.id + '" data-route="module" data-id="' + m.id + '">' +
          '<span class="nav-ic">' + m.icon + '</span>' + m.name + '</a>';
      }).join('');
    });
    nav.innerHTML = html;

    $$('.nav-item').forEach(function (item) {
      var r = item.getAttribute('data-route');
      if (!r) return;
      var active = r === state.route;
      if (r === 'module') active = state.route === 'module' && item.getAttribute('data-id') === state.params.id;
      if (active) { item.classList.add('active'); } else { item.classList.remove('active'); }
    });

    renderGoalWidget();
  }

  function renderGoalWidget() {
    var gw = document.getElementById('goalWidget');
    var set = S.load().settings;
    var tRecs = S.recordsByDate(S.todayKey());
    var minutes = S.sumDuration(tRecs);
    var questions = S.sumQuestions(tRecs);
    var pMin = Math.min(100, Math.round((minutes / Math.max(set.goalMinutes, 1)) * 100));
    var pQ = Math.min(100, Math.round((questions / Math.max(set.goalQuestions, 1)) * 100));
    var allDone = minutes >= set.goalMinutes && questions >= set.goalQuestions;
    gw.innerHTML =
      '<div class="goal-card">' +
      '<div class="goal-card-title">🎯 今日目标' + (allDone ? ' · 达成 🎉' : '') + '</div>' +
      '<div class="goal-line"><span>学习时长</span><span>' + minutes + '/' + set.goalMinutes + ' 分钟</span></div>' +
      '<div class="progress"><div class="progress-fill" style="width:' + pMin + '%;background:' + cssVar('--primary', '#5B6CF0') + '"></div></div>' +
      '<div class="goal-line"><span>刷题</span><span>' + questions + '/' + set.goalQuestions + ' 题</span></div>' +
      '<div class="progress"><div class="progress-fill" style="width:' + pQ + '%;background:' + cssVar('--teal', '#2EC4B6') + '"></div></div>' +
      '</div>';
  }

  function renderPageTitle() {
    var t = document.getElementById('pageTitle');
    if (state.route === 'module') {
      var m = S.getModule(state.params.id);
      t.textContent = m ? m.icon + ' ' + m.name : '模块详情';
    } else {
      t.textContent = (routeMeta[state.route] || '') + ' · 宁宁的考公工作台';
    }
  }

  function renderAll() {
    document.getElementById('todayChip').textContent = fmtDateFull(S.todayKey());
    router();
  }

  /* ================= 初始化 ================= */

  function init() {
    S.load();
    initTimer();
    applyTheme(S.load().settings.theme || 'default');
    document.getElementById('reminderBarClose').addEventListener('click', function () {
      document.getElementById('reminderBar').hidden = true;
    });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && state.timer.moduleId) renderTimerPop();
    });
    setInterval(checkReminders, 20000);
    checkReminders();

    document.getElementById('celebrateBtn').addEventListener('click', function () {
      document.getElementById('celebrate').hidden = true;
    });
    document.getElementById('modalBackdrop').addEventListener('click', function (e) {
      if (e.target === document.getElementById('modalBackdrop')) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });
    window.addEventListener('hashchange', router);

    var resizeTimer = null;
    var lastViewportW = window.innerWidth;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        var w = window.innerWidth;
        if (Math.abs(w - lastViewportW) < 24) return;
        lastViewportW = w;
        router();
      }, 400);
    });

    renderAll();
  }

  init();
})();
