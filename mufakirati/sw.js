/* ============================================================
   Service Worker — مفكرتي اليومية | ياسر الحسين
   يجعل التطبيق يعمل بدون إنترنت ويُحمّل بسرعة.
   ============================================================ */

const CACHE_VERSION = 'mufakkirati-v2.0.0';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

/* ---------- التثبيت: تخزين الملفات الأساسية ---------- */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      return cache.addAll(APP_SHELL).catch(() => {
        // إذا فشل تحميل أي ملف (مثلاً الأيقونات غير موجودة) نكمل ببقية الملفات
        return Promise.all(
          APP_SHELL.map(url =>
            cache.add(url).catch(() => null)
          )
        );
      });
    }).then(() => self.skipWaiting())
  );
});

/* ---------- التنشيط: حذف النسخ القديمة ---------- */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

/* ---------- الجلب: استراتيجية ذكية ---------- */
self.addEventListener('fetch', event => {
  const req = event.request;

  // لا نتدخّل في الطلبات غير GET (مثل POST للـ Firebase)
  if (req.method !== 'GET') return;

  // لا نتدخّل في طلبات Firebase أو Google APIs
  const url = new URL(req.url);
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('firebase')
  ) {
    return;
  }

  // استراتيجية: Cache First للملفات المحلية، Network First للبقية
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) {
        // يوجد في الكاش — نرجعه فوراً ونحدّثه في الخلفية
        fetch(req).then(res => {
          if (res && res.status === 200 && res.type === 'basic') {
            caches.open(CACHE_VERSION).then(cache => cache.put(req, res.clone()));
          }
        }).catch(() => {});
        return cached;
      }

      // غير موجود في الكاش — نجلبه من الشبكة
      return fetch(req).then(res => {
        // نخزن فقط الملفات المحلية الناجحة
        if (
          res &&
          res.status === 200 &&
          res.type === 'basic' &&
          url.origin === self.location.origin
        ) {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(req, clone));
        }
        return res;
      }).catch(() => {
        // فشل الاتصال — نرجّع الصفحة الرئيسية إذا كان الطلب لصفحة
        if (req.mode === 'navigate') {
          return caches.match('./index.html');
        }
        // أو نرجّع استجابة فارغة
        return new Response('offline', {
          status: 503,
          statusText: 'Offline',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      });
    })
  );
});

/* ---------- رسائل من التطبيق (تحديث فوري) ---------- */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* ---------- الإشعارات (للتذكير اليومي) ---------- */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./index.html');
    })
  );
});
