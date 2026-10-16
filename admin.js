// ============================================================
// مطاحن بن لؤلؤة الحبشي — Admin Panel
// ============================================================

const OWNER_KEY  = "loloat_admin_owner";
const REPO_KEY   = "loloat_admin_repo";
const FOLDER_KEY = "loloat_admin_folder";
const TOKEN_KEY  = "loloat_admin_token";

let GITHUB_OWNER  = localStorage.getItem(OWNER_KEY) || "";
let GITHUB_REPO   = localStorage.getItem(REPO_KEY) || "";
let FOLDER_PATH   = localStorage.getItem(FOLDER_KEY) || "";
let GITHUB_BRANCH = "main";
let TOKEN         = localStorage.getItem(TOKEN_KEY) || "";

let DATA_PATH   = "";
let IMAGES_PATH = "";
let DATA_API    = "";

function recomputeGithubPaths() {
  DATA_PATH   = FOLDER_PATH ? `${FOLDER_PATH}/site-data.json` : "site-data.json";
  IMAGES_PATH = FOLDER_PATH ? `${FOLDER_PATH}/assets/uploads` : "assets/uploads";
  DATA_API    = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_PATH}`;
}
recomputeGithubPaths();

function pagesBaseUrl() {
  const ownerLower = GITHUB_OWNER.toLowerCase();
  const repoLower  = GITHUB_REPO.toLowerCase();
  if (repoLower === `${ownerLower}.github.io`) return `https://${ownerLower}.github.io`;
  return `https://${ownerLower}.github.io/${GITHUB_REPO}`;
}

let storeData = null;
let currentSha = null;
let pendingImages = {};
let pendingFeatured = [];
let pendingOffers = {};
let isSaving = false;

const $ = (id) => document.getElementById(id);

// ============================================================
// درجات البن
// ============================================================
const DEFAULT_ROAST_LEVELS = [
  { name: "فاتح", hex: "#D4A574" },
  { name: "وسط", hex: "#8B5A3C" },
  { name: "غامق", hex: "#3E1F0F" }
];

// ============================================================
// خيارات التعبئة
// ============================================================
const PACKING_PRESETS = ["عبوة كيلو", "نصين", "4 أرباع"];

// ============================================================
// أدوات
// ============================================================
function ghHeaders() {
  return {
    "Authorization": `Bearer ${TOKEN}`,
    "Accept": "application/vnd.github+json"
  };
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary);
}

function base64ToUtf8(b64) {
  const binary = atob(b64.replace(/\n/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ضغط + ظبط مقاس الصورة تلقائياً: بتتقص من المنتصف على نسبة الإطار (لو اتحددت)
// وأطول ضلع فيها بيبقى 1400 بكسل كحد أقصى. بدون أي تدخل من صاحب اللوحة.
function compressImage(file, ratio = 0, maxSize = 1400, quality = 0.88) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // 1) منطقة القص من منتصف الصورة
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (ratio > 0) {
          const current = sw / sh;
          if (current > ratio) { sw = Math.round(sh * ratio); sx = Math.round((img.width - sw) / 2); }
          else if (current < ratio) { sh = Math.round(sw / ratio); sy = Math.round((img.height - sh) / 2); }
        }
        // 2) تصغير لو أكبر من الحد
        let w = sw, h = sh;
        if (w > maxSize || h > maxSize) {
          if (w > h) { h = Math.round((maxSize / w) * h); w = maxSize; }
          else { w = Math.round((maxSize / h) * w); h = maxSize; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
        canvas.toBlob((blob) => {
          const reader2 = new FileReader();
          reader2.onload = () => resolve(reader2.result.split(",")[1]);
          reader2.onerror = reject;
          reader2.readAsDataURL(blob);
        }, "image/jpeg", quality);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function showStatus(msg, type = "ok") {
  const el = $("statusMsg");
  el.textContent = msg;
  el.className = "show " + type;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.className = ""; }, 5000);
}

function showLoading(text = "جاري التحميل...") {
  $("loadingText").textContent = text;
  $("loadingOverlay").classList.add("show");
}

function hideLoading() {
  $("loadingOverlay").classList.remove("show");
}

function uid(prefix = "id") {
  return prefix + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
}

// ============================================================
// GitHub API
// ============================================================
async function fetchFromGitHub() {
  const res = await fetch(`${DATA_API}?ref=${GITHUB_BRANCH}&t=${Date.now()}`, {
    headers: ghHeaders()
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("GitHub error " + res.status);
  const info = await res.json();
  currentSha = info.sha;
  return JSON.parse(base64ToUtf8(info.content));
}

async function fetchLatestSha() {
  const res = await fetch(`${DATA_API}?ref=${GITHUB_BRANCH}&t=${Date.now()}`, {
    headers: ghHeaders(),
    cache: "no-store"
  });
  if (res.status === 401) throw new Error("التوكن غير صحيح أو منتهي");
  if (!res.ok) throw new Error("تعذر قراءة آخر نسخة من GitHub (كود " + res.status + ")");
  const info = await res.json();
  return info.sha;
}

async function saveDataToGitHub() {
  const newContent = JSON.stringify(storeData, null, 2);

  for (let attempt = 1; attempt <= 2; attempt++) {
    currentSha = await fetchLatestSha();

    const res = await fetch(DATA_API, {
      method: "PUT",
      headers: { ...ghHeaders(), "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        message: "تحديث بيانات لؤلؤة الحبشي من لوحة التحكم",
        content: utf8ToBase64(newContent),
        sha: currentSha,
        branch: GITHUB_BRANCH
      })
    });
    const out = await res.json().catch(() => ({}));

    if (res.ok) {
      currentSha = out && out.content ? out.content.sha : currentSha;
      return;
    }

    const msg = (out && out.message) || "";
    const isShaConflict = res.status === 409 || /does not match/i.test(msg);
    if (isShaConflict && attempt === 1) continue;

    throw new Error(msg || ("خطأ في الحفظ (كود " + res.status + ")"));
  }
}

async function uploadImageToGitHub(base64Content, fileName) {
  const path = `${IMAGES_PATH}/${fileName}`;
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
  let sha = null;
  try {
    const check = await fetch(`${url}?ref=${GITHUB_BRANCH}`, { headers: ghHeaders() });
    if (check.ok) {
      const info = await check.json();
      sha = info.sha;
    }
  } catch (e) {}

  const body = {
    message: "رفع صورة: " + fileName,
    content: base64Content,
    branch: GITHUB_BRANCH
  };
  if (sha) body.sha = sha;

  const res = await fetch(url, {
    method: "PUT",
    headers: { ...ghHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Upload failed");
  }
  return `${pagesBaseUrl()}/${IMAGES_PATH}/${fileName}`;
}

// ============================================================
// تسجيل الدخول
// ============================================================
$("loginBtn").onclick = login;
$("pwInput").addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });

const togglePw = $("togglePw");
if (togglePw) {
  togglePw.onclick = () => {
    const inp = $("pwInput");
    if (inp.type === "password") { inp.type = "text"; togglePw.textContent = "🙈"; }
    else { inp.type = "password"; togglePw.textContent = "👁️"; }
  };
}

async function login() {
  const owner  = $("ownerInput").value.trim().replace(/^\/+|\/+$/g, "");
  const repo   = $("repoInput").value.trim().replace(/^\/+|\/+$/g, "");
  const folder = $("folderInput").value.trim().replace(/^\/+|\/+$/g, "");
  const tok    = $("pwInput").value.trim();

  if (!owner || !repo) {
    $("loginErr").textContent = "لازم تكتب اسم المستخدم واسم الريبو";
    return;
  }
  if (!tok) {
    $("loginErr").textContent = "لازم تكتب التوكن";
    return;
  }

  $("loginErr").textContent = "";
  $("loginBtn").textContent = "جاري التحقق...";
  $("loginBtn").disabled = true;

  const prevOwner = GITHUB_OWNER, prevRepo = GITHUB_REPO, prevFolder = FOLDER_PATH;
  GITHUB_OWNER = owner;
  GITHUB_REPO = repo;
  FOLDER_PATH = folder;
  recomputeGithubPaths();

  try {
    TOKEN = tok;
    storeData = await fetchFromGitHub();
    localStorage.setItem(TOKEN_KEY, TOKEN);
    localStorage.setItem(OWNER_KEY, GITHUB_OWNER);
    localStorage.setItem(REPO_KEY, GITHUB_REPO);
    localStorage.setItem(FOLDER_KEY, FOLDER_PATH);

    $("loginScreen").style.display = "none";
    $("dashboard").classList.add("active");
    renderAll();
    showStatus("تم الدخول بنجاح ✅", "ok");
  } catch (e) {
    GITHUB_OWNER = prevOwner;
    GITHUB_REPO = prevRepo;
    FOLDER_PATH = prevFolder;
    recomputeGithubPaths();

    if (e.message === "UNAUTHORIZED") {
      $("loginErr").textContent = "التوكن غير صحيح أو منتهي الصلاحية";
    } else if (e.message && e.message.includes("404")) {
      $("loginErr").textContent = "مفيش ملف site-data.json في الريبو/الفولدر ده";
    } else {
      $("loginErr").textContent = "خطأ: " + e.message;
    }
    $("loginBtn").textContent = "🔓 دخول";
    $("loginBtn").disabled = false;
    TOKEN = "";
  }
}

if (GITHUB_OWNER) $("ownerInput").value = GITHUB_OWNER;
if (GITHUB_REPO) $("repoInput").value = GITHUB_REPO;
if (FOLDER_PATH) $("folderInput").value = FOLDER_PATH;

if (TOKEN && GITHUB_OWNER && GITHUB_REPO) {
  $("pwInput").value = TOKEN;
  login();
}

// ============================================================
// الخروج
// ============================================================
$("logoutBtn").onclick = () => {
  if (!confirm("هيتم مسح التوكن المحفوظ. متأكد؟")) return;
  localStorage.removeItem(TOKEN_KEY);
  location.reload();
};

// ============================================================
// تحديث
// ============================================================
$("reloadBtn").onclick = async () => {
  if (!confirm("هيتم تجاهل التعديلات غير المحفوظة. متأكد؟")) return;
  showLoading("جاري التحديث...");
  try {
    storeData = await fetchFromGitHub();
    pendingImages = {};
    pendingFeatured = [];
    pendingOffers = {};
    renderAll();
    showStatus("تم التحديث ✅", "ok");
  } catch (e) {
    showStatus("فشل التحديث: " + e.message, "err");
  }
  hideLoading();
};

// ============================================================
// الحفظ
// ============================================================
function setSaveButtonsDisabled(disabled) {
  ["saveBtn", "saveBtnBottom"].forEach(id => {
    const el = $(id);
    if (el) {
      el.disabled = disabled;
      el.style.pointerEvents = disabled ? "none" : "";
      el.style.opacity = disabled ? "0.6" : "";
    }
  });
}

async function saveAll() {
  if (isSaving) return;
  isSaving = true;
  setSaveButtonsDisabled(true);
  showLoading("جاري حفظ التعديلات...");
  let failed = false;

  try {
    // 1) الصور المميزة
    if (pendingFeatured.length > 0) {
      if (!storeData.featured) storeData.featured = [];
      const total = pendingFeatured.length;
      let done = 0;
      while (pendingFeatured.length > 0) {
        showLoading(`جاري رفع الصور المميزة (${++done} من ${total})...`);
        const file = pendingFeatured[0];
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const fileName = `featured_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
        const b64 = await compressImage(file, 1.1);
        const url = await uploadImageToGitHub(b64, fileName);
        storeData.featured.push(url);
        pendingFeatured.shift();
      }
    }

    // 2) صور العروض
    if (Object.keys(pendingOffers).length > 0) {
      if (!storeData.offers) storeData.offers = [];
      for (const offerId of Object.keys(pendingOffers)) {
        showLoading("جاري رفع صور العروض...");
        const file = pendingOffers[offerId];
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const fileName = `offer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
        const b64 = await compressImage(file, 1);
        const url = await uploadImageToGitHub(b64, fileName);
        const offer = storeData.offers.find(o => o.id === offerId);
        if (offer) offer.image = url;
        delete pendingOffers[offerId];
      }
    }

    // 3) صور المنتجات
    const pendingCount = Object.values(pendingImages).reduce((a, arr) => a + arr.length, 0);
    if (pendingCount > 0) {
      showLoading(`جاري رفع ${pendingCount} صورة منتج...`);
      await uploadAllPendingImages();
    }

    // 4) حفظ JSON
    showLoading("جاري حفظ البيانات على GitHub...");
    await saveDataToGitHub();
    showStatus("تم الحفظ ✅ التحديث هيظهر خلال دقيقة", "ok");

  } catch (e) {
    failed = true;
    const reason = (e && e.message) ? e.message : String(e || "سبب غير معروف");
    showStatus("فشل الحفظ: " + reason, "err");
  }

  hideLoading();
  if (failed) {
    try { renderAll(); } catch (e) {}
  }
  isSaving = false;
  setSaveButtonsDisabled(false);
}

$("saveBtn").onclick = saveAll;
$("saveBtnBottom").onclick = saveAll;

async function uploadAllPendingImages() {
  for (const productId of Object.keys(pendingImages)) {
    const files = pendingImages[productId];
    if (!files || files.length === 0) continue;

    let product = null;
    for (const cat of storeData.categories) {
      const p = cat.products.find(pp => pp.id === productId);
      if (p) { product = p; break; }
    }
    if (!product) { delete pendingImages[productId]; continue; }

    if (!product.images) product.images = [];

    while (files.length > 0) {
      const file = files[0];
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const fileName = `${productId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
      const b64 = await compressImage(file, 1);
      const url = await uploadImageToGitHub(b64, fileName);
      product.images.push(url);
      files.shift();
    }
    delete pendingImages[productId];
  }
}

// ============================================================
// عرض الكل
// ============================================================
function renderAll() {
  renderConfig();
  renderFeaturedSection();
  renderOffersSection();
  renderZones();
}

// ============================================================
// الإعدادات العامة
// ============================================================
const CONFIG_FIELDS = [
  ["brand_ar", "اسم المتجر (عربي)"],
  ["tagline_ar", "التاجلاين"],
  ["about_ar", "نبذة عن المتجر", true],
  ["whatsappNumber", "رقم واتساب الطلب (بالصيغة الدولية بدون +)"],
  ["workingHours_ar", "ساعات العمل"],
  ["rights_ar", "حقوق المحل"]
];

const SOCIAL_FIELDS = [
  ["facebook", "رابط صفحة الفيسبوك"],
  ["messenger", "الماسنجر: ID أو اسم الصفحة"],
  ["whatsapp", "رابط واتساب"]
];

function renderConfig() {
  const wrap = $("configFields");
  wrap.innerHTML = "";
  const cfg = storeData.config || (storeData.config = {});

  CONFIG_FIELDS.forEach(([key, label, isArea]) => {
    const lbl = document.createElement("label");
    lbl.textContent = label;
    wrap.appendChild(lbl);

    const input = document.createElement(isArea ? "textarea" : "input");
    if (!isArea) input.type = "text";
    input.value = cfg[key] || "";
    input.oninput = () => { cfg[key] = input.value; };
    wrap.appendChild(input);
  });

  // الأرقام (phones)
  const phonesTitle = document.createElement("p");
  phonesTitle.style.cssText = "margin-top:26px;padding-top:18px;border-top:2px solid var(--border);font-family:'Cairo',sans-serif;font-weight:900;font-size:1.15rem;color:var(--coffee)";
  phonesTitle.textContent = "📞 أرقام التليفون";
  wrap.appendChild(phonesTitle);

  if (!cfg.phones) cfg.phones = [];

  const phonesWrap = document.createElement("div");
  phonesWrap.id = "phonesEditor";
  wrap.appendChild(phonesWrap);
  renderPhonesEditor();

  const addPhoneBtn = document.createElement("button");
  addPhoneBtn.className = "btn-add";
  addPhoneBtn.textContent = "+ إضافة رقم";
  addPhoneBtn.onclick = () => {
    cfg.phones.push({ label: "توصيل", number: "" });
    renderPhonesEditor();
  };
  wrap.appendChild(addPhoneBtn);

  // الفروع (branches)
  const branchesTitle = document.createElement("p");
  branchesTitle.style.cssText = "margin-top:26px;padding-top:18px;border-top:2px solid var(--border);font-family:'Cairo',sans-serif;font-weight:900;font-size:1.15rem;color:var(--coffee)";
  branchesTitle.textContent = "📍 فروعنا";
  wrap.appendChild(branchesTitle);

  const branchesHint = document.createElement("p");
  branchesHint.style.cssText = "color:var(--text-muted);font-size:0.85rem;margin-bottom:12px;font-weight:700";
  branchesHint.textContent = "كل فرع: اسم + عنوان + رابط Google Maps";
  wrap.appendChild(branchesHint);

  if (!cfg.branches) cfg.branches = [];

  const branchesWrap = document.createElement("div");
  branchesWrap.id = "branchesEditor";
  wrap.appendChild(branchesWrap);
  renderBranchesEditor();

  const addBranchBtn = document.createElement("button");
  addBranchBtn.className = "btn-add";
  addBranchBtn.textContent = "+ إضافة فرع";
  addBranchBtn.onclick = () => {
    cfg.branches.push({ name: "", address: "", mapUrl: "" });
    renderBranchesEditor();
  };
  wrap.appendChild(addBranchBtn);

  // السوشيال
  const socialTitle = document.createElement("p");
  socialTitle.style.cssText = "margin-top:26px;padding-top:18px;border-top:2px solid var(--border);font-family:'Cairo',sans-serif;font-weight:900;font-size:1.15rem;color:var(--coffee)";
  socialTitle.textContent = "🔗 روابط التواصل الاجتماعي";
  wrap.appendChild(socialTitle);

  if (!storeData.social) storeData.social = {};

  SOCIAL_FIELDS.forEach(([key, label]) => {
    const lbl = document.createElement("label");
    lbl.textContent = label;
    wrap.appendChild(lbl);
    const input = document.createElement("input");
    input.type = "text";
    input.value = storeData.social[key] || "";
    input.placeholder = "https://...";
    input.oninput = () => { storeData.social[key] = input.value; };
    wrap.appendChild(input);
  });
}

function renderPhonesEditor() {
  const wrap = $("phonesEditor");
  if (!wrap) return;
  wrap.innerHTML = "";
  const cfg = storeData.config;

  (cfg.phones || []).forEach((phone, i) => {
    const row = document.createElement("div");
    row.className = "selected-size-row";

    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.className = "sz-price-input";
    labelInput.style.width = "130px";
    labelInput.value = phone.label || "";
    labelInput.placeholder = "التسمية";
    labelInput.oninput = () => { cfg.phones[i].label = labelInput.value; };

    const numberInput = document.createElement("input");
    numberInput.type = "text";
    numberInput.className = "sz-price-input";
    numberInput.style.flex = "1";
    numberInput.style.width = "auto";
    numberInput.value = phone.number || "";
    numberInput.placeholder = "الرقم";
    numberInput.oninput = () => { cfg.phones[i].number = numberInput.value; };

    const del = document.createElement("button");
    del.className = "sz-del";
    del.textContent = "✕";
    del.onclick = () => { cfg.phones.splice(i, 1); renderPhonesEditor(); };

    row.appendChild(labelInput);
    row.appendChild(numberInput);
    row.appendChild(del);
    wrap.appendChild(row);
  });
}

function renderBranchesEditor() {
  const wrap = $("branchesEditor");
  if (!wrap) return;
  wrap.innerHTML = "";
  const cfg = storeData.config;

  (cfg.branches || []).forEach((branch, i) => {
    const box = document.createElement("div");
    box.style.cssText = "background:var(--pearl-soft);border:2px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px";

    const nameLbl = document.createElement("label");
    nameLbl.textContent = "اسم الفرع";
    nameLbl.style.marginTop = "0";
    box.appendChild(nameLbl);

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = branch.name || "";
    nameInput.placeholder = "مثال: الإبراهيمية";
    nameInput.oninput = () => { cfg.branches[i].name = nameInput.value; };
    box.appendChild(nameInput);

    const addrLbl = document.createElement("label");
    addrLbl.textContent = "العنوان";
    box.appendChild(addrLbl);

    const addrInput = document.createElement("input");
    addrInput.type = "text";
    addrInput.value = branch.address || "";
    addrInput.placeholder = "مثال: 66 ش بورسعيد - الإبراهيمية";
    addrInput.oninput = () => { cfg.branches[i].address = addrInput.value; };
    box.appendChild(addrInput);

    const urlLbl = document.createElement("label");
    urlLbl.textContent = "رابط Google Maps";
    box.appendChild(urlLbl);

    const urlInput = document.createElement("input");
    urlInput.type = "text";
    urlInput.value = branch.mapUrl || "";
    urlInput.placeholder = "https://www.google.com/maps/...";
    urlInput.oninput = () => { cfg.branches[i].mapUrl = urlInput.value; };
    box.appendChild(urlInput);

    const del = document.createElement("button");
    del.className = "btn-danger";
    del.textContent = "🗑️ حذف الفرع";
    del.style.marginTop = "12px";
    del.onclick = () => { cfg.branches.splice(i, 1); renderBranchesEditor(); };
    box.appendChild(del);

    wrap.appendChild(box);
  });
}

// ============================================================
// الصور المميزة
// ============================================================
function renderFeaturedSection() {
  const wrap = $("featuredFields");
  if (!wrap) return;
  wrap.innerHTML = "";

  const hint = document.createElement("p");
  hint.style.cssText = "color:var(--text-muted);font-size:0.95rem;margin-bottom:14px;line-height:1.7;font-weight:700";
  hint.textContent = "الصور اللي بتظهر في السلايدر المميز في الصفحة الرئيسية";
  wrap.appendChild(hint);

  if (!storeData.featured) storeData.featured = [];

  const grid = document.createElement("div");
  grid.className = "images-grid";

  storeData.featured.forEach((imgUrl, i) => {
    const thumb = document.createElement("div");
    thumb.className = "img-thumb";
    const img = document.createElement("img");
    img.src = imgUrl;
    img.onerror = () => { img.style.opacity = "0.3"; };
    const del = document.createElement("button");
    del.className = "img-del";
    del.textContent = "✕";
    del.onclick = () => {
      if (!confirm("حذف هذه الصورة؟")) return;
      storeData.featured.splice(i, 1);
      renderFeaturedSection();
    };
    thumb.appendChild(img);
    thumb.appendChild(del);
    grid.appendChild(thumb);
  });

  pendingFeatured.forEach((file, i) => {
    const thumb = document.createElement("div");
    thumb.className = "img-thumb";
    thumb.style.borderColor = "var(--gold)";
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    const del = document.createElement("button");
    del.className = "img-del";
    del.textContent = "✕";
    del.onclick = () => { pendingFeatured.splice(i, 1); renderFeaturedSection(); };
    const badge = document.createElement("div");
    badge.style.cssText = "position:absolute;bottom:4px;left:4px;background:var(--gold);color:#fff;font-size:0.7rem;padding:3px 8px;border-radius:6px;font-weight:900";
    badge.textContent = "قيد الرفع";
    thumb.appendChild(img);
    thumb.appendChild(del);
    thumb.appendChild(badge);
    grid.appendChild(thumb);
  });

  const addBtn = document.createElement("div");
  addBtn.className = "img-add-btn";
  addBtn.innerHTML = `📷<small>إضافة صورة</small>`;
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.multiple = true;
  addBtn.onclick = () => fileInput.click();
  fileInput.onchange = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    files.forEach(f => pendingFeatured.push(f));
    renderFeaturedSection();
  };
  grid.appendChild(addBtn);
  wrap.appendChild(grid);
  wrap.appendChild(fileInput);
}

// ============================================================
// العروض
// ============================================================
function renderOffersSection() {
  const wrap = $("offersFields");
  if (!wrap) return;
  wrap.innerHTML = "";

  if (!storeData.offers || !Array.isArray(storeData.offers)) {
    storeData.offers = [];
  }

  const counter = $("offersCount");
  if (counter) counter.textContent = storeData.offers.length + " عرض";

  const hint = document.createElement("p");
  hint.style.cssText = "color:var(--text-muted);font-size:0.9rem;margin-bottom:14px;line-height:1.7;font-weight:700";
  hint.innerHTML = "كل عرض = <strong>صورة</strong> + <strong>نص</strong> (زي: \"اشتري كيلو توليفة بن سوبر وعليها 100 جرام بن هدية\")";
  wrap.appendChild(hint);

  const grid = document.createElement("div");
  grid.className = "offers-grid";

  storeData.offers.forEach((offer, idx) => {
    grid.appendChild(buildOfferCard(offer, idx));
  });

  const addOfferBtn = document.createElement("div");
  addOfferBtn.className = "offer-card";
  addOfferBtn.style.cssText = "justify-content:center;align-items:center;cursor:pointer;border-style:dashed";
  addOfferBtn.innerHTML = `
    <div style="font-size:2.5rem;color:var(--gold-dark)">➕</div>
    <div style="font-weight:900;color:var(--gold-dark);text-align:center;font-size:0.95rem">إضافة عرض جديد</div>
  `;
  addOfferBtn.onclick = () => {
    storeData.offers.push({ id: uid("offer"), image: "", text: "" });
    renderOffersSection();
    showStatus("تم إضافة عرض جديد — ارفع صورة واكتب النص 💾", "ok");
  };
  grid.appendChild(addOfferBtn);
  wrap.appendChild(grid);
}

function buildOfferCard(offer, idx) {
  const card = document.createElement("div");
  card.className = "offer-card";

  const num = document.createElement("div");
  num.className = "offer-num";
  num.textContent = "#" + (idx + 1);
  card.appendChild(num);

  const imgBox = document.createElement("div");
  imgBox.className = "offer-img-box";

  const pendingFile = pendingOffers[offer.id];

  if (pendingFile) {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(pendingFile);
    imgBox.appendChild(img);

    const del = document.createElement("button");
    del.className = "offer-img-del";
    del.textContent = "✕";
    del.onclick = () => { delete pendingOffers[offer.id]; renderOffersSection(); };
    imgBox.appendChild(del);

    const badge = document.createElement("div");
    badge.style.cssText = "position:absolute;bottom:6px;right:6px;background:var(--gold);color:#fff;font-size:0.65rem;padding:3px 8px;border-radius:6px;font-weight:900;z-index:2";
    badge.textContent = "قيد الرفع";
    imgBox.appendChild(badge);
  } else if (offer.image) {
    const img = document.createElement("img");
    img.src = offer.image;
    img.onerror = () => { img.style.opacity = "0.3"; };
    imgBox.appendChild(img);

    const del = document.createElement("button");
    del.className = "offer-img-del";
    del.textContent = "✕";
    del.onclick = () => {
      if (!confirm("حذف صورة العرض؟")) return;
      offer.image = "";
      renderOffersSection();
    };
    imgBox.appendChild(del);

    const changeBtn = document.createElement("button");
    changeBtn.className = "offer-img-change";
    changeBtn.textContent = "🔄 تغيير";
    changeBtn.onclick = () => {
      const fi = document.createElement("input");
      fi.type = "file";
      fi.accept = "image/*";
      fi.onchange = (e) => {
        const f = e.target.files[0];
        if (!f) return;
        pendingOffers[offer.id] = f;
        renderOffersSection();
      };
      fi.click();
    };
    imgBox.appendChild(changeBtn);
  } else {
    const addImg = document.createElement("div");
    addImg.className = "offer-img-add";
    addImg.innerHTML = `📷<small>إضافة صورة</small>`;
    addImg.onclick = () => {
      const fi = document.createElement("input");
      fi.type = "file";
      fi.accept = "image/*";
      fi.onchange = (e) => {
        const f = e.target.files[0];
        if (!f) return;
        pendingOffers[offer.id] = f;
        renderOffersSection();
      };
      fi.click();
    };
    imgBox.appendChild(addImg);
  }
  card.appendChild(imgBox);

  const textLbl = document.createElement("div");
  textLbl.className = "offer-text-label";
  textLbl.textContent = "📝 نص العرض:";
  card.appendChild(textLbl);

  const textInput = document.createElement("textarea");
  textInput.className = "offer-text-input";
  textInput.placeholder = "مثال: اشتري كيلو توليفة بن سوبر وعليها 100 جرام بن هدية";
  textInput.value = offer.text || "";
  textInput.oninput = () => { offer.text = textInput.value; };
  card.appendChild(textInput);

  const delBtn = document.createElement("button");
  delBtn.className = "offer-del-btn";
  delBtn.textContent = "🗑️ حذف العرض";
  delBtn.onclick = () => {
    if (!confirm("حذف هذا العرض نهائياً؟")) return;
    delete pendingOffers[offer.id];
    storeData.offers.splice(idx, 1);
    renderOffersSection();
  };
  card.appendChild(delBtn);

  return card;
}

// ============================================================
// الأقسام
// ============================================================
function renderZones() {
  const wrap = $("zonesWrap");
  wrap.innerHTML = "";
  if (!storeData.categories) storeData.categories = [];
  storeData.categories.forEach((cat, idx) => {
    wrap.appendChild(buildZoneCard(cat, idx));
  });
}

function buildZoneCard(cat, idx) {
  const card = document.createElement("div");
  card.className = "card";

  const title = document.createElement("div");
  title.className = "card-title";

  const info = document.createElement("div");
  info.className = "title-info";
  info.innerHTML = `
    <span class="zone-icon">${cat.icon || "☕"}</span>
    <span>${cat.name_ar || "(قسم بدون اسم)"}</span>
    <span class="type-badge">${(cat.products || []).length} منتج</span>
    <span class="toggle-chev">▼</span>
  `;

  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap";

  const visToggle = document.createElement("div");
  visToggle.className = "vis-toggle " + (cat.visible !== false ? "on" : "off");
  visToggle.textContent = cat.visible !== false ? "👁️ ظاهر" : "🚫 مخفي";
  visToggle.onclick = (e) => {
    e.stopPropagation();
    cat.visible = cat.visible === false ? true : false;
    visToggle.className = "vis-toggle " + (cat.visible !== false ? "on" : "off");
    visToggle.textContent = cat.visible !== false ? "👁️ ظاهر" : "🚫 مخفي";
  };

  const delBtn = document.createElement("button");
  delBtn.className = "btn-danger";
  delBtn.textContent = "🗑️ حذف";
  delBtn.onclick = (e) => {
    e.stopPropagation();
    if (!confirm(`متأكد من حذف قسم "${cat.name_ar}"؟`)) return;
    storeData.categories.splice(idx, 1);
    renderZones();
  };

  actions.appendChild(visToggle);
  actions.appendChild(delBtn);
  title.appendChild(info);
  title.appendChild(actions);
  card.appendChild(title);

  const body = document.createElement("div");
  body.className = "zone-body";

  info.onclick = () => {
    body.classList.toggle("open");
    title.querySelector(".toggle-chev").classList.toggle("open");
  };

  body.appendChild(fieldRow("اسم القسم (عربي)", cat.name_ar, (v) => {
    cat.name_ar = v;
    info.querySelector("span:nth-child(2)").textContent = v;
  }));
  body.appendChild(fieldRow("أيقونة (إيموجي)", cat.icon, (v) => {
    cat.icon = v;
    info.querySelector(".zone-icon").textContent = v;
  }));
  body.appendChild(fieldRow("وصف القسم", cat.desc_ar, (v) => { cat.desc_ar = v; }));
  body.appendChild(fieldRow("رابط صورة القسم", cat.homeImg, (v) => { cat.homeImg = v; }));

  const homeImgActions = document.createElement("div");
  homeImgActions.style.cssText = "display:flex;gap:8px;margin-top:10px";
  const uploadHomeBtn = document.createElement("button");
  uploadHomeBtn.className = "btn-secondary";
  uploadHomeBtn.style.fontSize = "0.9rem";
  uploadHomeBtn.textContent = "📤 رفع صورة القسم";
  const homeFile = document.createElement("input");
  homeFile.type = "file";
  homeFile.accept = "image/*";
  homeFile.style.display = "none";
  uploadHomeBtn.onclick = () => homeFile.click();
  homeFile.onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    showLoading("جاري رفع صورة القسم...");
    try {
      const b64 = await compressImage(f, 4 / 3);
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
      const fileName = `cat_${cat.id}_${Date.now()}.${ext}`;
      const url = await uploadImageToGitHub(b64, fileName);
      cat.homeImg = url;
      renderZones();
      showStatus("تم رفع الصورة ✅ لا تنسَ الحفظ", "ok");
    } catch (err) {
      showStatus("فشل الرفع: " + err.message, "err");
    }
    hideLoading();
  };
  homeImgActions.appendChild(uploadHomeBtn);
  homeImgActions.appendChild(homeFile);
  body.appendChild(homeImgActions);

  // مميز
  const bestLabel = document.createElement("label");
  bestLabel.textContent = "هل القسم مميز (يظهر في الأكثر مبيعًا)؟";
  bestLabel.style.marginTop = "18px";
  body.appendChild(bestLabel);

  const bestToggle = document.createElement("div");
  bestToggle.className = "vis-toggle " + (cat.isBestSeller ? "on" : "off");
  bestToggle.textContent = cat.isBestSeller ? "⭐ مميز" : "— عادي";
  bestToggle.style.display = "inline-flex";
  bestToggle.onclick = () => {
    cat.isBestSeller = !cat.isBestSeller;
    bestToggle.className = "vis-toggle " + (cat.isBestSeller ? "on" : "off");
    bestToggle.textContent = cat.isBestSeller ? "⭐ مميز" : "— عادي";
  };
  body.appendChild(bestToggle);

  // Roast Levels Editor
  if (!cat.colors || !Array.isArray(cat.colors) || cat.colors.length === 0) {
    cat.colors = DEFAULT_ROAST_LEVELS.map(r => r.name);
  }
  body.appendChild(buildRoastEditor(cat, renderZones));

  // المنتجات
  const prodsLabel = document.createElement("label");
  prodsLabel.style.cssText = "margin-top:24px;font-size:1.1rem;color:var(--coffee)";
  prodsLabel.textContent = "🛍️ المنتجات:";
  body.appendChild(prodsLabel);

  const prodsWrap = document.createElement("div");
  body.appendChild(prodsWrap);

  function rerender() {
    renderProductsAdmin(prodsWrap, cat, rerender);
    info.querySelector(".type-badge").textContent = (cat.products || []).length + " منتج";
  }
  rerender();

  const addProdBtn = document.createElement("button");
  addProdBtn.className = "btn-add";
  addProdBtn.textContent = "+ إضافة منتج جديد";
  addProdBtn.onclick = () => {
    if (!cat.products) cat.products = [];
    cat.products.push({
      id: uid("p"),
      name_ar: "",
      desc_ar: "",
      images: [],
      colors: cat.colors ? [...cat.colors] : [],
      sizes: []
    });
    rerender();
  };
  body.appendChild(addProdBtn);

  card.appendChild(body);
  return card;
}

// ============================================================
// Roast Editor
// ============================================================
function buildRoastEditor(cat, rerender) {
  const box = document.createElement("div");
  box.className = "roast-editor";

  const lbl = document.createElement("label");
  lbl.textContent = "☕ درجات البن المتاحة في هذا القسم";
  box.appendChild(lbl);

  const hint = document.createElement("p");
  hint.className = "roast-hint";
  hint.textContent = "اضغط على أي درجة لإخفائها/إظهارها. الدرجات دي هي اللي هتظهر للعميل تحت كل منتج.";
  box.appendChild(hint);

  const chipsWrap = document.createElement("div");
  chipsWrap.className = "roast-chips-wrap";

  DEFAULT_ROAST_LEVELS.forEach(r => {
    const btn = document.createElement("button");
    btn.type = "button";
    const isOn = cat.colors.includes(r.name);
    btn.className = "roast-chip-btn " + (isOn ? "on" : "off");
    btn.innerHTML = `<span class="roast-chip-dot" style="background:${r.hex}"></span>${r.name}`;
    btn.onclick = () => {
      const i = cat.colors.indexOf(r.name);
      if (i > -1) cat.colors.splice(i, 1);
      else cat.colors.push(r.name);
      btn.className = "roast-chip-btn " + (cat.colors.includes(r.name) ? "on" : "off");
    };
    chipsWrap.appendChild(btn);
  });

  box.appendChild(chipsWrap);

  const restoreBtn = document.createElement("button");
  restoreBtn.type = "button";
  restoreBtn.className = "btn-secondary";
  restoreBtn.style.cssText = "margin-top:12px;padding:8px 16px;font-size:0.85rem";
  restoreBtn.textContent = "↺ استرجاع كل الدرجات";
  restoreBtn.onclick = () => {
    cat.colors = DEFAULT_ROAST_LEVELS.map(r => r.name);
    rerender();
  };
  box.appendChild(restoreBtn);

  return box;
}

// ============================================================
// حقل مساعد
// ============================================================
function fieldRow(label, value, onChange) {
  const wrap = document.createElement("div");
  const lbl = document.createElement("label");
  lbl.textContent = label;
  const input = document.createElement("input");
  input.type = "text";
  input.value = value || "";
  input.oninput = () => onChange(input.value);
  wrap.appendChild(lbl);
  wrap.appendChild(input);
  return wrap;
}

// ============================================================
// المقاسات (تعبئة البن)
// ============================================================
const SIZE_PRESETS = ["تمن", "ربع", "نص", "كيلو"];

// ============================================================
// عرض المنتجات
// ============================================================
function renderProductsAdmin(container, cat, rerender) {
  container.innerHTML = "";
  if (!cat.products || cat.products.length === 0) {
    const empty = document.createElement("p");
    empty.style.cssText = "text-align:center;color:var(--text-muted);padding:24px;font-size:0.95rem;font-weight:700";
    empty.textContent = "لا توجد منتجات - اضغط على + لإضافة منتج";
    container.appendChild(empty);
    return;
  }
  cat.products.forEach((prod, pIdx) => {
    container.appendChild(buildProductCard(prod, pIdx, cat, rerender));
  });
}

function buildProductCard(prod, pIdx, cat, rerender) {
  const box = document.createElement("div");
  box.className = "item-box";

  const num = document.createElement("div");
  num.className = "item-num";
  num.textContent = "#" + (pIdx + 1);
  box.appendChild(num);

  const acts = document.createElement("div");
  acts.className = "item-actions";
  const delBtn = document.createElement("button");
  delBtn.className = "btn-danger";
  delBtn.textContent = "🗑️ حذف المنتج";
  delBtn.onclick = () => {
    if (!confirm(`حذف "${prod.name_ar || 'المنتج'}"؟`)) return;
    cat.products.splice(pIdx, 1);
    rerender();
  };
  acts.appendChild(delBtn);
  box.appendChild(acts);

  box.appendChild(fieldRow("الاسم (عربي)", prod.name_ar, (v) => { prod.name_ar = v; }));

  // وصف
  const descLbl = document.createElement("label");
  descLbl.textContent = "وصف المنتج (اختياري)";
  box.appendChild(descLbl);
  const descArea = document.createElement("textarea");
  descArea.value = prod.desc_ar || "";
  descArea.rows = 3;
  descArea.oninput = () => { prod.desc_ar = descArea.value; };
  box.appendChild(descArea);

  // مميز
  const bestLabel = document.createElement("label");
  bestLabel.textContent = "منتج مميز (يظهر في الأكثر مبيعًا)؟";
  box.appendChild(bestLabel);

  const bestToggle = document.createElement("div");
  bestToggle.className = "vis-toggle " + (prod.isBestSeller ? "on" : "off");
  bestToggle.textContent = prod.isBestSeller ? "⭐ مميز" : "— عادي";
  bestToggle.style.display = "inline-flex";
  bestToggle.onclick = () => {
    prod.isBestSeller = !prod.isBestSeller;
    bestToggle.className = "vis-toggle " + (prod.isBestSeller ? "on" : "off");
    bestToggle.textContent = prod.isBestSeller ? "⭐ مميز" : "— عادي";
  };
  box.appendChild(bestToggle);

  box.appendChild(buildImagesSection(prod, rerender));
  box.appendChild(buildRoastSection(prod, cat, rerender));
  box.appendChild(buildSizesSection(prod, rerender));

  return box;
}

// ============================================================
// صور المنتج
// ============================================================
function buildImagesSection(prod, rerender) {
  const wrap = document.createElement("div");

  const lbl = document.createElement("label");
  lbl.textContent = "📷 صور المنتج";
  wrap.appendChild(lbl);

  const hint = document.createElement("p");
  hint.style.cssText = "font-size:0.8rem;color:var(--text-muted);margin-bottom:8px;font-weight:700";
  hint.textContent = "ارفع 2-4 صور للمنتج — الأولى هي الرئيسية";
  wrap.appendChild(hint);

  const grid = document.createElement("div");
  grid.className = "images-grid";

  if (!prod.images) prod.images = [];

  function renderImgs() {
    grid.innerHTML = "";

    prod.images.forEach((imgUrl, i) => {
      const cell = document.createElement("div");
      cell.className = "img-cell";
      const thumb = document.createElement("div");
      thumb.className = "img-thumb";
      const img = document.createElement("img");
      img.src = imgUrl;
      img.onerror = () => { img.style.opacity = "0.3"; };
      const del = document.createElement("button");
      del.className = "img-del";
      del.textContent = "✕";
      del.onclick = () => {
        if (!confirm("حذف هذه الصورة؟")) return;
        prod.images.splice(i, 1);
        rerender();
      };
      thumb.appendChild(img);
      thumb.appendChild(del);
      cell.appendChild(thumb);
      grid.appendChild(cell);
    });

    const pending = pendingImages[prod.id] || [];
    pending.forEach((file, i) => {
      const cell = document.createElement("div");
      cell.className = "img-cell";
      const thumb = document.createElement("div");
      thumb.className = "img-thumb";
      thumb.style.borderColor = "var(--gold)";
      const img = document.createElement("img");
      img.src = URL.createObjectURL(file);
      const del = document.createElement("button");
      del.className = "img-del";
      del.textContent = "✕";
      del.onclick = () => {
        pendingImages[prod.id].splice(i, 1);
        if (!pendingImages[prod.id].length) delete pendingImages[prod.id];
        rerender();
      };
      const badge = document.createElement("div");
      badge.style.cssText = "position:absolute;bottom:4px;left:4px;background:var(--gold);color:#fff;font-size:0.7rem;padding:3px 8px;border-radius:6px;font-weight:900";
      badge.textContent = "قيد الرفع";
      thumb.appendChild(img);
      thumb.appendChild(del);
      thumb.appendChild(badge);
      cell.appendChild(thumb);
      grid.appendChild(cell);
    });

    const addBtn = document.createElement("div");
    addBtn.className = "img-add-btn";
    addBtn.innerHTML = `📷<small>إضافة صورة</small>`;
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.multiple = true;
    addBtn.onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
      const files = Array.from(e.target.files);
      if (!files.length) return;
      if (!pendingImages[prod.id]) pendingImages[prod.id] = [];
      files.forEach(f => pendingImages[prod.id].push(f));
      rerender();
    };
    grid.appendChild(addBtn);
    wrap.appendChild(grid);
    wrap.appendChild(fileInput);
  }

  renderImgs();
  return wrap;
}

// ============================================================
// درجات البن داخل المنتج
// ============================================================
function buildRoastSection(prod, cat, rerender) {
  const wrap = document.createElement("div");

  const lbl = document.createElement("label");
  lbl.textContent = "☕ درجات البن المتاحة للمنتج";
  wrap.appendChild(lbl);

  const hint = document.createElement("p");
  hint.style.cssText = "font-size:0.8rem;color:var(--text-muted);margin-bottom:8px;font-weight:700";
  hint.textContent = "اختر الدرجات اللي هتظهر للعميل. لو مش عايز درجات، اقفل الكل.";
  wrap.appendChild(hint);

  if (!prod.colors) prod.colors = [];

  const chipsWrap = document.createElement("div");
  chipsWrap.className = "roast-chips-wrap";

  DEFAULT_ROAST_LEVELS.forEach(r => {
    const isOn = prod.colors.includes(r.name);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "roast-chip-btn " + (isOn ? "on" : "off");
    btn.innerHTML = `<span class="roast-chip-dot" style="background:${r.hex}"></span>${r.name}`;
    btn.onclick = () => {
      const i = prod.colors.indexOf(r.name);
      if (i > -1) prod.colors.splice(i, 1);
      else prod.colors.push(r.name);
      btn.className = "roast-chip-btn " + (prod.colors.includes(r.name) ? "on" : "off");
    };
    chipsWrap.appendChild(btn);
  });

  wrap.appendChild(chipsWrap);
  return wrap;
}

// ============================================================
// المقاسات والأسعار
// ============================================================
function buildSizesSection(prod, rerender) {
  const wrap = document.createElement("div");

  const lbl = document.createElement("label");
  lbl.textContent = "📏 خيارات التعبئة والأسعار";
  wrap.appendChild(lbl);

  const hint = document.createElement("p");
  hint.style.cssText = "font-size:0.8rem;color:var(--text-muted);margin-bottom:8px;font-weight:700";
  hint.textContent = "اضغط على التعبئة لإضافتها وحدد السعر — واملأ خانة سعر العرض فقط لو في خصم";
  wrap.appendChild(hint);

  const selectedWrap = document.createElement("div");
  selectedWrap.className = "selected-sizes";

  if (!prod.sizes) prod.sizes = [];

  if (prod.sizes.length === 0) {
    const emptyMsg = document.createElement("p");
    emptyMsg.style.cssText = "text-align:center;color:#999;font-size:0.9rem;padding:12px;font-weight:700";
    emptyMsg.textContent = "لا توجد خيارات - اختر من الأسفل";
    selectedWrap.appendChild(emptyMsg);
  } else {
    prod.sizes.forEach((sz, i) => {
      const row = document.createElement("div");
      row.className = "selected-size-row";

      const lblSz = document.createElement("span");
      lblSz.className = "sz-label";
      lblSz.textContent = sz.label;

      const priceInput = document.createElement("input");
      priceInput.type = "number";
      priceInput.className = "sz-price-input";
      priceInput.value = sz.price || 0;
      priceInput.placeholder = "السعر";
      priceInput.oninput = () => { prod.sizes[i].price = parseFloat(priceInput.value) || 0; };

      const currency = document.createElement("span");
      currency.style.cssText = "font-weight:900;color:var(--text-muted)";
      currency.textContent = "ج.م";

      const offerInput = document.createElement("input");
      offerInput.type = "number";
      offerInput.className = "sz-price-input";
      offerInput.style.cssText = "border-color:var(--gold);";
      offerInput.value = sz.offerPrice || "";
      offerInput.placeholder = "سعر العرض (اختياري)";
      offerInput.oninput = () => {
        const v = parseFloat(offerInput.value);
        prod.sizes[i].offerPrice = (!isNaN(v) && v > 0) ? v : 0;
      };

      const del = document.createElement("button");
      del.className = "sz-del";
      del.textContent = "✕";
      del.onclick = () => { prod.sizes.splice(i, 1); rerender(); };

      row.appendChild(lblSz);
      row.appendChild(priceInput);
      row.appendChild(currency);
      row.appendChild(offerInput);
      row.appendChild(del);
      selectedWrap.appendChild(row);
    });
  }
  wrap.appendChild(selectedWrap);

  const presetsLbl = document.createElement("p");
  presetsLbl.style.cssText = "font-size:0.9rem;color:var(--coffee-soft);margin-top:16px;margin-bottom:8px;font-weight:900";
  presetsLbl.textContent = "خيارات التعبئة الجاهزة:";
  wrap.appendChild(presetsLbl);

  const chipsWrap = document.createElement("div");
  chipsWrap.className = "size-chips";
  SIZE_PRESETS.forEach(sz => {
    const chip = document.createElement("button");
    chip.className = "size-chip";
    chip.textContent = sz;
    if (prod.sizes.some(s => s.label === sz)) chip.classList.add("selected");
    chip.onclick = () => {
      const existingIdx = prod.sizes.findIndex(s => s.label === sz);
      if (existingIdx !== -1) prod.sizes.splice(existingIdx, 1);
      else prod.sizes.push({ label: sz, price: 0, offerPrice: 0 });
      rerender();
    };
    chipsWrap.appendChild(chip);
  });
  wrap.appendChild(chipsWrap);

  // مخصص
  const customWrap = document.createElement("div");
  customWrap.style.cssText = "display:flex;gap:8px;margin-top:14px";
  const customInput = document.createElement("input");
  customInput.type = "text";
  customInput.placeholder = "خيار مخصص (مثال: 2 كيلو)";
  customInput.style.flex = "1";
  const customBtn = document.createElement("button");
  customBtn.className = "btn-secondary";
  customBtn.textContent = "+ إضافة";
  customBtn.onclick = () => {
    const v = customInput.value.trim();
    if (!v) return;
    if (!prod.sizes.some(s => s.label === v)) prod.sizes.push({ label: v, price: 0, offerPrice: 0 });
    customInput.value = "";
    rerender();
  };
  customWrap.appendChild(customInput);
  customWrap.appendChild(customBtn);
  wrap.appendChild(customWrap);

  return wrap;
}

// ============================================================
// إضافة قسم جديد
// ============================================================
$("addZoneBtn").onclick = () => {
  const name = prompt("اسم القسم بالعربي:");
  if (!name) return;
  const icon = prompt("أيقونة (إيموجي، اختياري):", "☕") || "☕";

  if (!storeData.categories) storeData.categories = [];
  storeData.categories.push({
    id: uid("cat"),
    icon: icon,
    name_ar: name,
    desc_ar: "",
    homeImg: "",
    visible: true,
    isBestSeller: false,
    colors: DEFAULT_ROAST_LEVELS.map(r => r.name),
    products: []
  });

  renderZones();
  showStatus("تم إضافة القسم — لا تنسَ الحفظ 💾", "ok");
};

// ============================================================
// beforeunload
// ============================================================
window.addEventListener("beforeunload", (e) => {
  const hasPending = Object.keys(pendingImages).length > 0
    || pendingFeatured.length > 0
    || Object.keys(pendingOffers).length > 0;
  if (hasPending) { e.preventDefault(); e.returnValue = ""; }
});

console.log("🎛️ Lo'lo'at El-Habashi Admin Panel loaded");