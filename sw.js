/* 拜贺贺 · 照生拜 Service Worker - 离线缓存 */
var CACHE = 'csbai-v10';
var ASSETS = [
  './', './index.html', './css/style.css',
  './js/lunar.min.js', './js/data.js', './js/app.js', './js/qrcode.min.js',
  './icons/icon.svg', './manifest.json',
  './assets/hero-preparing.jpg', './assets/offerings-flatlay.jpg', './assets/mascot-lion.jpg',
  './assets/mascot-lion-rest.jpg', './assets/mascot-lion-note.jpg', './assets/mascot-lion-blank.jpg',
  './assets/persona-master.jpg', './assets/persona-efficient.jpg', './assets/persona-commander.jpg',
  './assets/persona-homesick.jpg', './assets/persona-follower.jpg', './assets/persona-foodie.jpg',
  './assets/persona-scholar.jpg', './assets/persona-thrifty.jpg', './assets/persona-social.jpg',
  './assets/persona-lastminute.jpg', './assets/persona-newgen.jpg', './assets/persona-sincere.jpg',
  './assets/hero-heritage.jpg', './assets/entry-fun.jpg', './assets/overseas-worship.jpg', './assets/detail-offering.jpg',
  './assets/region-shantou.jpg', './assets/region-chaozhou.jpg', './assets/region-jieyang.jpg',
  './assets/region-chaoyang.jpg', './assets/region-chenghai.jpg', './assets/region-puning.jpg', './assets/region-other.jpg',
  './assets/fest-chunjie.jpg', './assets/fest-qingming.jpg', './assets/fest-zhongyuan.jpg',
  './assets/fest-zhongqiu.jpg', './assets/fest-dongzhi.jpg', './assets/fest-chuxi.jpg'
];
self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).catch(function(){}));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = e.request.url;
  // 代码/页面类：网络优先，保证一发布就拿到最新版（缓存只作离线兜底）
  var isCode = /\.(js|css|html)(\?|$)/.test(url) || /\?sharecode=/.test(url) || url.endsWith('/');
  if (isCode) {
    e.respondWith(
      fetch(e.request).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () { return caches.match(e.request); })
    );
    return;
  }
  // 图片等静态资源：缓存优先，加载快
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () { return hit; });
    })
  );
});
