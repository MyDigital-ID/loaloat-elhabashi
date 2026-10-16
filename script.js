// ============================================================
// مطاحن بن لؤلؤة الحبشي — Main Script
// ============================================================

(function () {
  'use strict';

  // ============================================================
  // المتغيرات العامة
  // ============================================================
  let SITE = null;
  let currentCategory = null;
  let cart = [];
  let featuredSwiper = null;
  let offersSwiper = null;
  let splashFinished = false;
  let deferredInstallPrompt = null;

  const CART_KEY = 'loloat_cart_v1';

  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ============================================================
  // الأدوات
  // ============================================================
  function formatPrice(n) {
    return (n || 0).toLocaleString('ar-EG') + ' ج.م';
  }

  function getRoastHex(name) {
    if (!SITE || !SITE.roastLevels) return '#8B5A3C';
    const found = SITE.roastLevels.find(r => r.name === name);
    return found ? found.hex : '#8B5A3C';
  }

  function showToast(msg, elId = 'navToast') {
    const el = $(elId);
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), 2500);
  }

  function bumpCartCount() {
    ['cartCount', 'cartCountBottom'].forEach(id => {
      const el = $(id);
      if (el) {
        el.classList.remove('bump');
        void el.offsetWidth;
        el.classList.add('bump');
      }
    });
  }

  // ============================================================
  // السلة
  // ============================================================
  function loadCart() {
    try {
      const saved = localStorage.getItem(CART_KEY);
      cart = saved ? JSON.parse(saved) : [];
    } catch (e) {
      cart = [];
    }
    updateCartUI();
  }

  function saveCart() {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch (e) {}
  }

  function addToCart(item) {
    const existing = cart.find(c =>
      c.productId === item.productId &&
      c.size === item.size &&
      c.roast === item.roast &&
      c.packing === item.packing
    );

    if (existing) {
      existing.qty = (existing.qty || 1) + 1;
    } else {
      cart.push({ ...item, qty: 1 });
    }

    saveCart();
    updateCartUI();
    bumpCartCount();
    showToast(`✅ تم إضافة "${item.name}" للسلة`);
  }

  function removeFromCart(index) {
    cart.splice(index, 1);
    saveCart();
    updateCartUI();
  }

  function updateCartUI() {
    const count = cart.reduce((s, i) => s + (i.qty || 1), 0);
    const countEl = $('cartCount');
    const countBottomEl = $('cartCountBottom');
    if (countEl) countEl.textContent = count;
    if (countBottomEl) countBottomEl.textContent = count;

    const itemsEl = $('cartItems');
    const footerEl = $('cartFooter');
    if (!itemsEl) return;

    if (cart.length === 0) {
      itemsEl.innerHTML = '<p class="empty-cart">السلة فاضية</p>';
      if (footerEl) footerEl.style.display = 'none';
      return;
    }

    if (footerEl) footerEl.style.display = 'block';

    let total = 0;
    itemsEl.innerHTML = cart.map((item, i) => {
      const price = (item.offerPrice && item.offerPrice > 0) ? item.offerPrice : item.price;
      const lineTotal = price * (item.qty || 1);
      total += lineTotal;

      const roastColor = getRoastHex(item.roast);

      return `
        <div class="cart-line">
          <div class="cart-line-info">
            <strong>${item.name}</strong>
            <div class="line-meta">
              <span class="meta-tag">${item.size}</span>
              ${item.packing ? `<span class="meta-tag">${item.packing}</span>` : ''}
              ${item.roast ? `<span class="meta-tag roast" style="background:${roastColor}">${item.roast}</span>` : ''}
              <span class="meta-tag">× ${item.qty || 1}</span>
            </div>
            <div class="line-price">${formatPrice(lineTotal)}</div>
          </div>
          <button class="remove-line" data-idx="${i}" aria-label="حذف">✕</button>
        </div>
      `;
    }).join('');

    const totalEl = $('cartTotal');
    if (totalEl) totalEl.textContent = formatPrice(total);

    itemsEl.querySelectorAll('.remove-line').forEach(btn => {
      btn.onclick = () => removeFromCart(parseInt(btn.dataset.idx));
    });
  }

  // ============================================================
  // إتمام الطلب
  // ============================================================
  function buildOrderMessage() {
    let msg = '🛒 *طلب جديد من موقع بن لؤلؤة الحبشي*\n\n';

    cart.forEach((item, i) => {
      const price = (item.offerPrice && item.offerPrice > 0) ? item.offerPrice : item.price;
      const lineTotal = price * (item.qty || 1);

      msg += `${i + 1}. *${item.name}*\n`;
      msg += `   • التعبئة: ${item.size}\n`;
      if (item.packing) msg += `   • نوع العبوة: ${item.packing}\n`;
      if (item.roast) msg += `   • درجة البن: ${item.roast}\n`;
      msg += `   • الكمية: ${item.qty || 1}\n`;
      msg += `   • السعر: ${formatPrice(lineTotal)}\n\n`;
    });

    const total = cart.reduce((s, item) => {
      const price = (item.offerPrice && item.offerPrice > 0) ? item.offerPrice : item.price;
      return s + price * (item.qty || 1);
    }, 0);

    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `💰 *الإجمالي: ${formatPrice(total)}*\n\n`;
    msg += `📍 يرجى تأكيد الطلب وإرسال العنوان ورقم الهاتف.`;

    return msg;
  }

  function checkoutWhatsApp() {
    if (cart.length === 0) return;
    const msg = buildOrderMessage();
    const phone = SITE?.config?.whatsappNumber || '';
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  }

  function checkoutMessenger() {
    if (cart.length === 0) return;
    const msg = buildOrderMessage();
    navigator.clipboard.writeText(msg).then(() => {
      showToast('📋 تم نسخ الطلب — الصقه في المحادثة', 'clipboardToast');
      setTimeout(() => {
        const messengerId = SITE?.social?.messenger || '';
        if (messengerId) {
          window.open(`https://m.me/${messengerId}`, '_blank');
        }
      }, 800);
    }).catch(() => {
      const messengerId = SITE?.social?.messenger || '';
      if (messengerId) window.open(`https://m.me/${messengerId}`, '_blank');
    });
  }

  // ============================================================
  // Splash
  // ============================================================
  function initSplash() {
    const splash = $('splashScreen');
    const video = $('splashVideo');
    const bgVideo = $('splashVideoBg');

    return new Promise((resolve) => {
      if (!splash || !video) { resolve(); return; }

      let settled = false;
      let timer = null;
      const settle = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };

      timer = setTimeout(settle, 8000);

      video.addEventListener('playing', () => {
        video.classList.add('playing');
        clearTimeout(timer);
        const ms = ((isFinite(video.duration) && video.duration) ? video.duration : 4) * 1000 + 4000;
        timer = setTimeout(settle, ms);
      }, { once: true });

      video.addEventListener('ended', settle, { once: true });
      video.addEventListener('error', settle, { once: true });

      const p = video.play();
      if (p && p.catch) p.catch(settle);

      if (bgVideo) {
        const bp = bgVideo.play();
        if (bp && bp.catch) bp.catch(() => {});
      }
    });
  }

  function finishSplash() {
    const splash = $('splashScreen');
    document.body.classList.remove('splash-active');
    if (!splash || splash.classList.contains('hide')) return;
    splash.classList.add('hide');
    setTimeout(() => {
      splash.style.display = 'none';
      ['splashVideo', 'splashVideoBg'].forEach((id) => {
        const v = $(id);
        if (v) { try { v.pause(); } catch (e) {} }
      });
    }, 1000);
    splashFinished = true;
    // استنى 2.5 ثانية بعد الـ splash قبل ما نظهر رسالة التثبيت
    setTimeout(maybeShowInstall, 2500);
  }

  // ============================================================
  // Featured Slider
  // ============================================================
  function renderFeatured() {
    const track = $('featuredTrack');
    if (!track || !SITE.featured || SITE.featured.length === 0) return;

    track.innerHTML = SITE.featured.map((url, i) => `
      <div class="swiper-slide slider-item">
        <img src="${url}" alt="صورة مميزة ${i + 1}" loading="lazy">
      </div>
    `).join('');

    if (typeof Swiper === 'undefined') {
      $('featuredSlider')?.classList.add('no-swiper');
      return;
    }
    $('featuredSlider')?.classList.remove('no-swiper');

    if (featuredSwiper) featuredSwiper.destroy(true, false);

    featuredSwiper = new Swiper('#featuredSlider', {
      effect: 'coverflow',
      grabCursor: true,
      centeredSlides: true,
      slidesPerView: 'auto',
      loop: SITE.featured.length > 3,
      autoplay: {
        delay: 4000,
        disableOnInteraction: false,
      },
      coverflowEffect: {
        rotate: 30,
        stretch: 0,
        depth: 120,
        modifier: 1,
        slideShadows: false,
      },
      pagination: {
        el: '#featuredDots',
        clickable: true,
        bulletClass: 'dot',
        bulletActiveClass: 'active',
      },
    });
  }

  // ============================================================
  // الأكثر مبيعًا
  // ============================================================
  function renderBestSellers() {
    const track = $('bestTrack');
    if (!track) return;

    const bestProducts = [];
    SITE.categories.forEach(cat => {
      (cat.products || []).forEach(prod => {
        if (prod.isBestSeller || cat.isBestSeller) {
          bestProducts.push({
            ...prod,
            categoryId: cat.id,
            categoryName: cat.name_ar
          });
        }
      });
    });

    if (bestProducts.length === 0) {
      SITE.categories.slice(0, 6).forEach(cat => {
        (cat.products || []).slice(0, 1).forEach(prod => {
          bestProducts.push({
            ...prod,
            categoryId: cat.id,
            categoryName: cat.name_ar
          });
        });
      });
    }

    if (bestProducts.length === 0) {
      track.innerHTML = '<p class="empty-note">لا توجد منتجات حالياً</p>';
      return;
    }

    track.innerHTML = bestProducts.slice(0, 10).map(prod => {
      const img = prod.images?.[0] || '';

      return `
        <div class="mini-card" data-cat="${prod.categoryId}" data-prod="${prod.id}">
          <div class="mini-img">
            ${img ? `<img src="${img}" alt="${prod.name_ar}" loading="lazy">` : '☕'}
            <span class="mini-best-badge">⭐ مميز</span>
          </div>
          <div class="mini-name">${prod.name_ar}</div>
          <button class="mini-btn">عرض التفاصيل</button>
        </div>
      `;
    }).join('');

    track.querySelectorAll('.mini-card').forEach(card => {
      card.onclick = () => {
        openCategory(card.dataset.cat);
        setTimeout(() => {
          const prodEl = document.querySelector(`[data-product-id="${card.dataset.prod}"]`);
          if (prodEl) prodEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      };
    });
  }

  // ============================================================
  // الأقسام
  // ============================================================
  function renderCategories() {
    const grid = $('catsGrid');
    if (!grid) return;

    const visibleCats = (SITE.categories || []).filter(c => c.visible !== false && (c.products?.length > 0 || c.id.startsWith('placeholder')));

    if (visibleCats.length === 0) {
      grid.innerHTML = '<p class="empty-note">لا توجد أقسام حالياً</p>';
      return;
    }

    grid.innerHTML = visibleCats.map(cat => `
      <button class="cat-card" data-cat="${cat.id}">
        <div class="cat-img-box">
          ${cat.homeImg ? `<img src="${cat.homeImg}" alt="${cat.name_ar}" loading="lazy">` : ''}
          <div class="cat-card-go">←</div>
        </div>
        <div class="cat-card-text">
          <span class="cat-card-ar">${cat.icon || ''} ${cat.name_ar}</span>
        </div>
      </button>
    `).join('');

    grid.querySelectorAll('.cat-card').forEach(card => {
      card.onclick = () => openCategory(card.dataset.cat);
    });
  }

  // ============================================================
  // الفروع
  // ============================================================
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderBranches() {
    const box = $('sideBranches');
    if (!box) return;

    const branches = SITE?.config?.branches || [];

    if (branches.length === 0) {
      box.innerHTML = '<p class="side-branch-empty">لا توجد فروع حالياً</p>';
      return;
    }

    box.innerHTML = branches.map(b => `
      <a class="side-branch" href="${esc(b.mapUrl || '#')}" target="_blank" rel="noopener">
        <span class="side-branch-pin">📍</span>
        <span class="side-branch-info">
          <span class="side-branch-name">فرع ${esc(b.name || '')}</span>
          <span class="side-branch-address">${esc(b.address || '')}</span>
        </span>
        <span class="side-branch-go">افتح الخريطة ↗</span>
      </a>
    `).join('');
  }

  function toggleBranches(force) {
    const box = $('sideBranches');
    const toggle = $('sideBranchesToggle');
    if (!box || !toggle) return;
    const open = (typeof force === 'boolean') ? force : !box.classList.contains('open');
    box.classList.toggle('open', open);
    box.setAttribute('aria-hidden', open ? 'false' : 'true');
    toggle.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  // ============================================================
  // العروض
  // ============================================================
  function renderOffers() {
    const track = $('offersTrack');
    const empty = $('offersEmpty');
    const slider = $('offersSlider');

    if (!track) return;

    const offers = (SITE.offers || []).filter(o => o && (o.image || o.text));

    if (offers.length === 0) {
      if (slider) slider.style.display = 'none';
      if (empty) empty.style.display = 'block';
      return;
    }

    if (slider) slider.style.display = '';
    if (empty) empty.style.display = 'none';

    track.innerHTML = offers.map(offer => {
      const imgHtml = offer.image
        ? `<img src="${offer.image}" alt="عرض" loading="lazy">`
        : `<div class="offer-img-fallback">🎁</div>`;

      return `
        <div class="swiper-slide slider-item offer-slide">
          ${imgHtml}
          ${offer.text ? `<div class="offer-text-box">${offer.text}</div>` : ''}
        </div>
      `;
    }).join('');

    if (typeof Swiper === 'undefined') {
      $('offersSlider')?.classList.add('no-swiper');
      return;
    }
    $('offersSlider')?.classList.remove('no-swiper');

    if (offersSwiper) offersSwiper.destroy(true, false);

    offersSwiper = new Swiper('#offersSlider', {
      effect: 'coverflow',
      grabCursor: true,
      centeredSlides: true,
      slidesPerView: 'auto',
      loop: offers.length > 3,
      autoplay: {
        delay: 5000,
        disableOnInteraction: false,
      },
      coverflowEffect: {
        rotate: 25,
        stretch: 0,
        depth: 100,
        modifier: 1,
        slideShadows: false,
      },
      pagination: {
        el: '#offersDots',
        clickable: true,
        bulletClass: 'dot',
        bulletActiveClass: 'active',
      },
    });
  }

  // ============================================================
  // فتح قسم
  // ============================================================
  function openCategory(catId) {
    const cat = SITE.categories.find(c => c.id === catId);
    if (!cat) return;

    currentCategory = cat;

    $('view-home').classList.add('hidden');
    $('view-category').classList.remove('hidden');

    const titleEl = $('catTitle');
    if (titleEl) titleEl.textContent = `${cat.icon || ''} ${cat.name_ar}`;

    renderProducts(cat);

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeCategory() {
    $('view-category').classList.add('hidden');
    $('view-home').classList.remove('hidden');
    currentCategory = null;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ============================================================
  // عرض المنتجات
  // ============================================================
  function renderProducts(cat) {
    const list = $('productsList');
    if (!list) return;

    if (!cat.products || cat.products.length === 0) {
      list.innerHTML = '<p class="empty-note">لا توجد منتجات في هذا القسم حالياً</p>';
      return;
    }

    list.innerHTML = cat.products.map(prod => buildProductCard(prod, cat)).join('');

    list.querySelectorAll('.product-card').forEach(card => {
      const prodId = card.dataset.productId;
      const prod = cat.products.find(p => p.id === prodId);
      if (!prod) return;

      card.querySelectorAll('.pc-roast-chip').forEach(chip => {
        chip.onclick = () => {
          card.querySelectorAll('.pc-roast-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          card.dataset.selectedRoast = chip.dataset.roast;

          const sel = card.querySelector('.pc-roast-selected');
          if (sel) sel.textContent = chip.dataset.roast;
        };
      });

      card.querySelectorAll('.pc-size-btn').forEach(btn => {
        btn.onclick = () => {
          card.querySelectorAll('.pc-size-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          card.dataset.selectedSize = btn.dataset.size;
          card.dataset.selectedPrice = btn.dataset.price;
          card.dataset.selectedOffer = btn.dataset.offer || '0';

          const packingBox = card.querySelector('.pc-packing-options');
          if (packingBox) {
            if (btn.dataset.size === 'كيلو') {
              packingBox.classList.add('show');
            } else {
              packingBox.classList.remove('show');
              card.dataset.selectedPacking = '';
              card.querySelectorAll('.pc-packing-chip').forEach(c => c.classList.remove('active'));
            }
          }

          updateSelectedInfo(card);
        };
      });

      card.querySelectorAll('.pc-packing-chip').forEach(chip => {
        chip.onclick = () => {
          card.querySelectorAll('.pc-packing-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          card.dataset.selectedPacking = chip.dataset.packing;
          updateSelectedInfo(card);
        };
      });

      card.querySelectorAll('.pc-g-dot').forEach((dot, i) => {
        dot.onclick = () => {
          const img = card.querySelector('.pc-img');
          if (img) img.src = prod.images[i];
          card.querySelectorAll('.pc-g-dot').forEach(d => d.classList.remove('active'));
          dot.classList.add('active');
        };
      });

      const addBtn = card.querySelector('.pc-add-btn');
      if (addBtn) {
        addBtn.onclick = () => {
          const size = card.dataset.selectedSize;
          const price = parseFloat(card.dataset.selectedPrice || '0');
          const offerPrice = parseFloat(card.dataset.selectedOffer || '0');
          const roast = card.dataset.selectedRoast || '';
          const packing = card.dataset.selectedPacking || '';

          if (!size) {
            showToast('⚠️ اختر التعبئة أولاً');
            return;
          }

          if (prod.colors && prod.colors.length > 0 && !roast) {
            showToast('⚠️ اختر درجة البن أولاً');
            return;
          }

          if (size === 'كيلو' && !packing) {
            showToast('⚠️ اختر نوع العبوة أولاً');
            return;
          }

          addToCart({
            productId: prod.id,
            name: prod.name_ar,
            size: size,
            roast: roast,
            packing: packing,
            price: price,
            offerPrice: offerPrice,
          });
        };
      }
    });
  }

  function updateSelectedInfo(card) {
    const info = card.querySelector('.pc-selected-info');
    if (!info) return;

    const size = card.dataset.selectedSize;
    const packing = card.dataset.selectedPacking || '';
    const price = parseFloat(card.dataset.selectedPrice || '0');
    const offerPrice = parseFloat(card.dataset.selectedOffer || '0');

    const displayPrice = (offerPrice > 0)
      ? `<span class="pc-old-price">${formatPrice(price)}</span> <span class="pc-offer-price">${formatPrice(offerPrice)}</span>`
      : formatPrice(price);

    const sizeLabel = packing ? `${size} (${packing})` : size;

    info.style.display = 'flex';
    info.innerHTML = `
      <span>${sizeLabel}</span>
      <span>${displayPrice}</span>
    `;
  }

  // ============================================================
  // بناء كارت المنتج
  // ============================================================
  function buildProductCard(prod, cat) {
    const images = prod.images || [];
    const colors = prod.colors || [];
    const sizes = prod.sizes || [];

    const hasImages = images.length > 0;
    const hasRoast = colors.length > 0;
    const hasSizes = sizes.length > 0;

    const roastChips = hasRoast ? `
      <div class="pc-roast-section">
        <div class="pc-roast-label">☕ اختر درجة البن: <b class="pc-roast-selected"></b></div>
        <div class="pc-roast-chips">
          ${colors.map(c => {
            const hex = getRoastHex(c);
            return `
              <button class="pc-roast-chip" data-roast="${c}">
                <span class="pc-roast-dot" style="background:${hex}"></span>
                ${c}
              </button>
            `;
          }).join('')}
        </div>
      </div>
    ` : '';

    const galleryDots = images.length > 1 ? `
      <div class="pc-gallery-dots">
        ${images.map((_, i) => `<span class="pc-g-dot ${i === 0 ? 'active' : ''}" data-idx="${i}"></span>`).join('')}
      </div>
    ` : '';

    const sizesHtml = hasSizes ? `
      <div class="pc-sizes">
        ${sizes.map(s => {
          const hasOffer = s.offerPrice && s.offerPrice > 0;
          const priceHtml = hasOffer
            ? `<span class="pc-old-price">${s.price}</span><span class="pc-offer-price">${s.offerPrice}</span>`
            : `${s.price}`;

          return `
            <button class="pc-size-btn" data-size="${s.label}" data-price="${s.price}" data-offer="${s.offerPrice || 0}">
              <span class="pc-size-label">${s.label}</span>
              <span class="pc-size-price">${priceHtml} ج.م</span>
            </button>
          `;
        }).join('')}
      </div>
    ` : '';

    const packingOptions = `
      <div class="pc-packing-options">
        <div class="pc-packing-label">📦 اختر نوع العبوة:</div>
        <div class="pc-packing-chips">
          <button class="pc-packing-chip" data-packing="عبوة كيلو">
            <span class="pc-packing-icon">📦</span>
            عبوة كيلو
          </button>
          <button class="pc-packing-chip" data-packing="نصين">
            <span class="pc-packing-icon">📦📦</span>
            نصين
          </button>
          <button class="pc-packing-chip" data-packing="4 أرباع">
            <span class="pc-packing-icon">📦📦📦📦</span>
            4 أرباع
          </button>
        </div>
      </div>
    `;

    return `
      <div class="product-card" data-product-id="${prod.id}">
        <div class="pc-img-box">
          <div class="pc-img-frame">
            ${hasImages
              ? `<img class="pc-img" src="${images[0]}" alt="${prod.name_ar}" loading="lazy">`
              : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:4rem;color:#C9A961;">☕</div>`
            }
            <div class="pc-beans-frame"></div>
            ${galleryDots}
          </div>
        </div>

        <h3 class="pc-name">${prod.name_ar}</h3>
        ${prod.desc_ar ? `<p class="pc-desc">${prod.desc_ar}</p>` : ''}

        ${roastChips}
        ${sizesHtml}
        ${packingOptions}

        <div class="pc-selected-info" style="display:none;">
          <span>—</span>
          <span>—</span>
        </div>

        <button class="pc-add-btn">
          🛒 أضف للسلة
        </button>
      </div>
    `;
  }

  // ============================================================
  // القوائم
  // ============================================================
  function openMenu() {
    $('sideMenu').classList.add('open');
    $('overlay').classList.add('show');
  }

  function closeMenu() {
    $('sideMenu').classList.remove('open');
    $('overlay').classList.remove('show');
  }

  function openCart() {
    $('cartDrawer').classList.add('open');
    $('overlay').classList.add('show');
  }

  function closeCart() {
    $('cartDrawer').classList.remove('open');
    $('overlay').classList.remove('show');
  }

  // ============================================================
  // Footer
  // ============================================================
  function renderFooter() {
    const cfg = SITE.config || {};
    const social = SITE.social || {};

    const phonesHtml = (cfg.phones || []).map(p => `
      <div><strong>${p.label}:</strong> <a href="tel:${p.number}" style="color:var(--gold-dark);font-weight:900;">${p.number}</a></div>
    `).join('');

    const footerPhones = $('footerPhones');
    if (footerPhones) footerPhones.innerHTML = phonesHtml;

    const sidePhones = $('sidePhones');
    if (sidePhones) {
      sidePhones.innerHTML = (cfg.phones || []).map(p => `
        <div class="side-phone-item">
          <span class="phone-label">${p.label}</span>
          <a href="tel:${p.number}">${p.number}</a>
        </div>
      `).join('');
    }

    const footerHours = $('footerHours');
    if (footerHours) {
      footerHours.innerHTML = cfg.workingHours_ar ? `<div><strong>🕐 ساعات العمل:</strong> ${cfg.workingHours_ar}</div>` : '';
    }

    const footerRights = $('footerRights');
    if (footerRights) footerRights.textContent = cfg.rights_ar || 'جميع الحقوق محفوظة لمطاحن بن لؤلؤة الحبشي';

    const socialEl = $('footerSocial');
    if (socialEl) {
      const icons = {
        facebook: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
        whatsapp: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>`,
      };

      let html = '';
      if (social.facebook) html += `<a href="${social.facebook}" target="_blank" rel="noopener" class="social-icon" id="facebookLink" title="فيسبوك">${icons.facebook}</a>`;
      if (social.whatsapp) html += `<a href="${social.whatsapp}" target="_blank" rel="noopener" class="social-icon" id="whatsappLink" title="واتساب">${icons.whatsapp}</a>`;

      socialEl.innerHTML = html;
    }

    const sideWa = $('sideWhatsapp');
    if (sideWa && social.whatsapp) sideWa.href = social.whatsapp;
  }

  // ============================================================
  // ربط الأحداث
  // ============================================================
  function bindEvents() {
    $('menuBtn')?.addEventListener('click', openMenu);
    $('closeMenuBtn')?.addEventListener('click', closeMenu);
    $('overlay')?.addEventListener('click', () => {
      closeMenu();
      closeCart();
    });

    $('cartBtn')?.addEventListener('click', openCart);
    $('bottomCartBtn')?.addEventListener('click', openCart);
    $('closeCartBtn')?.addEventListener('click', closeCart);

    $('checkoutBtn')?.addEventListener('click', () => {
      if (cart.length === 0) {
        showToast('⚠️ السلة فاضية');
        return;
      }

      const footer = $('cartFooter');
      if (footer) {
        footer.innerHTML = `
          <p class="cart-confirm-title">اختر طريقة إتمام الطلب</p>
          <div class="cart-confirm-actions">
            <button class="confirm-btn confirm-whatsapp" id="cfWa">
              <span style="font-size:1.5rem;">💬</span>
              واتساب
            </button>
            <button class="confirm-btn confirm-messenger" id="cfMs">
              <span style="font-size:1.5rem;">📨</span>
              ماسنجر
            </button>
          </div>
        `;
        $('cfWa').onclick = checkoutWhatsApp;
        $('cfMs').onclick = checkoutMessenger;
      }
    });

    $('backBtn')?.addEventListener('click', closeCategory);

    $('heroCta')?.addEventListener('click', () => {
      document.getElementById('categories')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    $('brandBtn')?.addEventListener('click', () => {
      closeCategory();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    $$('.side-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const nav = link.dataset.nav;

        if (nav === 'branches') {
          toggleBranches();
          return;
        }

        closeMenu();

        if (nav === 'home') {
          closeCategory();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (nav === 'categories') {
          closeCategory();
          setTimeout(() => document.getElementById('categories')?.scrollIntoView({ behavior: 'smooth' }), 100);
        } else if (nav === 'best') {
          closeCategory();
          setTimeout(() => document.getElementById('best-sellers')?.scrollIntoView({ behavior: 'smooth' }), 100);
        } else if (nav === 'offers') {
          closeCategory();
          setTimeout(() => document.getElementById('offers')?.scrollIntoView({ behavior: 'smooth' }), 100);
        } else if (nav === 'contact') {
          closeCategory();
          setTimeout(() => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
      });
    });

    $$('.bn-btn').forEach(btn => {
      const nav = btn.dataset.nav;
      if (!nav) return;

      btn.addEventListener('click', () => {
        if (nav === 'home') {
          closeCategory();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (nav === 'back') {
          if (currentCategory) closeCategory();
          else history.back();
        }
      });
    });
  }

  // ============================================================
  // تثبيت التطبيق (PWA install prompt)
  // ============================================================
  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
  }

  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function maybeShowInstall() {
    const banner = $('installBanner');
    if (!banner || !splashFinished || isStandalone()) return;

    // استنى شوية إضافية عشان لو المتصفح عايز يعرض رسالته يبقى خلص
    setTimeout(() => {
      const yes = $('installYes');
      const hint = $('installHint');

      if (deferredInstallPrompt) {
        if (hint) hint.hidden = true;
        if (yes) { yes.hidden = false; yes.textContent = 'تثبيت الآن'; }
      } else if (isIOS()) {
        if (hint) {
          hint.hidden = false;
          hint.textContent = 'اضغط زر المشاركة ⬆️ في المتصفح ثم «إضافة إلى الشاشة الرئيسية»';
        }
        if (yes) yes.hidden = true;
      } else {
        return;
      }

      banner.hidden = false;
      requestAnimationFrame(() => banner.classList.add('show'));
    }, 3000);
  }

  function hideInstall() {
    const banner = $('installBanner');
    if (!banner) return;
    banner.classList.remove('show');
    setTimeout(() => { banner.hidden = true; }, 350);
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    maybeShowInstall();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    hideInstall();
  });

  function bindInstall() {
    $('installYes')?.addEventListener('click', async () => {
      if (!deferredInstallPrompt) { hideInstall(); return; }
      const promptEvent = deferredInstallPrompt;
      deferredInstallPrompt = null;
      hideInstall();
      try {
        promptEvent.prompt();
        await promptEvent.userChoice;
      } catch (err) {
        console.warn('Install prompt failed:', err);
      }
    });

    $('installLater')?.addEventListener('click', hideInstall);
  }

  // ============================================================
  // رسم كل الأقسام
  // ============================================================
  function renderAll() {
    [renderFeatured, renderBestSellers, renderCategories, renderBranches, renderOffers, renderFooter]
      .forEach((fn) => {
        try { fn(); } catch (err) { console.error('❌ Render failed:', fn.name, err); }
      });
  }

  // ============================================================
  // تشغيل التطبيق
  // ============================================================
  async function init() {
    const splashDone = initSplash();

    try {
      SITE = await window.SiteDataLoader.load((fresh) => {
        SITE = fresh;
        renderAll();
        console.log('🔄 Updated from GitHub');
      });
      console.log('✅ Site loaded:', SITE.config?.brand_ar);

      renderAll();
      loadCart();
      bindEvents();
      bindInstall();

      console.log('🎉 App ready');

    } catch (error) {
      console.error('❌ Init failed:', error);
      showToast('⚠️ فشل تحميل البيانات، حاول تحديث الصفحة');
    }

    await splashDone;
    finishSplash();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();