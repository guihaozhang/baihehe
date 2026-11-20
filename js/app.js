/* 拜贺贺 · 照生拜 - 应用逻辑 */
(function () {
  'use strict';

  var DATA = window.CSDATA;
  var LUNAR = window.Lunar || (window.lunar && window.lunar.Lunar);
  var SOLAR = window.Solar || (window.lunar && window.lunar.Solar);
  var LUNAR_MONTH = window.LunarMonth || (window.lunar && window.lunar.LunarMonth);

  // ===== 配图映射：地区小图 / 节日头图（非大节回退通用图）=====
  var REGION_ART = {
    shantou: 'assets/region-shantou.jpg', chaozhou: 'assets/region-chaozhou.jpg',
    jieyang: 'assets/region-jieyang.jpg', chaoyang: 'assets/region-chaoyang.jpg',
    chenghai: 'assets/region-chenghai.jpg', puning: 'assets/region-puning.jpg',
    other: 'assets/region-other.jpg'
  };
  var FEST_ART = {
    chunjie: 'assets/fest-chunjie.jpg', qingming: 'assets/fest-qingming.jpg',
    zhongyuan: 'assets/fest-zhongyuan.jpg', zhongqiu: 'assets/fest-zhongqiu.jpg',
    dongzhi: 'assets/fest-dongzhi.jpg', chuxi: 'assets/fest-chuxi.jpg'
  };
  function regionArt(id) { return REGION_ART[id] || ''; }
  function festArt(id) { return FEST_ART[id] || 'assets/detail-offering.jpg'; }
  // 图片加载失败时隐藏，避免碎图；onerror 内联，兼容动态 innerHTML
  function imgTag(src, cls, alt) {
    if (!src) return '';
    return '<img class="' + (cls || '') + '" src="' + src + '" alt="' + (alt || '') +
      '" onerror="this.style.display=\'none\'">';
  }

  // 吉祥物分场景：先用专属小狮图，没放进 assets 时自动回退主小狮，不会开天窗
  var LION = {
    main:  'assets/mascot-lion.jpg',
    rest:  'assets/mascot-lion-rest.jpg',   // 今天不用拜 / 轻松一下
    note:  'assets/mascot-lion-note.jpg',   // 我家拜法入口 / 总览
    blank: 'assets/mascot-lion-blank.jpg'   // 还没记录
  };
  function lionImg(key, cls, alt) {
    var src = LION[key] || LION.main;
    var fb = 'this.onerror=null;this.src=&#39;' + LION.main + '&#39;';
    return '<img class="' + (cls || '') + '" src="' + src + '" alt="' + (alt || '') +
      '" onerror="' + fb + '">';
  }

  var STORE_KEY = 'csbai_v1';
  var state = {
    region: 'shantou',
    overseas: false,
    checked: {},
    viewDate: null,
    tab: 'today',
    detailId: null,
    remindOn: false,
    remindDays: 0,
    myFamily: {},   // 我家拜法：按节点 id 存 { deities, changes, add, elderSay }（本节点规则）
    familyDefaults: {}, // 三级默认：all / regular / festival，各存一份规则，自动继承
    familyName: '', // 家族称呼，如「林家」
    onboarded: false, // 是否已完成首次地区引导
    prayer: { gender: 'female', married: '' } // 念词自称：性别 + 婚否（婚否空=未选）
  };

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      if (s.region) state.region = s.region;
      if (typeof s.overseas === 'boolean') state.overseas = s.overseas;
      if (s.checked) state.checked = s.checked;
      if (typeof s.remindOn === 'boolean') state.remindOn = s.remindOn;
      if (typeof s.remindDays === 'number') state.remindDays = s.remindDays;
      if (s.myFamily) state.myFamily = s.myFamily;
      if (s.familyDefaults) state.familyDefaults = s.familyDefaults;
      if (typeof s.familyName === 'string') state.familyName = s.familyName;
      if (typeof s.onboarded === 'boolean') state.onboarded = s.onboarded;
      if (s.prayer && typeof s.prayer === 'object') {
        if (s.prayer.gender === 'male' || s.prayer.gender === 'female') state.prayer.gender = s.prayer.gender;
        state.prayer.married = (s.prayer.married === 'yes' || s.prayer.married === 'no') ? s.prayer.married : '';
      }
    } catch (e) {}
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        region: state.region, overseas: state.overseas, checked: state.checked,
        remindOn: state.remindOn, remindDays: state.remindDays,
        myFamily: state.myFamily, familyDefaults: state.familyDefaults,
        familyName: state.familyName,
        onboarded: state.onboarded,
        prayer: state.prayer
      }));
    } catch (e) {}
  }

  function lunarInfo(date) {
    var solar = SOLAR.fromDate(date);
    var lunar = solar.getLunar();
    var festivals = lunar.getFestivals() || [];
    return {
      date: date,
      solar: solar,
      lunar: lunar,
      lunarMonth: lunar.getMonth(),
      lunarDay: lunar.getDay(),
      monthCn: lunar.getMonthInChinese(),
      dayCn: lunar.getDayInChinese(),
      yearCn: lunar.getYearInChinese(),
      shengxiao: lunar.getYearShengXiao(),
      jieqi: lunar.getJieQi() || '',
      festivals: festivals,
      weekCn: ['日','一','二','三','四','五','六'][date.getDay()],
      iso: date.getFullYear() + '-' + pad(date.getMonth()+1) + '-' + pad(date.getDate())
    };
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function isLastLunarDay(info) {
    try {
      var lm = LUNAR_MONTH.fromYm(info.lunar.getYear(), info.lunarMonth);
      var days = lm.getDayCount();
      return info.lunarDay === days || info.lunarDay === -1;
    } catch (e) {
      return info.lunarDay < 0;
    }
  }

  function matchWhen(w, info) {
    if (w.type === 'lunarLastDay') {
      // 除夕只能是腊月最后一天；不写 month 才是「任意月末」（现已无节点使用）
      if (w.month != null && info.lunarMonth !== w.month) return false;
      return isLastLunarDay(info);
    }
    if (w.type === 'solarTerm') return info.jieqi === w.name;
    if (w.type === 'lunar') {
      if (w.day != null && info.lunarDay !== w.day) return false;
      if (w.month != null && info.lunarMonth !== w.month && !(w.month < 0 && info.lunarMonth < 0)) return false;
      return true;
    }
    return false;
  }

  function matchOccasion(occ, info) {
    return (occ.when || []).some(function (w) { return matchWhen(w, info); });
  }

  function regionAllows(occ, region) {
    if (!occ.regions || occ.regions.length === 0) return true;
    return occ.regions.indexOf(region) >= 0 || region === 'other';
  }

  function getEventsForDate(date, region) {
    var info = lunarInfo(date);
    var events = DATA.occasions.filter(function (o) {
      return matchOccasion(o, info) && regionAllows(o, region || state.region);
    });
    events.sort(function (a, b) { return (b.level || 1) - (a.level || 1); });
    return { info: info, events: events };
  }

  function nextEvent(date, region) {
    for (var i = 1; i <= 70; i++) {
      var d = new Date(date.getTime());
      d.setDate(d.getDate() + i);
      var r = getEventsForDate(d, region);
      if (r.events.length) return { days: i, date: d, events: r.events, info: r.info };
    }
    return null;
  }

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  function levelName(level) {
    return level >= 3 ? '大节' : (level === 2 ? '神诞/重要' : '常规');
  }

  // ===== 首次进入：地区引导 =====
  function renderOnboard() {
    var list = el('onboardRegions');
    // 主地区（把「其他/海外」单独拿出来做成底部醒目入口）
    var mains = DATA.regions.filter(function (r) { return r.id !== 'other'; });
    list.innerHTML = mains.map(function (r) {
      return '<button class="onboard-region" onclick="App.onboardPick(\'' + r.id + '\')">' +
        imgTag(regionArt(r.id), 'onboard-region-art', r.name) +
        '<span class="onboard-region-txt">' +
        '<span class="onboard-region-name">' + esc(r.name) + '</span>' +
        '<span class="onboard-region-tag">' + esc((r.tags || [])[0] || r.note) + '</span>' +
        '</span></button>';
    }).join('');
  }
  function showOnboard() {
    renderOnboard();
    el('onboard').style.display = 'flex';
  }
  function finishOnboard() {
    state.onboarded = true;
    save();
    el('onboard').style.display = 'none';
    renderHeader();
    renderToday();
    renderCalendar();
    renderGuide();
    var dl = window.__deepLink || {};
    if (window.__openDeepLink && (dl.detail || dl.share || dl.persona)) window.__openDeepLink(dl.detail, dl.share, dl.persona);
    else showView('today');
  }

  function renderHeader() {
    var region = DATA.regions.find(function (r) { return r.id === state.region; });
    el('regionLabel').textContent = region ? region.name : '汕头';
    el('overseasChip').style.display = state.overseas ? 'inline-block' : 'none';
  }

  function renderToday() {
    var now = new Date();
    var result = getEventsForDate(now, state.region);
    var info = result.info;
    var events = result.events;

    el('todayDate').textContent = (info.solar.getMonth()) + '月' + info.solar.getDay() + '日 · 周' + info.weekCn;
    el('lunarDate').textContent = '农历' + info.monthCn + '月' + info.dayCn + (info.jieqi ? ' · ' + info.jieqi : '');

    var nx = nextEvent(now, state.region);
    el('nextEvent').textContent = nx
      ? '距「' + nx.events[0].name + '」还有 ' + nx.days + ' 天'
      : '未来一月暂无记录节点';

    // 结论条：3 秒回答"今天拜不拜、拜谁"
    var verdict = el('verdict');
    var allSoft = events.length > 0 && events.every(function (e) { return e.soft; });
    if (allSoft) {
      // 「初三/初四」等各地说法：不当成家家户户必拜，避免被长辈一句「我们家没这样」推翻信任
      var softNames = events.slice(0, 2).map(function (e) { return e.name; }).join('、');
      verdict.className = 'verdict soft';
      verdict.innerHTML = '<div class="verdict-ico">' + lionImg('rest') + '</div><div class="verdict-body">' +
        '<div class="verdict-main">今天有民间说法 · 非必拜</div>' +
        '<div class="verdict-sub">' + esc(softNames) + ' · 各地习惯不同，以长辈说法为准</div>' +
        '</div>';
    } else if (events.length) {
      var names = events.slice(0, 2).map(function (e) { return e.name; }).join('、');
      var who = [];
      events.slice(0, 1).forEach(function (occ) {
        // 我家拜法覆盖结论条的"拜谁"（含三级继承）
        var famDeity = getFamilyFor(occ).deities;
        if (famDeity) {
          who.push(famDeity);
        } else {
          (occ.deities || []).slice(0, 2).forEach(function (id) {
            var d = DATA.deities.find(function (x) { return x.id === id; });
            if (d) who.push(d.name);
          });
        }
      });
      verdict.className = 'verdict yes';
      verdict.innerHTML = '<div class="verdict-ico">' + lionImg('main') + '</div><div class="verdict-body">' +
        '<div class="verdict-main">今天要拜 · ' + esc(names) + '</div>' +
        '<div class="verdict-sub">拜：' + esc(who.join('、') || '按家族惯例') + ' · 往下看买什么、怎么拜</div>' +
        '</div>';
    } else {
      var nextTxt = nx ? ('下次「' + nx.events[0].name + '」在 ' + nx.days + ' 天后') : '近期没有固定节点';
      verdict.className = 'verdict no';
      verdict.innerHTML = '<div class="verdict-ico">' + lionImg('rest') + '</div><div class="verdict-body">' +
        '<div class="verdict-main">今天不用拜</div>' +
        '<div class="verdict-sub">' + esc(nextTxt) + '，初一十五照常有常规祭拜</div>' +
        '</div>';
    }

    // 我家拜法入口描述（三级默认 + 节点规则都算）
    var defCount = ['all', 'regular', 'festival'].filter(function (k) {
      var f = state.familyDefaults[k];
      return f && (f.deities || f.changes || f.add || f.elderSay);
    }).length;
    var nodeCount = Object.keys(state.myFamily).filter(function (k) {
      var f = state.myFamily[k];
      return f && (f.deities || f.changes || f.add || f.elderSay);
    }).length;
    var totalRules = defCount + nodeCount;
    el('familyEntryDesc').textContent = totalRules
      ? ('已记下 ' + totalRules + ' 条自家拜法 · 点开查看/导出')
      : '记一句长辈的说法，往后自动照自家的办';

    var box = el('todayCards');
    if (!events.length) {
      box.innerHTML = '<div class="empty-state">' +
        lionImg('rest', 'empty-art') +
        '<div class="empty-title">今天轻松一下</div>' +
        '<div class="empty-desc">没有固定节点。初一十五照常有常规祭拜，点「查日历」看看整月安排。</div>' +
        '</div>';
      return;
    }

    var html = '';
    events.forEach(function (occ) {
      var famDeity = getFamilyFor(occ).deities;
      var deityNames = famDeity ? famDeity : (occ.deities || []).map(function (id) {
        var d = DATA.deities.find(function (x) { return x.id === id; });
        return d ? (d.name + (d.alias ? '（' + d.alias.split('、')[0] + '）' : '')) : id;
      }).join('、');
      html +=
        '<div class="occ-card" onclick="App.openDetail(\'' + occ.id + '\')">' +
        '  <div class="occ-top">' +
        '    <span class="occ-badge lv' + occ.level + '">' + esc(levelName(occ.level)) + '</span>' +
        '    <span class="occ-arrow">查看 →</span>' +
        '  </div>' +
        '  <div class="occ-name">' + esc(occ.name) + '</div>' +
        '  <div class="occ-deity">今日该拜：' + esc(deityNames || '按家族惯例') + '</div>' +
        '  <div class="occ-summary">' + esc(occ.summary) + '</div>' +
        '  <div class="occ-foot">' +
        '    <span class="occ-cta">买什么 / 怎么拜 →</span>' +
        '  </div>' +
        '</div>';
    });
    box.innerHTML = html;
  }

  function renderCalendar() {
    var date = state.viewDate || new Date();
    var y = date.getFullYear(), m = date.getMonth();
    el('calTitle').textContent = y + '年 ' + (m+1) + '月';

    var first = new Date(y, m, 1);
    var startDow = first.getDay();
    var days = new Date(y, m+1, 0).getDate();
    var today = new Date();

    var html = '<div class="cal-grid">';
    ['日','一','二','三','四','五','六'].forEach(function (w) {
      html += '<div class="cal-dow">' + w + '</div>';
    });
    for (var i = 0; i < startDow; i++) html += '<div class="cal-cell empty"></div>';
    for (var d = 1; d <= days; d++) {
      var cur = new Date(y, m, d);
      var r = getEventsForDate(cur, state.region);
      var isToday = cur.toDateString() === today.toDateString();
      var lv = r.events.length ? Math.max.apply(null, r.events.map(function(e){return e.level||1;})) : 0;
      var cls = 'cal-cell' + (isToday ? ' today' : '') + (lv >= 3 ? ' has-big' : (lv ? ' has-ev' : ''));
      html += '<div class="' + cls + '" onclick="App.pickDay(' + y + ',' + m + ',' + d + ')">' +
        '<div class="cal-num">' + d + '</div>' +
        (r.events.length ? '<div class="cal-dot">·</div>' : '') +
        '</div>';
    }
    html += '</div>';
    el('calHolder').innerHTML = html;

    var picked = state.pickedDate || today;
    var pr = getEventsForDate(picked, state.region);
    el('calDetail').innerHTML =
      '<div class="cal-detail-head">' +
      '  <div><div class="cal-detail-date">' + (picked.getMonth()+1) + '月' + picked.getDate() + '日</div>' +
      '  <div class="cal-detail-lunar">农历' + pr.info.monthCn + '月' + pr.info.dayCn + (pr.info.jieqi ? ' · ' + pr.info.jieqi : '') + '</div></div>' +
      '</div>' +
      (pr.events.length
        ? pr.events.map(function (occ) {
            return '<div class="cal-ev" onclick="App.openDetail(\'' + occ.id + '\')">' +
              '<span class="cal-ev-name">' + esc(occ.name) + '</span>' +
              '<span class="cal-ev-lv">Lv.' + occ.level + '</span></div>';
          }).join('')
        : '<div class="cal-no-ev">今日无记录节点</div>');
  }

  function renderGuide() {
    var box = el('guideList');
    var cats = [
      { key: 'sheng', title: '供品图鉴 · 三牲五果粿' },
      { key: 'taboo', title: '禁忌与讲究' },
      { key: 'overseas', title: '海外版 · 买不到怎么办' }
    ];
    var html = '';
    cats.forEach(function (c) {
      html += '<div class="section-title">' + c.title + '</div>';
      if (c.key === 'sheng') {
        Object.keys(DATA.offeringLibrary).forEach(function (k) {
          var lib = DATA.offeringLibrary[k];
          html += '<div class="guide-card">' +
            '<div class="guide-icon">' + lib.icon + '</div>' +
            '<div class="guide-body"><div class="guide-name">' + esc(lib.name) + '</div>' +
            '<div class="guide-items">' + lib.items.map(esc).join(' · ') + '</div>' +
            '<div class="guide-rules">' + lib.rules.map(function(r){return '· ' + esc(r);}).join('<br>') + '</div>' +
            '</div></div>';
        });
      } else if (c.key === 'taboo') {
        DATA.taboos.forEach(function (t) {
          html += '<div class="guide-row"><div class="guide-row-t">' + esc(t.t) + '</div>' +
            '<div class="guide-row-d">' + esc(t.d) + '</div></div>';
        });
      } else {
        DATA.overseas.forEach(function (o) {
          html += '<div class="guide-row"><div class="guide-row-t">' + esc(o.problem) + '</div>' +
            '<div class="guide-row-d">' + esc(o.solution) + '</div></div>';
        });
      }
    });
    box.innerHTML = html;
  }

  // 点选芯片：从本节点清单里提取常见供品项，避免用户手打
  function buildOfferChips(occ) {
    var items = [];
    Object.keys(occ.shopping || {}).forEach(function (g) {
      (occ.shopping[g] || []).forEach(function (it) {
        // 取括号前的短名，去掉过长描述
        var short = String(it).split(/[（(]/)[0].trim();
        if (short.length && short.length <= 8 && items.indexOf(short) < 0) items.push(short);
      });
    });
    var common = ['发粿', '卤鹅', '面线', '甜汤', '纸钱'];
    common.forEach(function (c) { if (items.indexOf(c) < 0) items.push(c); });
    var chips = items.slice(0, 12).map(function (it) {
      return '<button type="button" class="pick-chip minus" onclick="App.pickChip(\'famChanges\',\'' + esc(it).replace(/'/g, "\\'") + '\',this)">− ' + esc(it) + '</button>';
    }).join('');
    var adds = ['面线', '甜汤', '发粿', '水果'].map(function (it) {
      return '<button type="button" class="pick-chip plus" onclick="App.pickChip(\'famAdd\',\'' + esc(it).replace(/'/g, "\\'") + '\',this)">+ ' + esc(it) + '</button>';
    }).join('');
    return { remove: chips, add: adds };
  }

  function deityChips(current) {
    var ids = ['tiangong', 'dizhu', 'zuxian', 'boyi', 'mazu', 'gongpo'];
    var cur = current || '';
    return ids.map(function (id) {
      var d = DATA.deities.find(function (x) { return x.id === id; });
      if (!d) return '';
      var on = cur.indexOf(d.name) >= 0;
      return '<button type="button" class="pick-chip' + (on ? ' on' : '') + '" onclick="App.toggleDeityChip(this,\'' + esc(d.name).replace(/'/g, "\\'") + '\')">' + esc(d.name) + '</button>';
    }).join('');
  }

  // 念词自称：按性别+婚否取民俗口传称谓（各地不同，卡片已注明以长辈为准）
  function prayerSelfTitle() {
    var g = state.prayer.gender, m = state.prayer.married;
    var list = DATA.prayerGuide.selfTitles;
    if (m) {
      var suffix = (m === 'yes') ? 'married' : 'single';
      var hit = list.find(function (x) { return x.key === g + '-' + suffix; });
      if (hit) return hit.title;
    }
    return '（先选未婚 / 已婚）';
  }

  // 生成念词：神明保贺 + 日期 + 自称姓名 + 报供品来意 + 心意（民俗礼仪，不写许愿求应）
  function buildPrayerText(occ) {
    var d = state.viewDate || new Date();
    var info = lunarInfo(d);
    var deity = getFamilyFor(occ).deities || (occ.deities || []).map(function (id) {
      var x = DATA.deities.find(function (o) { return o.id === id; });
      return x ? x.name : '';
    }).filter(Boolean).join('、') || '众神';
    // 神明名目太多或含多位，日常统称「众神」
    if (deity.length > 8 || deity.indexOf('、') >= 0) deity = '众神';
    var groups = getFilteredGroups(occ);
    var items = [];
    Object.keys(groups).forEach(function (g) { items = items.concat(groups[g]); });
    // 念词要照着念，去掉括号里的讲究注释，只留干净的供品名
    var offer = items.slice(0, 4).map(function (it) {
      return it.replace(/（[^）]*）/g, '').trim();
    }).join('、') || '几样供品';
    var head = deity + '保贺，今日是农历' + info.monthCn + '月' + info.dayCn + '日，' +
      prayerSelfTitle() + '（自己姓名），来念心，办了' + offer + '来存敬念心。';
    return head + '\n（再把想讲的话讲一句，心意到就好。）';
  }

  // 念词卡局部刷新：更新文本 + chip 选中态
  function refreshPrayerCard() {
    var occ = DATA.occasions.find(function (o) { return o.id === state.detailId; });
    if (!occ) return;
    var t = el('prayerText');
    if (t) t.textContent = buildPrayerText(occ);
    var card = t && t.closest('.prayer-card');
    if (card) {
      card.querySelectorAll('.prayer-chip').forEach(function (b) {
        var fn = b.getAttribute('onclick') || '';
        var on = (fn.indexOf("'male'") >= 0 && state.prayer.gender === 'male') ||
          (fn.indexOf("'female'") >= 0 && state.prayer.gender === 'female') ||
          (fn.indexOf("'no'") >= 0 && state.prayer.married === 'no') ||
          (fn.indexOf("'yes'") >= 0 && state.prayer.married === 'yes');
        b.classList.toggle('on', !!on);
      });
    }
  }

  function renderDetail(occId) {
    var occ = DATA.occasions.find(function (o) { return o.id === occId; });
    if (!occ) return;
    state.detailId = occId;

    var fam = getFamilyFor(occ);
    var hasFamily = fam.has;
    var famLabel = state.familyName ? esc(state.familyName) + '家' : '我家';
    var deityNames = (occ.deities || []).map(function (id) {
      var d = DATA.deities.find(function (x) { return x.id === id; });
      return d ? d.name : id;
    }).join('、');
    // 我家拜谁会真正覆盖"拜："这一行（记忆驱动操作）
    var displayDeity = fam.deities || deityNames || '按家族惯例';

    var steps = occ.steps;
    if (typeof steps === 'string' && DATA.stepTemplates[steps]) steps = DATA.stepTemplates[steps];
    if (!Array.isArray(steps)) steps = [];

    var html =
      '<div class="detail-hero">' +
      imgTag(festArt(occ.id), 'detail-cover', occ.name) +
      '  <div class="detail-hero-body">' +
      '  <div class="detail-badge lv' + occ.level + '">' + esc(levelName(occ.level)) + '</div>' +
      '  <div class="detail-name">' + esc(occ.name) + '</div>' +
      '  <div class="detail-deity">拜：' + esc(displayDeity) + '</div>' +
      '  <div class="detail-summary">' + esc(occ.summary) + '</div>' +
      '  </div>' +
      '</div>';

    // 我家拜法覆盖提示——记忆权的核心呈现（不是便利贴，下面清单会据此过滤）
    if (hasFamily) {
      html += '<div class="family-banner">' +
        '<div class="family-banner-t">' + famLabel + '拜法 · 清单已按这个调整</div>';
      if (fam.deities) html += '<div>拜：' + esc(fam.deities) + '</div>';
      if (fam.changes) html += '<div>供品增减：' + esc(fam.changes) + '</div>';
      if (fam.elderSay) html += '<div class="family-elder">长辈原话：「' + esc(fam.elderSay) + '」</div>';
      html += '</div>';
    }

    // 购物清单：一次列全，可省的项直接打标，不再切换版本
    html += '<div class="section-row"><div class="section-title inline">买什么 · 购物清单</div></div>' +
      '<div class="compare-intro" style="margin:-4px 16px 12px">清单已列全。标「可省」的按自家情况和条件来就好，不必每样都备。</div>';
    html += '<div class="check-device-note">勾选只记在你自己的手机上，方便买东西时对照。要给全家分工，用下面的「家族分工卡」发群里接龙。</div>';
    if (state.overseas) {
      html += '<div class="overseas-tip">' +
        imgTag('assets/overseas-worship.jpg', 'overseas-art', '海外拜拜') +
        '<div class="overseas-tip-body"><b>海外版提示</b><br>' +
        DATA.overseas.map(function(o){return '· ' + esc(o.problem) + '：' + esc(o.solution);}).join('<br>') + '</div></div>';
    }
    // 清单（含我家拜法增减），一次列全
    var groups = getFilteredGroups(occ);
    Object.keys(groups).forEach(function (g) {
      var optionalGroup = /进阶|讲究|升级/.test(g);
      html += '<div class="shop-group"><div class="shop-group-t">' + esc(g) +
        (optionalGroup ? '<span class="opt-tag">可省</span>' : '') + '</div>';
      groups[g].forEach(function (item, idx) {
        var key = occ.id + '_' + item;
        var checked = !!state.checked[key];
        var opt = optionalGroup || isOptionalItem(item);
        html += '<label class="shop-item' + (checked ? ' checked' : '') + '" onclick="App.toggleItem(event,\'' + esc(key).replace(/'/g,"\\'") + '\')">' +
          '<span class="shop-check">' + (checked ? '✓' : '') + '</span>' +
          '<span class="shop-item-text">' + esc(item) +
          (opt ? ' <em class="opt-tag" title="条件不允许可省，心意到就行">可省</em>' : '') + '</span></label>';
      });
      html += '</div>';
    });

    // 操作按钮：家族分工卡 + 分享链接
    html += '<div class="action-row">' +
      '<button class="action-btn" onclick="App.openShare()">生成家族分工卡</button>' +
      '<button class="action-btn ghost" onclick="App.shareLink()">转发这篇指南</button>' +
      '</div>';

    // 为什么层（降级到步骤之后，作为了解性内容）
    html += '<div class="section-title">怎么拜 · 步骤</div>';
    html += '<div class="steps">';
    steps.forEach(function (s, i) {
      html += '<div class="step"><div class="step-num">' + (i+1) + '</div>' +
        '<div class="step-body"><div class="step-t">' + esc(s.t) + '</div>' +
        '<div class="step-d">' + esc(s.d) + '</div></div></div>';
    });
    html += '</div>';

    // 开口念词卡：跪下后第一句怎么讲（民俗礼仪口传，非祈福许愿）
    var pg = DATA.prayerGuide;
    html += '<div class="prayer-card">' +
      '<div class="prayer-h">跪下之后，第一句怎么念？</div>' +
      '<div class="prayer-sub">老一辈口传的顺序，照着念就不会慌 · 各地说法不同，以长辈教的为准</div>' +
      '<div class="prayer-self">' +
        '<span class="prayer-self-t">先选你的自称</span>' +
        '<div class="prayer-chips">' +
        '<button class="prayer-chip' + (state.prayer.gender === 'male' ? ' on' : '') + '" onclick="App.setPrayerGender(\'male\')">男</button>' +
        '<button class="prayer-chip' + (state.prayer.gender === 'female' ? ' on' : '') + '" onclick="App.setPrayerGender(\'female\')">女</button>' +
        '<span class="prayer-chip-sep"></span>' +
        '<button class="prayer-chip' + (state.prayer.married === 'no' ? ' on' : '') + '" onclick="App.setPrayerMarried(\'no\')">未婚</button>' +
        '<button class="prayer-chip' + (state.prayer.married === 'yes' ? ' on' : '') + '" onclick="App.setPrayerMarried(\'yes\')">已婚</button>' +
        '</div>' +
        '<div class="prayer-self-note">' + esc(pg.caution) + '</div>' +
      '</div>' +
      '<div class="prayer-text" id="prayerText">' + esc(buildPrayerText(occ)) + '</div>' +
      '<div class="prayer-copy-row">' +
        '<button class="prayer-copy" onclick="App.copyPrayer()">复制念词</button>' +
      '</div>' +
      '<details class="prayer-order"><summary>为什么要这样念 · 五步顺序</summary>' +
      pg.flow.map(function (f) {
        return '<div class="prayer-order-item"><b>' + esc(f.t) + '</b><span>' + esc(f.d) + '</span></div>';
      }).join('') +
      '<div class="prayer-many">' + esc(pg.manyDeities) + '</div>' +
      '</details>' +
      '</div>';

    // 我家拜法编辑卡：轻入口 + 点选 + 三级范围（把填写成本降到最低）
    var scopeDefault = fam.own ? 'self' : (occ.category === 'festival' ? 'festival' : (occ.category === 'regular' ? 'regular' : 'all'));
    var offerChips = buildOfferChips(occ);
    html += '<details class="family-edit-fold"' + (hasFamily ? ' open' : '') + '>' +
      '<summary class="family-edit-summary"><span class="fes-ico">✎</span>' +
      '<span><b>和别人家不一样？记一句就好</b><small>记一次，往后自动照自家的办</small></span>' +
      '<span class="fes-arrow">›</span></summary>' +
      '<div class="family-edit">' +
      '<div class="scope-row"><span class="scope-l">这句话记到</span>' +
      '<div class="scope-chips" id="scopeChips">' +
      '<button data-scope="all" class="' + (scopeDefault === 'all' ? 'on' : '') + '" onclick="App.setScope(\'all\')">所有节日</button>' +
      '<button data-scope="regular" class="' + (scopeDefault === 'regular' ? 'on' : '') + '" onclick="App.setScope(\'regular\')">每月常规</button>' +
      '<button data-scope="festival" class="' + (scopeDefault === 'festival' ? 'on' : '') + '" onclick="App.setScope(\'festival\')">时年大节</button>' +
      '<button data-scope="self" class="' + (scopeDefault === 'self' ? 'on' : '') + '" onclick="App.setScope(\'self\')">仅这次</button>' +
      '</div></div>' +
      '<input type="hidden" id="famScope" value="' + scopeDefault + '">' +
      '<div class="family-edit-tip">最省事：只记一句长辈原话就行。想让清单自动增减，再点下面的。</div>' +
      '<label class="field-l">长辈原话（一句话就够）</label>' +
      '<textarea id="famElder" class="field-input" rows="2" placeholder="例：阿嬷说香要插五支，烛要拜完才熄">' + esc(fam.elderSay || '') + '</textarea>' +
      '<label class="field-l opt-label">我家拜谁 <span>点选或自己填</span></label>' +
      '<div class="pick-chips">' + deityChips(fam.deities) + '</div>' +
      '<input id="famDeities" class="field-input" type="text" placeholder="例：只拜地主爷，不拜天公" value="' + esc(fam.deities || '') + '">' +
      '<label class="field-l opt-label">清单里要去掉的 <span>点一下加进去</span></label>' +
      '<div class="pick-chips">' + offerChips.remove + '</div>' +
      '<input id="famChanges" class="field-input" type="text" placeholder="例：发粿，卤鹅（清单会自动去掉）" value="' + esc(fam.changes || '') + '">' +
      '<label class="field-l opt-label">清单里要加的 <span>点一下加进去</span></label>' +
      '<div class="pick-chips">' + offerChips.add + '</div>' +
      '<input id="famAdd" class="field-input" type="text" placeholder="例：面线，一碗甜汤（清单会自动加上）" value="' + esc(fam.add || '') + '">' +
      '<button class="save-family-btn" onclick="App.saveFamily()">' + (hasFamily ? '保存修改' : '记住我家拜法') + '</button>' +
      '</div></details>';

    // 为什么层（了解性内容，折叠）
    if (DATA.why && DATA.why[occ.id]) {
      html += '<details class="why-fold">' +
        '<summary>为什么拜 · 这个日子是怎么来的</summary>' +
        '<div class="why-text">' + esc(DATA.why[occ.id]) + '</div>' +
        '</details>';
    }

    if (occ.taboos && occ.taboos.length) {
      html += '<div class="section-title">本节点讲究</div>';
      html += '<div class="notice">' + occ.taboos.map(function(t){return '· ' + esc(t);}).join('<br>') + '</div>';
    }
    if (occ.note) html += '<div class="source-note">' + (occ.note.indexOf('资料：')===0?'':'资料：') + esc(occ.note) + '</div>';
    html += '<div class="disclaimer">' + esc(DATA.meta.disclaimer) + '</div>';

    el('detailContent').innerHTML = html;
    showView('detail');
  }

  function ruleHtml(title, f, subtitle) {
    if (!f || !(f.deities || f.changes || f.add || f.elderSay)) return '';
    var h = '<div class="family-hub-item"><div class="family-hub-name">' + esc(title) +
      (subtitle ? '<span class="hub-sub">' + esc(subtitle) + '</span>' : '') + '</div>';
    if (f.deities) h += '<div class="family-hub-line">拜：' + esc(f.deities) + '</div>';
    if (f.changes) h += '<div class="family-hub-line">去掉：' + esc(f.changes) + '</div>';
    if (f.add) h += '<div class="family-hub-line">加：' + esc(f.add) + '</div>';
    if (f.elderSay) h += '<div class="family-hub-line">长辈原话：「' + esc(f.elderSay) + '」</div>';
    return h + '</div>';
  }

  function renderFamilyHub() {
    var famLabel = state.familyName ? esc(state.familyName) + '家' : '我家';
    var scopeNames = { all: '所有节日', regular: '每月常规', festival: '时年大节' };
    var defHtml = '';
    ['all', 'regular', 'festival'].forEach(function (k) {
      defHtml += ruleHtml(scopeNames[k], state.familyDefaults[k]);
    });
    var nodeHtml = '';
    Object.keys(state.myFamily).forEach(function (id) {
      var occ = DATA.occasions.find(function (o) { return o.id === id; });
      if (occ) nodeHtml += ruleHtml(occ.name, state.myFamily[id]);
    });
    var any = defHtml || nodeHtml;

    var html = '<div class="family-hub-hero">' +
      lionImg('note', '', '拜贺贺小狮') +
      '<h2>' + famLabel + '拜法</h2>' +
      '<p>记一句就够，往后自动照自家的办。<br>下面这些会直接改清单和首页结论。</p>' +
      '</div><div class="family-hub-list">';
    if (!any) {
      html += '<div class="family-hub-empty">' +
        lionImg('blank', '', '还没记录') +
        '还没有记录。<br>打开任一节日详情，点「和别人家不一样？记一句就好」<br>就能开始积累。' +
        '</div>';
    } else {
      if (defHtml) html += '<div class="hub-group-t">通用规矩（自动套用）</div>' + defHtml;
      if (nodeHtml) html += '<div class="hub-group-t">特定节日</div>' + nodeHtml;
    }
    html += '</div>';
    if (any) {
      html += '<div class="hub-actions">' +
        '<button class="action-btn" onclick="App.exportFamily()">导出备份（防清缓存丢失）</button>' +
        '</div>';
    }
    el('familyContent').innerHTML = html;
    showView('family');
  }

  function showView(name) {
    state.tab = name;
    var views = ['today', 'calendar', 'guide', 'detail', 'family'];
    views.forEach(function (v) {
      var node = el('view-' + v);
      if (node) node.style.display = (v === name ? 'block' : 'none');
    });
    var tabs = document.querySelectorAll('.tab');
    tabs.forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-tab') === name);
    });
    el('backBtn').style.display = (name === 'detail' || name === 'family') ? 'flex' : 'none';
    el('mainTitle').textContent = (name === 'detail') ? '拜拜详情' : (name === 'family' ? '我家拜法' : '拜贺贺');
    window.scrollTo(0, 0);
  }

  var App = {
    onboardPick: function (r) {
      state.region = r;
      state.overseas = (r === 'other');
      finishOnboard();
    },
    onboardOverseas: function () {
      state.region = 'other';
      state.overseas = true;
      finishOnboard();
      toast('已开启海外版，买不到粿会有替代方案');
    },
    openPersona: function () {
      personaState = { step: 0, answers: [] };
      el('personaBody').innerHTML = '';
      el('personaSheet').classList.add('show');
      renderPersonaQuiz();
    },
    answerPersona: function (oi) {
      personaState.answers[personaState.step] = oi;
      personaState.step++;
      if (personaState.step >= DATA.persona.questions.length) renderPersonaResult();
      else renderPersonaQuiz();
    },
    personaAgain: function () {
      personaState = { step: 0, answers: [] };
      renderPersonaQuiz();
    },
    savePersonaCard: function () {
      saveCanvas('personaCanvas', '我的拜拜人设卡.png', '卡片已保存，发家族群/朋友圈看看谁是同款');
    },
    openDetail: function (id) { renderDetail(id); },
    setScope: function (scope) {
      el('famScope').value = scope;
      document.querySelectorAll('#scopeChips button').forEach(function (b) {
        b.classList.toggle('on', b.getAttribute('data-scope') === scope);
      });
      // 切换范围时，把该层已有的值载入输入框（空层则清空，避免误把别的层内容复制过去）
      var occ = DATA.occasions.find(function (o) { return o.id === state.detailId; });
      if (!occ) return;
      var f = scope === 'self'
        ? (state.myFamily[occ.id] || {})
        : (state.familyDefaults[scope] || {});
      el('famDeities').value = f.deities || '';
      el('famChanges').value = f.changes || '';
      el('famAdd').value = f.add || '';
      el('famElder').value = f.elderSay || '';
    },
    toggleDeityChip: function (btn, name) {
      var input = el('famDeities');
      var cur = input.value.split(/[，,、]/).map(function (x) { return x.trim(); }).filter(Boolean);
      var idx = cur.indexOf(name);
      if (idx >= 0) { cur.splice(idx, 1); btn.classList.remove('on'); }
      else { cur.push(name); btn.classList.add('on'); }
      input.value = cur.join('，');
    },
    pickChip: function (inputId, value, btn) {
      var input = el(inputId);
      var cur = input.value.split(/[，,、]/).map(function (x) { return x.trim(); }).filter(Boolean);
      var idx = cur.indexOf(value);
      if (idx >= 0) { cur.splice(idx, 1); btn.classList.remove('on'); }
      else { cur.push(value); btn.classList.add('on'); }
      input.value = cur.join('，');
    },
    saveFamily: function () {
      var id = state.detailId;
      if (!id) return;
      var scope = (el('famScope') && el('famScope').value) || 'self';
      var d = (el('famDeities').value || '').trim();
      var c = (el('famChanges').value || '').trim();
      var a = (el('famAdd').value || '').trim();
      var e = (el('famElder').value || '').trim();
      if (!d && !c && !a && !e) { toast('还没填写内容'); return; }
      var rule = { deities: d, changes: c, add: a, elderSay: e };
      if (scope === 'self') state.myFamily[id] = rule;
      else state.familyDefaults[scope] = rule;
      save();
      renderToday();          // 让首页结论条立即反映"我家拜谁"
      renderDetail(id);
      var scopeName = { all: '所有节日', regular: '每月常规', festival: '时年大节', self: '仅这次' }[scope];
      toast('已记下，' + scopeName + '自动按你家调整');
    },
    openShare: function () {
      var occ = DATA.occasions.find(function (o) { return o.id === state.detailId; });
      if (!occ) return;
      buildShareCard(occ);
      var ta = el('shareText');
      if (ta) ta.value = buildChainText(occ);
      el('shareSheet').classList.add('show');
    },
    shareLink: function () {
      var occ = DATA.occasions.find(function (o) { return o.id === state.detailId; });
      if (!occ) return;
      var link = location.origin + location.pathname + '?detail=' + occ.id;
      var text = '「' + occ.name + '」清单我整理好了，买啥照这个来，缺啥说一声～ ' + link;
      if (navigator.share) {
        navigator.share({ title: occ.name + ' · 拜贺贺', text: text, url: link }).catch(function () {});
      } else {
        copyText(text, '链接已复制，可发家族群');
      }
    },
    toggleItem: function (e, key) {
      e.preventDefault();
      state.checked[key] = !state.checked[key];
      save();
      var label = e.currentTarget || e.target.closest('.shop-item');
      if (label) {
        label.classList.toggle('checked', !!state.checked[key]);
        label.querySelector('.shop-check').textContent = state.checked[key] ? '✓' : '';
      }
    },
    // 念词卡：切换性别/婚否只刷新卡片局部，不整页重渲染
    setPrayerGender: function (g) {
      state.prayer.gender = g; save(); refreshPrayerCard();
    },
    setPrayerMarried: function (m) {
      state.prayer.married = (state.prayer.married === m ? '' : m); save(); refreshPrayerCard();
    },
    copyPrayer: function () {
      var t = el('prayerText');
      if (t) copyText(t.textContent.replace(/\n/g, '\n'), '念词已复制，照着念就好');
    },
    pickDay: function (y, m, d) {
      state.pickedDate = new Date(y, m, d);
      renderCalendar();
    },
    changeMonth: function (delta) {
      var d = state.viewDate || new Date();
      var nd = new Date(d.getFullYear(), d.getMonth() + delta, 1);
      state.viewDate = nd;
      state.pickedDate = nd;
      renderCalendar();
    },
    setRegion: function (r) {
      state.region = r;
      save();
      renderHeader();
      renderToday();
      renderCalendar();
      closeSheet();
    },
    toggleOverseas: function () {
      state.overseas = !state.overseas;
      save();
      renderHeader();
      if (state.detailId) renderDetail(state.detailId);
    },
    toggleRemind: function () {
      state.remindOn = !state.remindOn;
      if (state.remindOn) {
        requestNotify(function (ok) {
          state.remindOn = ok;
          el('remindToggle').checked = ok;
          save();
          if (ok) { checkReminder(); toast('提醒已开启'); }
        });
      } else {
        save(); toast('提醒已关闭');
      }
    },
    setRemindDays: function (days) {
      state.remindDays = days; save(); checkReminder();
    },
    testRemind: function () {
      requestNotify(function (ok) {
        if (ok) notify('拜拜提醒 · 测试', '这是一条测试通知。开启后，初一十五和节日前会在这里提醒你。');
        else toast('通知未授权');
      });
    },
    openRegion: function () { el('regionSheet').classList.add('show'); },
    openFamilyHub: function () { renderFamilyHub(); },
    openSettings: function () { el('settingsSheet').classList.add('show'); },
    resetChecked: function () {
      state.checked = {};
      save();
      if (state.detailId) renderDetail(state.detailId);
      closeSheet();
    },
    exportFamily: function () {
      var famLabel = state.familyName ? state.familyName + '家' : '我家';
      var lines = ['【' + famLabel + '拜法 · 备份】', '（浏览器清缓存会丢数据，存一份在这里，换手机也能照着办）', ''];
      var scopeNames = { all: '所有节日', regular: '每月常规', festival: '时年大节' };
      function pushRule(title, f) {
        if (!f || !(f.deities || f.changes || f.add || f.elderSay)) return;
        lines.push('◆ ' + title);
        if (f.deities) lines.push('  拜：' + f.deities);
        if (f.changes) lines.push('  去掉：' + f.changes);
        if (f.add) lines.push('  加：' + f.add);
        if (f.elderSay) lines.push('  长辈原话：「' + f.elderSay + '」');
        lines.push('');
      }
      ['all', 'regular', 'festival'].forEach(function (k) { pushRule(scopeNames[k], state.familyDefaults[k]); });
      Object.keys(state.myFamily).forEach(function (id) {
        var occ = DATA.occasions.find(function (o) { return o.id === id; });
        if (occ) pushRule(occ.name, state.myFamily[id]);
      });
      var text = lines.join('\n');
      var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = famLabel + '拜法备份.txt';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      copyText(text, '备份已下载，也已复制可粘贴保存');
    },
    back: function () { showView('today'); }
  };
  window.App = App;

  function toast(msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:84px;transform:translateX(-50%);background:rgba(40,30,25,.92);color:#fff;padding:10px 18px;border-radius:22px;font-size:13px;z-index:9999;white-space:nowrap';
    document.body.appendChild(t);
    setTimeout(function () { t.parentNode && t.parentNode.removeChild(t); }, 2000);
  }

  function fitText(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    var s = text;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }

  // 三级覆盖：全局 all → 分类(regular/festival) → 本节点，字段级继承
  // 拜谁：就近覆盖（本节点最具体）；增减/原话：三层叠加去重
  function getFamilyFor(occ) {
    var g = state.familyDefaults.all || {};
    var c = (occ && occ.category) ? (state.familyDefaults[occ.category] || {}) : {};
    var n = (occ && state.myFamily[occ.id]) || {};
    function pick(field) {
      if (n[field]) return n[field];
      if (c[field]) return c[field];
      if (g[field]) return g[field];
      return '';
    }
    function mergeText(field) {
      var parts = [g[field], c[field], n[field]].filter(Boolean);
      var seen = {}, out = [];
      parts.forEach(function (p) {
        String(p).split(/[；;，,]/).forEach(function (seg) {
          var s = seg.trim();
          if (s && !seen[s]) { seen[s] = 1; out.push(s); }
        });
      });
      return out.join('；');
    }
    var r = {
      deities: pick('deities'),
      changes: mergeText('changes'),
      add: mergeText('add'),
      elderSay: mergeText('elderSay')
    };
    r.has = !!(r.deities || r.changes || r.add || r.elderSay);
    r.own = !!(n.deities || n.changes || n.add || n.elderSay);
    return r;
  }

  // 可省项判断：买不到/条件不允许时可省，核心不在此列。返回 true 则打「可省」标签
  function isOptionalItem(item) {
    return /卤鹅|猪前脚|发粿|糖塔|神明衣袍|纸扎|鞭炮|宴席|宾客|丁桌|红龟粿/.test(item);
  }

  // 清单过滤：只做我家拜法的增减（不再分简化版/完整版），详情页与分工卡共用
  function getFilteredGroups(occ) {
    var fam = getFamilyFor(occ);
    var removeWords = [];
    if (fam.changes) {
      removeWords = fam.changes.split(/[，,、和\/]/).map(function (w) {
        return w.replace(/^(不用|不要|去掉|不加|免)/, '').trim();
      }).filter(function (w) { return w.length >= 2; });
    }
    var raw = occ.shopping || {};
    var groups = {};
    Object.keys(raw).forEach(function (g) {
      var items = raw[g].filter(function (it) {
        return !removeWords.some(function (w) { return it.indexOf(w) >= 0; });
      });
      if (items.length) groups[g] = items;
    });
    if (fam.add) {
      var adds = fam.add.split(/[，,、]/).map(function (w) { return w.trim(); }).filter(Boolean);
      if (adds.length) groups['我家加的'] = adds;
    }
    return groups;
  }

  // 家族接龙文字：与分工卡同源（getFilteredGroups），纯文本发群最自然
  function buildChainText(occ) {
    var famLabel = state.familyName ? state.familyName + '家' : '我家';
    var lines = ['【' + famLabel + ' · ' + occ.name + '备办清单】', '清单我整理好了，大家看看缺啥，能搭把手的在后面接个名字～', ''];
    var groups = getFilteredGroups(occ);
    var n = 0;
    Object.keys(groups).forEach(function (g) {
      lines.push('— ' + g + ' —');
      groups[g].forEach(function (it) { n++; lines.push(n + '. ' + it + ' —— 认领：'); });
    });
    lines.push('（各乡各里不同，以本地长辈说法为准）');
    return lines.join('\n');
  }

  // 可靠复制：优先 clipboard API，失败降级 execCommand，再失败则选中让用户手动复制
  function copyText(text, okMsg) {
    function fallbackSelect() {
      var ta = el('shareText');
      if (ta && ta.value === text) {
        ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length);
        toast('已选中文字，长按「拷贝」即可');
      } else {
        var tmp = document.createElement('textarea');
        tmp.value = text;
        tmp.style.cssText = 'position:fixed;left:0;top:0;opacity:0';
        document.body.appendChild(tmp); tmp.focus(); tmp.select();
        setTimeout(function () { tmp.parentNode && tmp.parentNode.removeChild(tmp); }, 800);
        toast('请长按选中文字后拷贝');
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg); }).catch(function () {
        // clipboard 失败（常见于非 HTTPS / 微信内置浏览器），用 execCommand 兜底
        var tmp = document.createElement('textarea');
        tmp.value = text; tmp.style.cssText = 'position:fixed;left:0;top:0;opacity:0';
        document.body.appendChild(tmp); tmp.focus(); tmp.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(tmp);
        if (ok) toast(okMsg); else fallbackSelect();
      });
    } else {
      var tmp2 = document.createElement('textarea');
      tmp2.value = text; tmp2.style.cssText = 'position:fixed;left:0;top:0;opacity:0';
      document.body.appendChild(tmp2); tmp2.focus(); tmp2.select();
      var ok2 = false;
      try { ok2 = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(tmp2);
      if (ok2) toast(okMsg); else fallbackSelect();
    }
  }

  // 家族分工卡：项目—认领人两栏，留空供群内接龙填写
  function buildShareCard(occ) {
    var canvas = el('shareCanvas');
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 720;
    var groups = getFilteredGroups(occ);
    var sections = [];
    Object.keys(groups).forEach(function (g) {
      sections.push({ title: g, items: groups[g].slice(0, 5) });
    });
    var rowH = 42;
    var baseH = 232;
    var rowsH = sections.reduce(function (sum, s) { return sum + 52 + s.items.length * rowH + 16; }, 0);
    var H = Math.min(baseH + rowsH + 70, 1700);
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = '100%';
    ctx.scale(dpr, dpr);

    var famLabel = state.familyName ? esc(state.familyName) + '家' : '我家';
    ctx.fillStyle = '#fbf6ee'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#b23a2e'; ctx.fillRect(0, 0, W, 168);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f6dfae'; ctx.font = '500 22px sans-serif';
    ctx.fillText('拜贺贺 · 照生拜 · 备办分工', 40, 54);
    ctx.fillStyle = '#fff'; ctx.font = '600 44px sans-serif';
    ctx.fillText(occ.name, 40, 112);
    ctx.fillStyle = '#f0cf9a'; ctx.font = '19px sans-serif';
    ctx.fillText(famLabel + ' · 采购分工，群里按序号接龙', 40, 148);

    var y = 204;
    ctx.fillStyle = '#8a5a12'; ctx.font = '600 21px sans-serif';
    ctx.fillText('采购清单 · 接龙认领', 40, y);
    y += 20;

    sections.forEach(function (s) {
      var boxH = 50 + s.items.length * rowH + 12;
      ctx.fillStyle = '#fff';
      ctx.fillRect(32, y, W - 64, boxH);
      ctx.fillStyle = '#b23a2e'; ctx.font = '600 21px sans-serif';
      ctx.fillText('【' + s.title + '】', 50, y + 32);
      // 认领人表头
      ctx.fillStyle = '#a89a8c'; ctx.font = '15px sans-serif';
      ctx.textAlign = 'right'; ctx.fillText('认领人', W - 52, y + 32); ctx.textAlign = 'left';
      s.items.forEach(function (it, i) {
        var yy = y + 50 + i * rowH;
        ctx.strokeStyle = '#e2d8cc'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(50, yy + 4); ctx.lineTo(W - 50, yy + 4); ctx.stroke();
        ctx.fillStyle = '#3f3831'; ctx.font = '19px sans-serif';
        ctx.fillText(fitText(ctx, it, W - 300), 50, yy + 30);
        // 认领人填写位
        ctx.fillStyle = '#d8cec2';
        ctx.beginPath(); ctx.moveTo(W - 210, yy + 30); ctx.lineTo(W - 50, yy + 30); ctx.stroke();
      });
      y += boxH + 16;
    });

    ctx.fillStyle = '#a99e96'; ctx.font = '16px sans-serif';
    ctx.fillText('各乡各里拜法不同，照自家习惯调整就好 · 拜贺贺整理', 40, H - 26);
  }

  // ===== 拜拜人设卡（纯娱乐，无占卜/运势）=====
  var personaState = { step: 0, answers: [] };

  function renderPersonaQuiz() {
    var P = DATA.persona;
    var q = P.questions[personaState.step];
    var pct = Math.round(personaState.step / P.questions.length * 100);
    var html = '<div class="persona-progress"><div class="persona-progress-bar" style="width:' + pct + '%"></div></div>' +
      '<div class="persona-step">第 ' + (personaState.step + 1) + ' / ' + P.questions.length + ' 题</div>' +
      '<div class="persona-question">' + esc(q.q) + '</div><div class="persona-options">';
    q.options.forEach(function (opt, i) {
      html += '<button class="persona-option" onclick="App.answerPersona(' + i + ')">' +
        '<span class="po-key">' + 'ABCD'[i] + '</span><span>' + esc(opt.t) + '</span></button>';
    });
    html += '</div><div class="persona-footnote">纯民俗娱乐 · 不预测吉凶运势 · 答案以各家习惯为准</div>';
    el('personaBody').innerHTML = html;
  }

  function personaResult() {
    var P = DATA.persona;
    var score = {};
    Object.keys(P.types).forEach(function (k) { score[k] = 0; });
    // answers[题目序号] = 该题所选选项序号；回调首参是「选项序号」、次参才是「题目序号」
    personaState.answers.forEach(function (optIdx, qIdx) {
      var q = P.questions[qIdx];
      if (!q) return;
      var opt = q.options[optIdx];
      if (!opt) return;
      var w = P.weights[opt.k] || {};
      Object.keys(w).forEach(function (k) { if (score[k] != null) score[k] += w[k]; });
    });
    // 同分时按答题顺序稳定挑选，避免每次不一样
    var best = 'master', bestVal = -1;
    Object.keys(P.types).forEach(function (k) {
      if (score[k] > bestVal) { bestVal = score[k]; best = k; }
    });
    return P.types[best];
  }

  function renderPersonaResult() {
    var type = personaResult();
    var html = '<div class="persona-result-head">翻牌结果 · 你是</div>' +
      '<div class="persona-card-wrap"><canvas id="personaCanvas"></canvas></div>' +
      '<div class="persona-actions">' +
      '<button class="action-btn" onclick="App.personaAgain()">再玩一次</button>' +
      '<button class="action-btn ghost" onclick="App.savePersonaCard()">保存卡片发群里</button>' +
      '</div>' +
      '<div class="persona-footnote">纯民俗娱乐 · 不预测吉凶运势 · 答案以各家习惯为准</div>';
    el('personaBody').innerHTML = html;
    buildPersonaCard(type);
  }

  // 二维码 dataURL 缓存（qrcodejs 异步生成，就绪后重绘）
  var personaQrCache = null;
  function getPersonaQr(cb) {
    if (personaQrCache) { cb(personaQrCache); return; }
    try {
      if (!window.QRCode) { cb(null); return; }
      var holder = document.createElement('div');
      holder.style.cssText = 'position:absolute;left:-9999px;top:0';
      document.body.appendChild(holder);
      new QRCode(holder, {
        text: location.origin + location.pathname, width: 232, height: 232,
        colorDark: '#3e2e26', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M
      });
      // qrcodejs 在 setTimeout 里生成，轮询等待
      var tries = 0;
      (function wait() {
        var c = holder.querySelector('canvas');
        var im = holder.querySelector('img');
        if (c && c.width > 0) {
          try { personaQrCache = c.toDataURL('image/png'); } catch (e) {}
          document.body.removeChild(holder);
          cb(personaQrCache);
        } else if (im && im.complete && im.src) {
          try { personaQrCache = im.src; } catch (e) {}
          document.body.removeChild(holder);
          cb(personaQrCache);
        } else if (tries++ < 40) {
          setTimeout(wait, 50);
        } else {
          if (holder.parentNode) holder.parentNode.removeChild(holder);
          cb(null);
        }
      })();
    } catch (e) { cb(null); }
  }

  // 人设小人图缓存：加载失败回退大字，不影响现有功能
  var personaAvatarCache = {};
  function getPersonaAvatar(type, cb) {
    if (!type.img) { cb(null); return; }
    if (personaAvatarCache[type.img] != null) { cb(personaAvatarCache[type.img]); return; }
    var im = new Image();
    im.onload = function () { personaAvatarCache[type.img] = im; cb(im); };
    im.onerror = function () { personaAvatarCache[type.img] = null; cb(null); };
    im.src = type.img;
  }

  // Canvas 生成人设卡：红金配色 + 民俗元素 + 二维码
  function buildPersonaCard(type) {
    getPersonaQr(function (qrUrl) {
      getPersonaAvatar(type, function (avatar) {
        drawPersonaCardFull(type, qrUrl, avatar);
      });
    });
  }

  function drawPersonaCardFull(type, qrUrl, avatar) {
    var canvas = el('personaCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 640, H = 900;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = '100%';
    ctx.scale(dpr, dpr);

    // 底纹
    ctx.fillStyle = '#fbf3e4'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#e6d2b0'; ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, W - 40, H - 40);
    ctx.strokeRect(28, 28, W - 56, H - 56);

    // 顶部色带
    ctx.fillStyle = '#b14a38'; ctx.fillRect(28, 28, W - 56, 150);
    ctx.fillStyle = '#f6dfae'; ctx.font = '20px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('拜 贺 贺 人 设 卡', W / 2, 78);
    ctx.fillStyle = '#fff'; ctx.font = '600 15px sans-serif';
    ctx.fillText('6 题揭晓 · 对号入座', W / 2, 112);
    ctx.fillStyle = '#f0cf9a'; ctx.font = '13px sans-serif';
    ctx.fillText('纯民俗娱乐 · 无吉凶运势', W / 2, 146);

    // 中部形象区：有小人图则圆形裁剪绘制，无图回退大字圆章
    var cy = 372;
    if (avatar) {
      // 圆形头像框（带人设色底圈）
      ctx.fillStyle = type.color;
      ctx.beginPath(); ctx.arc(W / 2, cy, 132, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      ctx.beginPath(); ctx.arc(W / 2, cy, 124, 0, Math.PI * 2); ctx.clip();
      // cover 绘制：居中裁剪成正方形填满圆
      var sw = avatar.naturalWidth || avatar.width, sh = avatar.naturalHeight || avatar.height;
      var side = Math.min(sw, sh), sx = (sw - side) / 2, sy = (sh - side) / 2;
      ctx.drawImage(avatar, sx, sy, side, side, W / 2 - 124, cy - 124, 248, 248);
      ctx.restore();
      ctx.strokeStyle = '#f6dfae'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(W / 2, cy, 128, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(W / 2, cy, 120, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.fillStyle = type.color;
      ctx.beginPath(); ctx.arc(W / 2, cy, 118, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#f6dfae'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(W / 2, cy, 106, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '600 92px "Songti SC",serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(type.icon, W / 2, cy + 4);
      ctx.textBaseline = 'alphabetic';
    }

    // 人设名
    ctx.fillStyle = '#3e2e26'; ctx.font = '600 38px "Songti SC",serif';
    ctx.fillText(type.name, W / 2, 540);

    // 台词（自动换行）
    ctx.fillStyle = '#6b5447'; ctx.font = '21px sans-serif';
    wrapText(ctx, '「' + type.line + '」', W / 2, 590, W - 140, 32);

    // 标签胶囊
    var tag = type.tag;
    ctx.font = '17px sans-serif';
    var tw = ctx.measureText(tag).width + 44;
    ctx.fillStyle = '#faf1dc';
    roundRect(ctx, W / 2 - tw / 2, 650, tw, 40, 20); ctx.fill();
    ctx.fillStyle = '#8a6a2f'; ctx.textAlign = 'center';
    ctx.fillText(tag, W / 2, 676);

    // 底部：二维码 + 引导
    var qrSize = 116, qrX = 70, qrY = 748;
    ctx.fillStyle = '#fff'; roundRect(ctx, qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 8); ctx.fill();
    if (qrUrl) {
      try {
        var qrImg = new Image();
        qrImg.onload = function () { ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize); };
        qrImg.src = qrUrl;
        // dataURL 通常同步可画，兜底再画一次
        try { ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize); } catch (e2) {}
      } catch (e) {}
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = '#8a7567'; ctx.font = '16px sans-serif';
    ctx.fillText('长按识别二维码', qrX + qrSize + 24, qrY + 42);
    ctx.fillStyle = '#b14a38'; ctx.font = '600 22px "Songti SC",serif';
    ctx.fillText('来看看你是哪种？', qrX + qrSize + 24, qrY + 78);
    ctx.fillStyle = '#8a7567'; ctx.font = '14px sans-serif';
    ctx.fillText('拜贺贺 · 照生拜 · 查节日/买什么/怎么拜', qrX + qrSize + 24, qrY + 104);
  }

  function wrapText(ctx, text, x, y, maxW, lineH) {
    var line = '', lines = [];
    for (var i = 0; i < text.length; i++) {
      var test = line + text[i];
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = text[i]; }
      else line = test;
    }
    if (line) lines.push(line);
    lines.forEach(function (l, i) { ctx.fillText(l, x, y + i * lineH); });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function closeSheet() {
    document.querySelectorAll('.sheet').forEach(function (s) { s.classList.remove('show'); });
  }

  // ===== 保存卡片：微信内走「长按图片存相册」，其他环境直接下载 =====
  function isWeixin() { return /MicroMessenger/i.test(navigator.userAgent); }
  function saveCanvas(canvasId, filename, successMsg) {
    var canvas = el(canvasId);
    if (!canvas) { toast('卡片还没生成'); return; }
    var url;
    try { url = canvas.toDataURL('image/png'); }
    catch (e) { toast('生成失败，请截图保存'); return; }

    if (isWeixin()) {
      // 微信内置浏览器：<a download> 被拦截无效，改为展示真图引导长按存相册
      var img = el('saveImg');
      img.onload = function () {
        var ua = navigator.userAgent;
        var ios = /iPhone|iPad|iPod/i.test(ua);
        el('saveTipMain').innerHTML = '👇 长按下面的图片 → 点「' +
          (ios ? '存储到照片' : '保存到相册') + '」';
        el('saveSheet').classList.add('show');
      };
      img.onerror = function () { toast('图片生成失败，请截图保存'); };
      img.src = url;
    } else {
      var a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      toast(successMsg || '图片已保存');
    }
  }

  // ===== 提醒（触发权）=====
  function notify(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try { new Notification(title, { body: body, icon: 'icons/icon.svg', tag: 'csbai' }); } catch (e) {}
  }
  function requestNotify(cb) {
    if (!('Notification' in window)) { cb(false); return; }
    if (Notification.permission === 'granted') { cb(true); return; }
    if (Notification.permission === 'denied') { toast('请在浏览器设置里允许通知'); cb(false); return; }
    Notification.requestPermission().then(function (p) { cb(p === 'granted'); });
  }
  function eventsOnDate(date) {
    return getEventsForDate(date, state.region).events;
  }
  function checkReminder() {
    if (!state.remindOn || !('Notification' in window) || Notification.permission !== 'granted') return;
    for (var d = 0; d <= state.remindDays; d++) {
      var day = new Date(); day.setDate(day.getDate() + d);
      var evs = eventsOnDate(day);
      if (evs.length) {
        var names = evs.slice(0, 2).map(function (e) { return e.name; }).join('、');
        var when = d === 0 ? '今天' : (d === 1 ? '明天' : d + ' 天后');
        var key = 'csbai_notified_' + day.getFullYear() + '_' + (day.getMonth()+1) + '_' + day.getDate();
        try {
          if (localStorage.getItem(key)) continue;  // 该日已提醒过，检查下一个候选日
          localStorage.setItem(key, '1');
        } catch (e) {}
        var info = lunarInfo(day);
        notify('拜拜提醒 · ' + when + '该拜了', when + '是农历' + info.monthCn + '月' + info.dayCn + '，' + names + '。点开看看买什么、怎么拜。');
        return;
      }
    }
  }

  // 导出 .ics 日历订阅：系统级提醒，关掉页面也响
  function icsDate(d) {
    return '' + d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate());
  }
  function buildIcs() {
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//拜贺贺//照生拜提醒//CN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    var seen = {};
    var start = new Date(); start.setDate(1);
    for (var m = 0; m < 13; m++) {
      var monthStart = new Date(start.getFullYear(), start.getMonth() + m, 1);
      var days = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
      for (var dd = 1; dd <= days; dd++) {
        var day = new Date(monthStart.getFullYear(), monthStart.getMonth(), dd);
        if (day < new Date(new Date().setHours(0,0,0,0))) continue;
        var evs = eventsOnDate(day);
        if (!evs.length) continue;
        var names = evs.map(function (e) { return e.name; }).join('、');
        var key = icsDate(day);
        if (seen[key]) continue;
        seen[key] = 1;
        var alarmDay = new Date(day.getTime());
        alarmDay.setDate(alarmDay.getDate() - state.remindDays);  // 与"提前几天提醒"设置同步
        var info = lunarInfo(day);
        lines.push('BEGIN:VEVENT');
        lines.push('UID:csbai-' + key + '@baihelper.local');
        lines.push('DTSTAMP:' + icsDate(new Date()) + 'T000000Z');
        lines.push('DTSTART;VALUE=DATE:' + key);
        lines.push('SUMMARY:拜拜 · ' + names);
        lines.push('DESCRIPTION:农历' + info.monthCn + '月' + info.dayCn + '，' + names + '。买什么、怎么拜请打开拜贺贺。');
        lines.push('BEGIN:VALARM');
        lines.push('TRIGGER;VALUE=DATE-TIME:' + icsDate(alarmDay) + 'T010000Z');
        lines.push('ACTION:DISPLAY');
        lines.push('DESCRIPTION:明天/今天该拜了：' + names);
        lines.push('END:VALARM');
        lines.push('END:VEVENT');
      }
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }
  function exportIcs() {
    try {
      var blob = new Blob([buildIcs()], { type: 'text/calendar;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = '拜贺贺提醒.ics';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      toast('日历文件已下载，用手机日历打开导入即可（初一十五、节日自动提醒）');
    } catch (e) { toast('导出失败：' + e.message); }
  }

  function init() {
    load();

    document.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () {
        var tab = t.getAttribute('data-tab');
        if (tab === 'calendar') renderCalendar();
        if (tab === 'guide') renderGuide();
        showView(tab);
      });
    });
    el('backBtn').addEventListener('click', App.back);
    el('regionBtn').addEventListener('click', App.openRegion);
    el('settingsBtn').addEventListener('click', App.openSettings);
    el('overseasToggle').addEventListener('change', App.toggleOverseas);
    el('remindToggle').addEventListener('change', App.toggleRemind);
    el('remindDays').addEventListener('change', function () { App.setRemindDays(parseInt(this.value, 10) || 0); });
    el('familyNameInput').addEventListener('change', function () {
      state.familyName = (this.value || '').trim(); save();
      renderToday();
      if (state.detailId) renderDetail(state.detailId);
      toast('已保存');
    });
    el('testRemindBtn').addEventListener('click', App.testRemind);
    el('exportIcsBtn').addEventListener('click', exportIcs);
    el('copyShareBtn').addEventListener('click', function () {
      var occ = DATA.occasions.find(function (o) { return o.id === state.detailId; });
      if (!occ) return;
      copyText(buildChainText(occ), '已复制，发家族群即可接龙');
    });
    el('saveShareBtn').addEventListener('click', function () {
      saveCanvas('shareCanvas', '拜拜分工卡.png', '图片已保存');
    });
    el('prevMonth').addEventListener('click', function(){App.changeMonth(-1);});
    el('nextMonth').addEventListener('click', function(){App.changeMonth(1);});
    el('resetBtn').addEventListener('click', App.resetChecked);
    document.querySelectorAll('.sheet-close').forEach(function (b) {
      b.addEventListener('click', closeSheet);
    });
    document.querySelectorAll('.sheet-backdrop').forEach(function (b) {
      b.addEventListener('click', closeSheet);
    });

    el('regionList').innerHTML = DATA.regions.map(function (r) {
      return '<div class="region-item' + (r.id === state.region ? ' active' : '') + '" onclick="App.setRegion(\'' + r.id + '\')">' +
        imgTag(regionArt(r.id), 'region-item-art', r.name) +
        '<div class="region-item-txt">' +
        '<div class="region-name">' + esc(r.name) + (r.id === state.region ? ' <span class="region-check">✓</span>' : '') + '</div>' +
        '<div class="region-note">' + esc(r.note) + '</div>' +
        '<div class="region-tags">' + r.tags.map(function(t){return '<span>' + esc(t) + '</span>';}).join('') + '</div>' +
        '</div></div>';
    }).join('');

    el('overseasToggle').checked = state.overseas;
    el('remindToggle').checked = state.remindOn;
    el('remindDays').value = String(state.remindDays);
    el('familyNameInput').value = state.familyName;
    el('versionTag').textContent = 'v' + DATA.meta.version;

    // iOS / 微信内添加到主屏幕的手动指引（浏览器自动提示不覆盖这些环境）
    (function () {
      var ua = navigator.userAgent;
      var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      var inWeixin = /MicroMessenger/i.test(ua);
      var tip = el('installTip');
      if (!tip) return;
      if (inWeixin) {
        tip.innerHTML = '在微信里用：点右上角「···」→「在浏览器打开」，可添加到主屏。';
        tip.style.display = 'block';
      } else if (isIOS) {
        tip.innerHTML = 'iPhone 添加到主屏：点底部「分享」→「添加到主屏幕」，以后一点即开。';
        tip.style.display = 'block';
      }
    })();

    // 添加到主屏幕（PWA）
    var deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault(); deferredPrompt = e;
      el('installBtn').style.display = 'block';
    });
    el('installBtn').addEventListener('click', function () {
      if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; }
      else toast('请用浏览器菜单中的「添加到主屏幕」');
    });

    renderHeader();
    renderToday();
    renderCalendar();
    renderGuide();

    // 支持 ?detail=节点id 直接打开详情（便于分享特定拜拜指南）
    var params = new URLSearchParams(window.location.search);
    var detailId = params.get('detail');
    var shareId = params.get('share');
    var personaId = params.get('persona');

    // 首次进入先做地区引导：选完地区后再处理深链/首页
    if (!state.onboarded) {
      showOnboard();
    } else {
      openDeepLink(detailId, shareId, personaId);
    }

    function openDeepLink(did, sid, pid) {
      if (pid === '1' || (pid && DATA.persona && DATA.persona.types[pid])) {
        if (pid !== '1' && DATA.persona.types[pid]) {
          // 直接展示某张人设卡（便于分享卡片的落地）
          personaState = { step: DATA.persona.questions.length, answers: [] };
          el('personaBody').innerHTML = '';
          el('personaSheet').classList.add('show');
          var t = DATA.persona.types[pid];
          el('personaBody').innerHTML = '<div class="persona-result-head">一张朋友分享的卡 · 你是</div>' +
            '<div class="persona-card-wrap"><canvas id="personaCanvas"></canvas></div>' +
            '<div class="persona-actions"><button class="action-btn" onclick="App.openPersona()">我也测测</button>' +
            '<button class="action-btn ghost" onclick="App.savePersonaCard()">保存卡片</button></div>' +
            '<div class="persona-footnote">纯民俗娱乐 · 不预测吉凶运势 · 答案以各家习惯为准</div>';
          buildPersonaCard(t);
          return;
        }
        App.openPersona();
      } else if (sid && DATA.occasions.some(function(o){return o.id===sid;})) {
        renderDetail(sid);
        buildShareCard(DATA.occasions.find(function(o){return o.id===sid;}));
        el('shareSheet').classList.add('show');
      } else if (did && DATA.occasions.some(function(o){return o.id===did;})) {
        renderDetail(did);
      } else {
        showView('today');
      }
    }
    // 让引导完成后也能带上原始深链参数
    window.__openDeepLink = openDeepLink;
    window.__deepLink = { detail: detailId, share: shareId, persona: personaId };

    // 启动提醒检查（延迟 3 秒，避免打断首屏；之后每 10 分钟检查一次）
    setTimeout(checkReminder, 3000);
    setInterval(checkReminder, 10 * 60 * 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
