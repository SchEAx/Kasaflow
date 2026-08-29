const MAIN_SUPABASE_URL = "https://dmsovrbkoeivkvmlzals.supabase.co";
const MAIN_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtc292cmJrb2Vpdmt2bWx6YWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNTg3NTMsImV4cCI6MjA5MjkzNDc1M30.Tf_8-AEkON4hvKsWiljiDV5z_LJW7KUebIkU-0R8x_A";
const VAPID_PUBLIC_KEY = "BAi5RqXIHt50gvHTCOLT0XJxzW6f8OB_pYt_JN4nOKIIP8Cj9KkUu44hsLRZKLxxOKrZVdPFX_c5qc141bJt4Hc";
const authClient = window.supabase.createClient(MAIN_SUPABASE_URL, MAIN_SUPABASE_KEY);

const VIEWS = {
  "hizli-kayit": { title: "Hızlı Kayıt", kind: "vehicle", tab: "hizliKayit" },
  kayitlar: { title: "Kayıtlar", kind: "vehicle", tab: "liste" },
  "gun-sonu": { title: "Gün Sonu", kind: "vehicle", tab: "gunSonu" },
  siparis: { title: "Sipariş", kind: "vehicle", tab: "siparis" },
  garanti: { title: "Garanti", kind: "vehicle", tab: "garanti" },
  "avans-maas": { title: "Avans & Maaş", kind: "payroll" },
  ayarlar: { title: "Ayarlar", kind: "settings" }
};
const THEMES = new Set(["pembe-seker", "sakiz", "lavanta", "tropik", "mandalina", "gece-pembe"]);
const ALL_VIEW_KEYS = Object.keys(VIEWS);
const DEFAULT_STAFF_VIEWS = ALL_VIEW_KEYS.filter((key) => key !== "ayarlar");
const VEHICLE_URL = "/modules/arac-kabul/index.html?embed=kasa";
const PAYROLL_URL = "/modules/avans-maas/index.html?embed=kasa";

const frame = document.getElementById("moduleFrame");
const viewport = document.getElementById("moduleViewport");
const settingsView = document.getElementById("settingsView");
const loading = document.getElementById("moduleLoading");
const title = document.getElementById("viewTitle");
const toast = document.getElementById("toast");
let activeView = "hizli-kayit";
let pendingVehicleTab = "hizliKayit";
let appStarted = false;
let currentProfile = null;
let allowedViewKeys = new Set(DEFAULT_STAFF_VIEWS);
let staffManagementRows = [];

function authEmailForUsername(username) {
  const slug = String(username || "").trim().toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9._-]+/g, ".").replace(/^\.+|\.+$/g, "");
  return `${slug || "personel"}@garage.local`;
}

function roleLabel(role) {
  return ({ admin: "Admin", depo: "Depo", kasa: "Kasa", satis: "Satış", usta: "Usta" })[role] || role || "Personel";
}

function viewKeysForProfile(profile) {
  if (profile?.role === "admin") return [...ALL_VIEW_KEYS];
  const configured = profile?.permissions?.kasaflowTabs;
  const keys = Array.isArray(configured) ? configured.filter((key) => VIEWS[key] && key !== "ayarlar") : DEFAULT_STAFF_VIEWS;
  if (Array.isArray(configured) && configured.includes("ayarlar")) keys.push("ayarlar");
  return [...new Set(keys.length ? keys : ["hizli-kayit"])];
}

function canOpenView(key) {
  return allowedViewKeys.has(key);
}

function firstAllowedView() {
  return ALL_VIEW_KEYS.find((key) => allowedViewKeys.has(key)) || "hizli-kayit";
}

function applyViewAccess(profile) {
  allowedViewKeys = new Set(viewKeysForProfile(profile));
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("hidden", !allowedViewKeys.has(button.dataset.view)));
  const isAdmin = profile?.role === "admin";
  document.getElementById("notificationButton")?.classList.toggle("hidden", !allowedViewKeys.has("avans-maas"));
  document.getElementById("staffManagementPanel")?.classList.toggle("hidden", !isAdmin);
  if (!allowedViewKeys.has("avans-maas")) document.getElementById("salaryAlert")?.classList.add("hidden");
}

async function loadGlobalProfile() {
  const { data: authData, error: authError } = await authClient.auth.getUser();
  if (authError || !authData?.user) throw authError || new Error("Oturum bulunamadı");
  const { data, error } = await authClient.from("app_users").select("auth_user_id,username,name,role,is_active,permissions").eq("auth_user_id", authData.user.id).single();
  if (error) throw error;
  if (!data?.is_active) throw new Error("Bu personel hesabı pasif");
  return data;
}

function showLogin(message = "") {
  document.getElementById("globalLoginOverlay").classList.remove("hidden");
  document.getElementById("globalAppShell").classList.add("auth-locked");
  document.getElementById("globalLoginError").textContent = message;
  setTimeout(() => document.getElementById("globalLoginUsername")?.focus(), 100);
}

function enterApp(profile) {
  currentProfile = profile;
  applyViewAccess(profile);
  document.getElementById("globalLoginOverlay").classList.add("hidden");
  document.getElementById("globalAppShell").classList.remove("auth-locked");
  document.getElementById("globalUserPill").classList.remove("hidden");
  document.getElementById("globalUserName").textContent = profile.name || profile.username || "Personel";
  document.getElementById("globalUserRole").textContent = roleLabel(profile.role);
  if (!appStarted) {
    appStarted = true;
    const hashView = location.hash.replace("#", "");
    const savedView = localStorage.getItem("kasaflow_active_view");
    const wantedView = VIEWS[hashView] ? hashView : (VIEWS[savedView] ? savedView : "hizli-kayit");
    openView(canOpenView(wantedView) ? wantedView : firstAllowedView(), false);
  }
}

async function initializeAuth() {
  try {
    const { data } = await authClient.auth.getSession();
    if (!data?.session) return showLogin();
    enterApp(await loadGlobalProfile());
  } catch (error) {
    await authClient.auth.signOut({ scope: "local" }).catch(() => {});
    showLogin(error.message || "Oturum açılamadı");
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function setActiveButton(key) {
  document.querySelectorAll(".module-button").forEach((button) => button.classList.toggle("active", button.dataset.view === key));
}

function sendVehicleTab() {
  if (frame.dataset.kind !== "vehicle" || !frame.contentWindow) return;
  frame.contentWindow.postMessage({ type: "kasaflow:set-tab", tab: pendingVehicleTab }, location.origin);
}

function applyTheme(theme, { save = true, notify = true } = {}) {
  const selected = THEMES.has(theme) ? theme : "pembe-seker";
  document.documentElement.dataset.kasaTheme = selected;
  if (save) localStorage.setItem("kasaflow_theme", selected);
  document.querySelectorAll("[data-theme-choice]").forEach((card) => card.classList.toggle("active", card.dataset.themeChoice === selected));
  try { frame.contentWindow.document.documentElement.dataset.kasaTheme = selected; } catch (_) {}
  if (notify) showToast("Tema tüm KasaFlow ekranlarına uygulandı ✨");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function usernameSlug(value) {
  return authEmailForUsername(value).split("@")[0];
}

function setStaffMessage(message = "", type = "") {
  const box = document.getElementById("staffManagementMessage");
  if (!box) return;
  box.textContent = message;
  box.className = `staff-management-message${type ? ` ${type}` : ""}${message ? "" : " hidden"}`;
}

function staffTabs(item) {
  if (item?.role === "admin") return [...ALL_VIEW_KEYS];
  const configured = item?.permissions?.kasaflowTabs;
  if (!Array.isArray(configured)) return [...DEFAULT_STAFF_VIEWS];
  const valid = configured.filter((key) => VIEWS[key]);
  return valid.length ? valid : ["hizli-kayit"];
}

function staffRowTemplate(item = {}) {
  const authUserId = String(item.auth_user_id || "");
  const isNew = !authUserId;
  const role = item.role || "kasa";
  const selectedTabs = new Set(staffTabs({ ...item, role }));
  const isCurrentAdmin = authUserId && authUserId === currentProfile?.auth_user_id;
  return `
    <article class="staff-management-row" data-staff-row data-auth-id="${escapeHtml(authUserId)}">
      <div class="staff-row-heading">
        <div><strong>${isNew ? "Yeni Personel" : escapeHtml(item.name || "Personel")}</strong><small>${isNew ? "Kullanıcı adı otomatik de oluşturulabilir" : `@${escapeHtml(item.username || "-")}`}</small></div>
        <span class="staff-state ${isNew ? "new" : "active"}">${isNew ? "Yeni" : "Aktif"}</span>
      </div>
      <div class="staff-fields">
        <label>Ad Soyad<input data-staff-name value="${escapeHtml(item.name || "")}" placeholder="Örn: Nurhan" /></label>
        <label>Kullanıcı adı<input data-staff-username value="${escapeHtml(item.username || "")}" placeholder="Boşsa addan oluşur" autocomplete="off" /></label>
        <label>Rol<select data-staff-role>
          ${["kasa", "satis", "depo", "usta", "admin"].map((key) => `<option value="${key}" ${role === key ? "selected" : ""}>${roleLabel(key)}</option>`).join("")}
        </select></label>
        <label>Şifre<input data-staff-password type="password" value="" placeholder="${isNew ? "Yeni giriş şifresi" : "Değişmeyecekse boş bırak"}" autocomplete="new-password" /></label>
      </div>
      <div class="staff-permission-head"><div><b>Sekme izinleri</b><small>Bu personelin KasaFlow’da görebileceği alanlar</small></div><div><button type="button" class="mini-action" data-check-all>Hepsini Aç</button><button type="button" class="mini-action" data-clear-all>Temizle</button></div></div>
      <div class="staff-permission-grid">
        ${ALL_VIEW_KEYS.map((key) => `<label class="permission-chip"><input type="checkbox" data-staff-view value="${key}" ${selectedTabs.has(key) ? "checked" : ""} ${role === "admin" ? "disabled" : ""}/><span>${escapeHtml(VIEWS[key].title)}</span></label>`).join("")}
      </div>
      <button type="button" class="deactivate-staff" data-remove-staff ${isCurrentAdmin ? "disabled title=\"Giriş yaptığın Admin hesabı pasife alınamaz\"" : ""}>${isNew ? "Satırı Kaldır" : "Personeli Pasife Al"}</button>
    </article>`;
}

function bindStaffRows() {
  document.querySelectorAll("[data-staff-row]").forEach((row) => {
    if (row.dataset.bound === "1") return;
    row.dataset.bound = "1";
    const roleSelect = row.querySelector("[data-staff-role]");
    const syncRole = () => {
      const admin = roleSelect.value === "admin";
      row.querySelectorAll("[data-staff-view]").forEach((checkbox) => { if (admin) checkbox.checked = true; checkbox.disabled = admin; });
    };
    roleSelect.addEventListener("change", syncRole);
    row.querySelector("[data-check-all]").addEventListener("click", () => row.querySelectorAll("[data-staff-view]:not(:disabled)").forEach((checkbox) => checkbox.checked = true));
    row.querySelector("[data-clear-all]").addEventListener("click", () => row.querySelectorAll("[data-staff-view]:not(:disabled)").forEach((checkbox) => checkbox.checked = false));
    row.querySelector("[data-remove-staff]")?.addEventListener("click", () => {
      if (row.dataset.authId && !confirm("Bu personel pasife alınacak; geçmiş kayıtları silinmeyecek. Devam edilsin mi?")) return;
      row.remove();
      setStaffMessage("Değişikliği tamamlamak için Personelleri Kaydet düğmesine bas.", "info");
    });
    const nameInput = row.querySelector("[data-staff-name]");
    const usernameInput = row.querySelector("[data-staff-username]");
    nameInput.addEventListener("input", () => {
      if (!row.dataset.authId && !usernameInput.dataset.manual) usernameInput.value = usernameSlug(nameInput.value);
    });
    usernameInput.addEventListener("input", () => { usernameInput.dataset.manual = usernameInput.value ? "1" : ""; });
  });
}

function renderStaffManagement() {
  const list = document.getElementById("staffManagementList");
  if (!list) return;
  list.innerHTML = staffManagementRows.length ? staffManagementRows.map(staffRowTemplate).join("") : '<p class="staff-empty">Aktif personel bulunamadı.</p>';
  bindStaffRows();
}

async function loadStaffManagement() {
  if (currentProfile?.role !== "admin") return;
  setStaffMessage("Personeller yükleniyor…", "info");
  try {
    const { data: sessionData } = await authClient.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error("Oturum süresi dolmuş. Tekrar giriş yap.");
    const response = await fetch("/api/staff-admin", { headers: { Authorization: `Bearer ${token}` } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) throw new Error(payload.message || `Personel servisi hata verdi (${response.status})`);
    staffManagementRows = payload.staff || [];
    renderStaffManagement();
    setStaffMessage("");
  } catch (error) {
    setStaffMessage(`Personeller okunamadı: ${error.message || error}`, "error");
  }
}

function addStaffManagementRow() {
  const list = document.getElementById("staffManagementList");
  if (!list) return;
  list.querySelector(".staff-empty")?.remove();
  list.insertAdjacentHTML("beforeend", staffRowTemplate({ role: "kasa", permissions: { kasaflowTabs: [...DEFAULT_STAFF_VIEWS] } }));
  bindStaffRows();
  list.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "center" });
  setStaffMessage("Yeni personelin adı ve şifresini doldur; sekme izinlerini seç.", "info");
}

async function saveStaffManagement() {
  if (currentProfile?.role !== "admin") return showToast("Personel yönetimi yalnızca Admin içindir.");
  const button = document.getElementById("saveStaffManagementBtn");
  if (button?.disabled) return;
  const rows = [...document.querySelectorAll("[data-staff-row]")];
  const staff = [];
  for (const row of rows) {
    const authUserId = row.dataset.authId || null;
    const name = row.querySelector("[data-staff-name]").value.replace(/\s+/g, " ").trim();
    const username = usernameSlug(row.querySelector("[data-staff-username]").value || name);
    const role = row.querySelector("[data-staff-role]").value;
    const password = row.querySelector("[data-staff-password]").value.trim();
    const tabs = role === "admin" ? [...ALL_VIEW_KEYS] : [...row.querySelectorAll("[data-staff-view]:checked")].map((checkbox) => checkbox.value);
    if (!name) return setStaffMessage("Personel adı boş bırakılamaz.", "error");
    if (!authUserId && password.length < 4) return setStaffMessage(`${name} için en az 4 karakterli şifre gir.`, "error");
    if (!tabs.length) return setStaffMessage(`${name} için en az bir sekme izni seç.`, "error");
    const oldItem = staffManagementRows.find((item) => item.auth_user_id === authUserId);
    staff.push({
      authUserId,
      username,
      name,
      role,
      password,
      allowedCategories: oldItem?.allowed_categories || [],
      permissions: { ...(oldItem?.permissions || {}), kasaflowTabs: tabs }
    });
  }
  const duplicate = staff.find((item, index, list) => list.findIndex((other) => other.username === item.username) !== index);
  if (duplicate) return setStaffMessage(`@${duplicate.username} kullanıcı adı iki kez kullanılmış.`, "error");

  const { data: sessionData } = await authClient.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) return setStaffMessage("Oturum süresi dolmuş. Tekrar giriş yap.", "error");
  if (button) { button.disabled = true; button.textContent = "Kaydediliyor…"; }
  setStaffMessage("Auth hesapları ve sekme izinleri kaydediliyor…", "info");
  try {
    const response = await fetch("/api/staff-admin", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ staff }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) throw new Error(payload.message || `Personel servisi hata verdi (${response.status})`);
    await loadStaffManagement();
    showToast("Personeller ve KasaFlow sekme izinleri kaydedildi ✅");
  } catch (error) {
    setStaffMessage(`Kayıt başarısız: ${error.message || error}`, "error");
  } finally {
    if (button) { button.disabled = false; button.textContent = "Personelleri Kaydet"; }
  }
}

function openView(key, pushState = true) {
  if (!VIEWS[key] || !canOpenView(key)) {
    showToast("Bu sekme için yetkin bulunmuyor.");
    key = firstAllowedView();
  }
  const view = VIEWS[key] || VIEWS["hizli-kayit"];
  activeView = VIEWS[key] ? key : "hizli-kayit";
  title.textContent = view.title;
  setActiveButton(activeView);
  const isSettings = view.kind === "settings";
  viewport.classList.toggle("hidden", isSettings);
  settingsView.classList.toggle("hidden", !isSettings);
  document.getElementById("refreshViewButton").classList.toggle("hidden", isSettings);
  if (isSettings && currentProfile?.role === "admin") loadStaffManagement();

  if (view.kind === "vehicle") {
    pendingVehicleTab = view.tab;
    if (frame.dataset.kind === "vehicle") {
      sendVehicleTab();
    } else {
      loading.classList.remove("hidden");
      frame.dataset.kind = "vehicle";
      frame.src = VEHICLE_URL;
    }
  } else if (view.kind === "payroll") {
    if (frame.dataset.kind !== "payroll") {
      loading.classList.remove("hidden");
      frame.dataset.kind = "payroll";
      frame.src = PAYROLL_URL;
    }
  }

  if (pushState) {
    history.replaceState(null, "", `#${activeView}`);
    localStorage.setItem("kasaflow_active_view", activeView);
  }
}

document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => openView(button.dataset.view)));
document.querySelectorAll("[data-open-payroll]").forEach((button) => button.addEventListener("click", () => openView("avans-maas")));
document.querySelectorAll("[data-theme-choice]").forEach((button) => button.addEventListener("click", () => applyTheme(button.dataset.themeChoice)));
document.getElementById("addStaffManagementBtn")?.addEventListener("click", addStaffManagementRow);
document.getElementById("saveStaffManagementBtn")?.addEventListener("click", saveStaffManagement);
document.getElementById("reloadStaffManagementBtn")?.addEventListener("click", loadStaffManagement);

frame.addEventListener("load", () => {
  loading.classList.add("hidden");
  applyTheme(localStorage.getItem("kasaflow_theme") || "pembe-seker", { save: false, notify: false });
  if (frame.dataset.kind === "vehicle") sendVehicleTab();
});

document.getElementById("refreshViewButton").addEventListener("click", () => {
  if (!frame.src) return;
  loading.classList.remove("hidden");
  frame.contentWindow.location.reload();
});

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from([...atob(base64)].map((character) => character.charCodeAt(0)));
}

document.getElementById("notificationButton").addEventListener("click", async () => {
  if (!("Notification" in window)) return showToast("Bu cihaz tarayıcı bildirimlerini desteklemiyor.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return showToast("Bildirim izni verilmedi.");
  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager?.getSubscription();
    if (!subscription && registration.pushManager) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
    if (subscription) {
      const response = await fetch("/api/subscribe-push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription) });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || "Push kaydı yapılamadı");
    }
    localStorage.setItem("kasaflow_salary_notifications", "1");
    localStorage.setItem("garageflow_salary_notifications", "1");
    showToast("09:00–10:00 maaş bildirimleri açıldı 🔔");
    window.dispatchEvent(new CustomEvent("kasaflow:check-payroll", { detail: { force: true } }));
  } catch (error) {
    console.warn(error);
    showToast("Bildirim izni açık; arka plan kaydı tamamlanamadı.");
  }
});

window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || !event.data) return;
  if (event.data.type === "kasaflow:ready") sendVehicleTab();
  if (event.data.type === "garageflow:toast" && event.data.message) showToast(event.data.message);
  if (event.data.type === "garageflow:payroll-due") {
    const badge = document.getElementById("salaryNavBadge");
    badge.textContent = String(event.data.count || 0);
    badge.classList.toggle("hidden", !event.data.count || !canOpenView("avans-maas"));
  }
  if (event.data.type === "garageflow:auth-required") showLogin("Oturum süresi doldu. Tekrar giriş yap.");
});

document.getElementById("globalLoginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = document.getElementById("globalLoginUsername").value.trim();
  const password = document.getElementById("globalLoginPassword").value;
  const button = document.getElementById("globalLoginButton");
  const errorBox = document.getElementById("globalLoginError");
  if (!username || !password) return void (errorBox.textContent = "Kullanıcı adı ve şifre gerekli.");
  button.disabled = true;
  button.textContent = "Giriş yapılıyor…";
  errorBox.textContent = "";
  try {
    const { error } = await authClient.auth.signInWithPassword({ email: authEmailForUsername(username), password });
    if (error) throw error;
    const profile = await loadGlobalProfile();
    document.getElementById("globalLoginPassword").value = "";
    enterApp(profile);
    showToast(`Hoş geldin ${profile.name || profile.username} 🌸`);
  } catch (error) {
    await authClient.auth.signOut({ scope: "local" }).catch(() => {});
    errorBox.textContent = error?.message === "Invalid login credentials" ? "Kullanıcı adı veya şifre hatalı." : (error.message || "Giriş yapılamadı.");
  } finally {
    button.disabled = false;
    button.textContent = "Giriş Yap";
  }
});

document.getElementById("globalLogoutButton").addEventListener("click", async () => {
  await authClient.auth.signOut();
  frame.src = "about:blank";
  frame.dataset.kind = "";
  currentProfile = null;
  allowedViewKeys = new Set(DEFAULT_STAFF_VIEWS);
  appStarted = false;
  showLogin("Oturum kapatıldı.");
});

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js?v=1.1.0").catch(console.warn));

applyTheme(localStorage.getItem("kasaflow_theme") || "pembe-seker", { save: false, notify: false });
window.KasaFlow = { openView, applyTheme, showToast, canOpenView };
initializeAuth();
