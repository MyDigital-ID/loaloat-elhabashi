// ============================================================
// مطاحن بن لؤلؤة الحبشي — Site Data Loader
// بيحمّل site-data.json بأسلوب stale-while-revalidate:
//  1) لو فيه نسخة محفوظة → يعرضها فوراً (الفتح سريع + شغّال أوفلاين)
//  2) في الخلفية يجيب أحدث نسخة من GitHub، ولو اختلفت يبلّغ الصفحة تحدّث العرض
// ============================================================

(function () {
  'use strict';

  const DATA_URL = 'site-data.json';
  const CACHE_KEY = 'loloat_site_data_v1';

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  async function fetchFreshData() {
    const response = await fetch(`${DATA_URL}?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data || typeof data !== 'object') {
      throw new Error('Invalid data format');
    }

    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('⚠️ Could not cache data:', e.message);
    }

    return data;
  }

  // onUpdate(freshData): بتتنادى لو النسخة الجديدة من GitHub مختلفة عن اللي اتعرضت
  async function loadSiteData(onUpdate) {
    const cached = readCache();

    if (cached) {
      console.log('📦 Loaded from cache — checking GitHub for updates…');
      fetchFreshData()
        .then((fresh) => {
          if (JSON.stringify(fresh) !== JSON.stringify(cached) && typeof onUpdate === 'function') {
            onUpdate(fresh);
          }
        })
        .catch(() => { /* أوفلاين أو GitHub مش متاح — النسخة المحفوظة كفاية */ });
      return cached;
    }

    // أول فتحة (مفيش نسخة محفوظة) → لازم ننتظر الشبكة
    const data = await fetchFreshData();
    console.log('🌐 Loaded fresh from network');
    return data;
  }

  function clearSiteDataCache() {
    localStorage.removeItem(CACHE_KEY);
    console.log('🗑️ Site data cache cleared');
  }

  window.SiteDataLoader = {
    load: loadSiteData,
    clearCache: clearSiteDataCache,
    DATA_URL
  };

})();
