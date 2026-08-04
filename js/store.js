/* ============================================================
 * 宁宁的考公工作台 - 数据层
 * 所有数据保存在浏览器 localStorage 中，仅存于本机。
 * ============================================================ */
(function (global) {
  'use strict';

  /* 兼容旧浏览器的小工具 */
  var Util = {
    pad: function (n, len) {
      var s = String(n);
      len = len || 2;
      while (s.length < len) s = '0' + s;
      return s;
    },
    extend: function (target) {
      for (var i = 1; i < arguments.length; i++) {
        var src = arguments[i];
        if (!src) continue;
        for (var k in src) {
          if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
        }
      }
      return target;
    },
    findBy: function (arr, pred) {
      for (var i = 0; i < arr.length; i++) {
        if (pred(arr[i], i)) return arr[i];
      }
      return null;
    }
  };

  var KEY = 'ningning_workbench_v1';
  var SESSION_TIMER_KEY = 'ningning_workbench_timer';

  /* 考公题型模块定义：行测 5 大模块 + 申论 5 大题型 */
  var MODULES = [
    { group: '行测', id: 'changshi', name: '常识判断', icon: '🧠', desc: '政治、法律、经济、人文、科技等综合知识，重在日积月累。', tip: '每天碎片时间积累 15 分钟，重点看时政热点与高频考点。' },
    { group: '行测', id: 'yanyu', name: '言语理解与表达', icon: '💬', desc: '逻辑填空、片段阅读、语句表达，考语感与逻辑。', tip: '每天 20 题限时训练，错题整理成语辨析与实词搭配。' },
    { group: '行测', id: 'shuliang', name: '数量关系', icon: '🔢', desc: '数学运算，高频题型：工程、行程、排列组合、经济利润。', tip: '先掌握高频题型与公式，每天 10 题，整理专属公式本。' },
    { group: '行测', id: 'panduan', name: '判断推理', icon: '🧩', desc: '图形推理、定义判断、类比推理、逻辑判断。', tip: '图推每天 10 题练感觉，逻辑判断整理推理规则与常见陷阱。' },
    { group: '行测', id: 'ziliao', name: '资料分析', icon: '📊', desc: '增长率、比重、平均数等，重点是速算与公式。', tip: '每天 2 篇资料分析限时 20 分钟，熟记公式并练习速算。' },
    { group: '申论', id: 'sl-gn', name: '归纳概括', icon: '✍️', desc: '从材料中提取要点，做到概括准确、全面、有条理。', tip: '每周精练 2-3 道小题，严格限时并对照参考答案复盘。' },
    { group: '申论', id: 'sl-zh', name: '综合分析', icon: '🧐', desc: '分析评价材料中的观点、问题与现象。', tip: '掌握"是什么—为什么—怎么办"的分析框架。' },
    { group: '申论', id: 'sl-cd', name: '提出对策', icon: '💡', desc: '针对材料中的问题提出具体可行的对策。', tip: '对策要有针对性、可行性，注意身份限定与字数要求。' },
    { group: '申论', id: 'sl-gcz', name: '贯彻执行', icon: '📋', desc: '公文写作：通知、报告、倡议书、讲话稿等。', tip: '熟记常见公文格式，每周练 1 篇应用文。' },
    { group: '申论', id: 'sl-wz', name: '文章写作', icon: '🖋️', desc: '大作文，考查立意、结构、论证与语言表达。', tip: '每周写 1 篇大作文，积累素材，重视开头结尾。' }
  ];

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function pad2(n) { return Util.pad(n, 2); }

  function toDateKey(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function todayKey() { return toDateKey(new Date()); }

  function parseKey(key) {
    var parts = String(key).split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function addDays(key, n) {
    var d = parseKey(key);
    d.setDate(d.getDate() + n);
    return toDateKey(d);
  }

  function weekdayCN(key) {
    var w = parseKey(key).getDay();
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][w];
  }

  function defaultData() {
    return {
      version: 1,
      settings: { name: '宁宁', goalMinutes: 120, goalQuestions: 100, examGuokao: '2026-11-28', examHenan: '2027-03-13', theme: 'default' },
      records: [],
      mistakes: [],
      dailyTasks: [],
      healthLog: [],
      healthHabits: ['健康饮食', '按时睡觉', '认真运动', '努力学习', '多喝水', '保持好心情'],
      createdAt: new Date().toISOString()
    };
  }

  var data = null;
  var listeners = [];

  function load() {
    if (data) return data;
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        data = Util.extend(defaultData(), parsed);
        data.settings = Util.extend(defaultData().settings, parsed.settings || {});
      } else {
        data = defaultData();
        save();
      }
    } catch (e) {
      data = defaultData();
    }
    return data;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('保存失败', e);
    }
    listeners.forEach(function (fn) { fn(); });
  }

  function onChange(fn) { listeners.push(fn); }

  /* ---------------- 学习记录 ---------------- */
  function addRecord(opts) {
    var rec = {
      id: uid(),
      date: opts.date || todayKey(),
      moduleId: opts.moduleId,
      durationMin: Math.max(0, Number(opts.durationMin) || 0),
      questionCount: Math.max(0, Number(opts.questionCount) || 0),
      correctCount: Math.max(0, Number(opts.correctCount) || 0),
      note: String(opts.note || '').trim(),
      createdAt: new Date().toISOString()
    };
    data.records.push(rec);
    save();
    return rec;
  }

  function deleteRecord(id) {
    data.records = data.records.filter(function (r) { return r.id !== id; });
    save();
  }

  function updateRecord(id, patch) {
    var r = Util.findBy(data.records, function (x) { return x.id === id; });
    if (r) Util.extend(r, patch);
    save();
  }

  /* ---------------- 错题 ---------------- */
  function addMistake(m) {
    var item = {
      id: uid(),
      date: m.date || todayKey(),
      moduleId: m.moduleId,
      question: String(m.question || '').trim(),
      myAnswer: String(m.myAnswer || '').trim(),
      correctAnswer: String(m.correctAnswer || '').trim(),
      knowledge: String(m.knowledge || '').trim(),
      analysis: String(m.analysis || '').trim(),
      mastered: !!m.mastered,
      img: m.img ? 1 : 0,
      img: m.img ? 1 : 0,
      createdAt: new Date().toISOString()
    };
    data.mistakes.push(item);
    save();
    return item;
  }

  function updateMistake(id, patch) {
    var m = Util.findBy(data.mistakes, function (x) { return x.id === id; });
    if (m) Util.extend(m, patch);
    save();
  }

  function deleteMistake(id) {
    data.mistakes = data.mistakes.filter(function (m) { return m.id !== id; });
    save();
  }

  /* ---------------- 查询与统计 ---------------- */
  function getModule(id) {
    for (var i = 0; i < MODULES.length; i++) {
      if (MODULES[i].id === id) return MODULES[i];
    }
    return null;
  }

  function recordsByDate(key) {
    return data.records.filter(function (r) { return r.date === key; });
  }

  function recordsByModule(id) {
    return data.records.filter(function (r) { return r.moduleId === id; });
  }

  function mistakesByModule(id) {
    return id ? data.mistakes.filter(function (m) { return m.moduleId === id; }) : data.mistakes.slice();
  }

  function sumDuration(records) { return records.reduce(function (s, r) { return s + (r.durationMin || 0); }, 0); }
  function sumQuestions(records) { return records.reduce(function (s, r) { return s + (r.questionCount || 0); }, 0); }
  function sumCorrect(records) { return records.reduce(function (s, r) { return s + (r.correctCount || 0); }, 0); }

  function accuracyOf(records) {
    var q = sumQuestions(records);
    var c = sumCorrect(records);
    if (q <= 0) return null;
    return Math.round((c / q) * 1000) / 10;
  }

  function daysWithData() {
    return data.records.reduce(function (map, r) {
      map[r.date] = (map[r.date] || 0) + (r.durationMin || 0);
      return map;
    }, {});
  }

  function streakDays() {
    var streak = 0;
    var d = todayKey();
    var map = daysWithData();
    while (map[d]) {
      streak++;
      d = addDays(d, -1);
    }
    return streak;
  }

  function seriesForLastNDays(n, fn) {
    var out = [];
    var today = todayKey();
    for (var i = n - 1; i >= 0; i--) {
      var key = addDays(today, -i);
      out.push({ key: key, value: fn(key) });
    }
    return out;
  }

  function moduleSummary() {
    return MODULES.map(function (m) {
      var recs = recordsByModule(m.id);
      var mis = mistakesByModule(m.id);
      return {
        module: m,
        records: recs,
        minutes: sumDuration(recs),
        questions: sumQuestions(recs),
        accuracy: accuracyOf(recs),
        mistakes: mis.length,
        unmastered: mis.filter(function (x) { return !x.mastered; }).length
      };
    });
  }


  /* ---------------- 每日任务 ---------------- */
  function getTasks(date) {
    return data.dailyTasks.filter(function (t) { return t.date === date; });
  }

  function addTask(text, date, remind) {
    var t = {
      id: uid(),
      date: date || todayKey(),
      text: String(text).trim(),
      remind: String(remind || '').trim(),
      reminded: false,
      done: false,
      createdAt: new Date().toISOString()
    };
    if (!t.text) return null;
    data.dailyTasks.push(t);
    save();
    return t;
  }

  function markReminded(id) {
    var t = Util.findBy(data.dailyTasks, function (x) { return x.id === id; });
    if (t) { t.reminded = true; save(); }
  }

  function completeTask(id) {
    var t = Util.findBy(data.dailyTasks, function (x) { return x.id === id; });
    if (t && !t.done) {
      t.done = true;
      t.doneAt = new Date().toISOString();
      save();
    }
  }

  function deleteTask(id) {
    data.dailyTasks = data.dailyTasks.filter(function (t) { return t.id !== id; });
    save();
  }

  function taskStats(date) {
    var list = getTasks(date);
    return { total: list.length, done: list.filter(function (t) { return t.done; }).length };
  }

  /* ---------------- 健康生活（小红花） ---------------- */
  function getHealthHabits() {
    return data.healthHabits.slice();
  }

  function addHabit(name) {
    name = String(name).trim();
    if (!name) return false;
    if (data.healthHabits.indexOf(name) !== -1) return false;
    data.healthHabits.push(name);
    save();
    return true;
  }

  function removeHabit(name) {
    var i = data.healthHabits.indexOf(name);
    if (i === -1) return;
    data.healthHabits.splice(i, 1);
    data.healthLog = data.healthLog.filter(function (h) { return h.habit !== name; });
    save();
  }

  function isHabitDone(habit, date) {
    var d = date || todayKey();
    return Util.findBy(data.healthLog, function (h) { return h.habit === habit && h.date === d; }) ? true : false;
  }

  function logHabit(habit, date) {
    var d = date || todayKey();
    if (isHabitDone(habit, d)) return;
    data.healthLog.push({ id: uid(), date: d, habit: habit, doneAt: new Date().toISOString() });
    save();
  }

  function unlogHabit(habit, date) {
    var d = date || todayKey();
    data.healthLog = data.healthLog.filter(function (h) { return !(h.habit === habit && h.date === d); });
    save();
  }

  function flowersOn(date) {
    return data.healthLog.filter(function (h) { return h.date === date; }).length;
  }

  function totalFlowers() {
    return data.healthLog.length;
  }

  function flowersSeries(n) {
    return seriesForLastNDays(n, function (key) { return flowersOn(key); });
  }

  function daysUntil(key) {
    if (!key) return null;
    var t = new Date();
    t.setHours(0, 0, 0, 0);
    var d = parseKey(key);
    d.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - t.getTime()) / 86400000);
  }

  /* ---------------- 导入导出 ---------------- */
  function exportJSON() {
    return JSON.stringify(data, null, 2);
  }

  function importJSON(text) {
    var parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.records) || !Array.isArray(parsed.mistakes)) {
      throw new Error('数据格式不正确');
    }
    data = Util.extend(defaultData(), parsed);
    data.settings = Util.extend(defaultData().settings, parsed.settings || {});
    save();
  }

  /* ---------------- 示例数据 ---------------- */
  function loadSample() {
    var t = todayKey();
    function d(n) { return addDays(t, -n); }

    [
      { date: d(6), moduleId: 'yanyu', durationMin: 45, questionCount: 25, correctCount: 19, note: '逻辑填空专项训练' },
      { date: d(6), moduleId: 'ziliao', durationMin: 30, questionCount: 15, correctCount: 12, note: '两篇资料分析限时' },
      { date: d(5), moduleId: 'panduan', durationMin: 40, questionCount: 20, correctCount: 16, note: '图形推理 + 逻辑判断' },
      { date: d(5), moduleId: 'changshi', durationMin: 15, questionCount: 20, correctCount: 12, note: '时政热点积累' },
      { date: d(4), moduleId: 'shuliang', durationMin: 35, questionCount: 12, correctCount: 8, note: '工程问题 + 行程问题' },
      { date: d(4), moduleId: 'sl-gn', durationMin: 50, questionCount: 4, correctCount: 3, note: '归纳概括小题精练' },
      { date: d(3), moduleId: 'yanyu', durationMin: 40, questionCount: 22, correctCount: 17, note: '片段阅读限时' },
      { date: d(3), moduleId: 'ziliao', durationMin: 25, questionCount: 15, correctCount: 13, note: '比重与平均数练习' },
      { date: d(2), moduleId: 'panduan', durationMin: 35, questionCount: 18, correctCount: 14, note: '定义判断专项' },
      { date: d(2), moduleId: 'changshi', durationMin: 15, questionCount: 20, correctCount: 13, note: '法律常识积累' },
      { date: d(1), moduleId: 'shuliang', durationMin: 30, questionCount: 10, correctCount: 7, note: '经济利润 + 排列组合' },
      { date: d(1), moduleId: 'sl-wz', durationMin: 60, questionCount: 1, correctCount: 1, note: '大作文：民生主题' },
      { date: t, moduleId: 'yanyu', durationMin: 40, questionCount: 20, correctCount: 16, note: '逻辑填空 + 语句排序' },
      { date: t, moduleId: 'ziliao', durationMin: 20, questionCount: 12, correctCount: 10, note: '一篇资料分析限时' }
    ].forEach(function (r) { addRecord(r); });

    [
      {
        date: d(2), moduleId: 'yanyu',
        question: '随着人工智能技术的发展，越来越多的传统岗位正在被机器________，这提醒我们要不断提升自身能力。',
        myAnswer: '替代', correctAnswer: '取代', knowledge: '词语辨析',
        analysis: '"取代"侧重以新代旧、使原有的失去作用，与"岗位"搭配更贴切；"替代"多用于抽象或具体事物之间的互换。',
        mastered: false
      },
      {
        date: d(3), moduleId: 'panduan',
        question: '从所给的四个选项中，选择最合适的一个填入问号处，使之呈现一定的规律性。（图形略）',
        myAnswer: 'B', correctAnswer: 'D', knowledge: '对称性',
        analysis: '题干图形均为轴对称图形，且对称轴依次顺时针旋转 45°，问号处应为竖直对称图形。',
        mastered: false
      },
      {
        date: d(4), moduleId: 'shuliang',
        question: '一项工程，甲单独做需 20 天，乙单独做需 30 天。现甲乙合作，中途甲休息了 2 天，则完成工程共需多少天？',
        myAnswer: '13 天', correctAnswer: '14 天', knowledge: '工程问题',
        analysis: '设共需 x 天，则甲工作 (x-2) 天、乙工作 x 天，列方程 (x-2)/20 + x/30 = 1，解得 x = 13.2，天数向上取整为 14 天。',
        mastered: false
      },
      {
        date: d(1), moduleId: 'ziliao',
        question: '某企业 2025 年销售额为 1200 万元，同比增长 20%，则 2024 年销售额为多少万元？',
        myAnswer: '960', correctAnswer: '1000', knowledge: '基期量计算',
        analysis: '基期量 = 现期量 ÷ (1 + 增长率) = 1200 ÷ 1.2 = 1000 万元。',
        mastered: true
      },
      {
        date: d(5), moduleId: 'changshi',
        question: '下列不属于我国四大名著的是：A.《西游记》 B.《聊斋志异》 C.《三国演义》 D.《红楼梦》',
        myAnswer: 'C', correctAnswer: 'B', knowledge: '文学常识',
        analysis: '四大名著为《西游记》《三国演义》《水浒传》《红楼梦》；《聊斋志异》是清代蒲松龄的文言短篇小说集。',
        mastered: false
      },
      {
        date: d(2), moduleId: 'sl-gn',
        question: '根据"给定资料 1"，概括 S 市在优化营商环境方面的主要做法。（要求：全面、准确、有条理）',
        myAnswer: '简化审批流程、落实减税降费。',
        correctAnswer: '① 推行"一网通办"，压缩审批时限；② 落实减税降费政策；③ 建立政企沟通机制；④ 完善法治保障；⑤ 加强人才引进服务。',
        knowledge: '要点提炼',
        analysis: '概括题要点要全面，尽量分条作答，注意字数与条理性；平时训练要逐段圈画关键词。',
        mastered: false
      }
    ].forEach(function (m) { addMistake(m); });

    addTask('完成言语 20 题', t);
    addTask('背 30 个成语', t);
    var sampleTasks = data.dailyTasks;
    if (sampleTasks.length) completeTask(sampleTasks[0].id);
    logHabit('健康饮食', t);
    logHabit('按时睡觉', t);
    logHabit('认真运动', d(1));
  }

  function clearAll() {
    data = defaultData();
    save();
  }


  /* ---------------- 错题照片（IndexedDB 存储） ---------------- */
  var IMG_DB = 'ningning_workbench_img_v1';
  var IMG_STORE = 'images';
  var imgDb = null;

  function openImgDb(cb) {
    if (imgDb) { cb(null, imgDb); return; }
    if (!window.indexedDB) { cb(new Error('浏览器不支持 IndexedDB')); return; }
    try {
      var req = window.indexedDB.open(IMG_DB, 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(IMG_STORE)) {
          req.result.createObjectStore(IMG_STORE);
        }
      };
      req.onsuccess = function () { imgDb = req.result; cb(null, imgDb); };
      req.onerror = function () { cb(req.error); };
    } catch (e) { cb(e); }
  }

  function putImage(id, blob, cb) {
    openImgDb(function (err, db) {
      if (err) { if (cb) cb(err); return; }
      var tx = db.transaction(IMG_STORE, 'readwrite');
      tx.objectStore(IMG_STORE).put(blob, id);
      tx.oncomplete = function () { if (cb) cb(null); };
      tx.onerror = function () { if (cb) cb(tx.error); };
    });
  }

  function getImage(id, cb) {
    openImgDb(function (err, db) {
      if (err) { if (cb) cb(err); return; }
      var tx = db.transaction(IMG_STORE, 'readonly');
      var req = tx.objectStore(IMG_STORE).get(id);
      req.onsuccess = function () { if (cb) cb(null, req.result); };
      req.onerror = function () { if (cb) cb(req.error); };
    });
  }

  function deleteImage(id, cb) {
    openImgDb(function (err, db) {
      if (err) { if (cb) cb(err); return; }
      var tx = db.transaction(IMG_STORE, 'readwrite');
      tx.objectStore(IMG_STORE).delete(id);
      tx.oncomplete = function () { if (cb) cb(null); };
      tx.onerror = function () { if (cb) cb(tx.error); };
    });
  }


  /* ---------------- 错题照片（IndexedDB 存储） ---------------- */
  var IMG_DB = 'ningning_workbench_img_v1';
  var IMG_STORE = 'images';
  var imgDb = null;

  function openImgDb(cb) {
    if (imgDb) { cb(null, imgDb); return; }
    if (!window.indexedDB) { cb(new Error('浏览器不支持 IndexedDB')); return; }
    try {
      var req = window.indexedDB.open(IMG_DB, 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(IMG_STORE)) {
          req.result.createObjectStore(IMG_STORE);
        }
      };
      req.onsuccess = function () { imgDb = req.result; cb(null, imgDb); };
      req.onerror = function () { cb(req.error); };
    } catch (e) { cb(e); }
  }

  function putImage(id, blob, cb) {
    openImgDb(function (err, db) {
      if (err) { if (cb) cb(err); return; }
      var tx = db.transaction(IMG_STORE, 'readwrite');
      tx.objectStore(IMG_STORE).put(blob, id);
      tx.oncomplete = function () { if (cb) cb(null); };
      tx.onerror = function () { if (cb) cb(tx.error); };
    });
  }

  function getImage(id, cb) {
    openImgDb(function (err, db) {
      if (err) { if (cb) cb(err); return; }
      var tx = db.transaction(IMG_STORE, 'readonly');
      var req = tx.objectStore(IMG_STORE).get(id);
      req.onsuccess = function () { if (cb) cb(null, req.result); };
      req.onerror = function () { if (cb) cb(req.error); };
    });
  }

  function deleteImage(id, cb) {
    openImgDb(function (err, db) {
      if (err) { if (cb) cb(err); return; }
      var tx = db.transaction(IMG_STORE, 'readwrite');
      tx.objectStore(IMG_STORE).delete(id);
      tx.oncomplete = function () { if (cb) cb(null); };
      tx.onerror = function () { if (cb) cb(tx.error); };
    });
  }

  /* ---------------- 计时器会话（刷新页面后恢复） ---------------- */
  function saveTimerSession(session) {
    try { sessionStorage.setItem(SESSION_TIMER_KEY, JSON.stringify(session)); } catch (e) {}
  }
  function loadTimerSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_TIMER_KEY) || 'null'); } catch (e) { return null; }
  }
  function clearTimerSession() {
    try { sessionStorage.removeItem(SESSION_TIMER_KEY); } catch (e) {}
  }

  global.Util = Util;

  global.Store = {
    MODULES: MODULES,
    load: load,
    save: save,
    onChange: onChange,
    todayKey: todayKey,
    addDays: addDays,
    parseKey: parseKey,
    toDateKey: toDateKey,
    weekdayCN: weekdayCN,
    getModule: getModule,
    addRecord: addRecord,
    deleteRecord: deleteRecord,
    updateRecord: updateRecord,
    addMistake: addMistake,
    updateMistake: updateMistake,
    deleteMistake: deleteMistake,
    recordsByDate: recordsByDate,
    recordsByModule: recordsByModule,
    mistakesByModule: mistakesByModule,
    sumDuration: sumDuration,
    sumQuestions: sumQuestions,
    sumCorrect: sumCorrect,
    accuracyOf: accuracyOf,
    daysWithData: daysWithData,
    streakDays: streakDays,
    seriesForLastNDays: seriesForLastNDays,
    getTasks: getTasks,
    addTask: addTask,
    completeTask: completeTask,
    deleteTask: deleteTask,
    markReminded: markReminded,
    taskStats: taskStats,
    getHealthHabits: getHealthHabits,
    addHabit: addHabit,
    removeHabit: removeHabit,
    isHabitDone: isHabitDone,
    logHabit: logHabit,
    unlogHabit: unlogHabit,
    flowersOn: flowersOn,
    totalFlowers: totalFlowers,
    flowersSeries: flowersSeries,
    daysUntil: daysUntil,
    moduleSummary: moduleSummary,
    exportJSON: exportJSON,
    importJSON: importJSON,
    loadSample: loadSample,
    clearAll: clearAll,
    saveTimerSession: saveTimerSession,
    loadTimerSession: loadTimerSession,
    putImage: putImage,
    getImage: getImage,
    deleteImage: deleteImage,
    putImage: putImage,
    getImage: getImage,
    deleteImage: deleteImage,
    clearTimerSession: clearTimerSession
  };
})(window);