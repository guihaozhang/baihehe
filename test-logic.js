/* 逻辑验证：复用 data.js + lunar.min.js，测试节点匹配 */
global.window = {};
require('./js/data.js');
var DATA = window.CSDATA;
var lib = require('./js/lunar.min.js');
var Lunar = lib.Lunar, Solar = lib.Solar, LunarMonth = lib.LunarMonth;

function lunarInfo(date) {
  var solar = Solar.fromDate(date);
  var lunar = solar.getLunar();
  return {
    solar: solar, lunar: lunar,
    lunarMonth: lunar.getMonth(), lunarDay: lunar.getDay(),
    monthCn: lunar.getMonthInChinese(), dayCn: lunar.getDayInChinese(),
    jieqi: lunar.getJieQi() || ''
  };
}
function isLastLunarDay(info) {
  var days = LunarMonth.fromYm(info.lunar.getYear(), info.lunarMonth).getDayCount();
  return info.lunarDay === days || info.lunarDay === -1;
}
function matchWhen(w, info) {
  if (w.type === 'lunarLastDay') {
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
function eventsOn(date, region) {
  var info = lunarInfo(date);
  var names = DATA.occasions.filter(function(o){
    var inRegion = !o.regions || o.regions.length===0 || o.regions.indexOf(region)>=0 || region==='other';
    return inRegion && (o.when||[]).some(function(w){return matchWhen(w,info);});
  }).map(function(o){return o.name;});
  return { info: info, names: names };
}

var cases = [
  ['2026-11-18', 'shantou'],  // 农历十月初十
  ['2026-11-19', 'shantou'],  // 十一
  ['2026-11-26', 'shantou'],  // 十五?
  ['2026-02-17', 'shantou'],  // 春节 2026?
  ['2026-04-05', 'shantou'],  // 清明
  ['2026-12-22', 'shantou'],  // 冬至
  ['2026-02-16', 'shantou'],  // 除夕?
  ['2026-02-17', 'chaozhou']
];

console.log('=== 节点匹配测试 ===');
cases.forEach(function(c){
  var parts = c[0].split('-');
  var d = new Date(+parts[0], +parts[1]-1, +parts[2]);
  var r = eventsOn(d, c[1]);
  console.log(c[0], '['+c[1]+']', '农历'+r.info.monthCn+'月'+r.info.dayCn, r.info.jieqi?('节气:'+r.info.jieqi):'', '=>', r.names.join(' / ') || '(无)');
});

// 遍历全年，统计每个节点是否被触发过
console.log('\n=== 全年节点覆盖检查 (2026) ===');
var fired = {};
for (var m=0;m<12;m++){
  var dim = new Date(2026,m+1,0).getDate();
  for (var d=1;d<=dim;d++){
    var r = eventsOn(new Date(2026,m,d),'other');
    r.names.forEach(function(n){fired[n]=true;});
  }
}
DATA.occasions.forEach(function(o){
  console.log((fired[o.name]?'  OK  ':' MISS '), o.name);
});
