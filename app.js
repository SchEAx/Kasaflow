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

function authEmailForUsername(username) {
  const slug = String(username || "").trim().toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9._-]+/g, ".").replace(/^\.+|\.+$/g, "");
  return `${slug || "personel"}@garage.local`;
}

function roleLabel(role) {
  return ({ admin: "Admin", depo: "Depo", kasa: "Kasa", satis: "Satış", usta: "Usta" })[role] || role || "Personel";
}

async function loadGlobalProfile() {
  const { data: authData, error: authError } = await authClient.auth.getUser();
  if (authError || !authData?.user) throw authError || new Error("Oturum bulunamadı");
  const { data, error } = await authClient.from("app_users").select("auth_user_id,username,name,role,is_active").eq("auth_user_id", authData.user.id).single();
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
  document.getElementById("globalLoginOverlay").classList.add("hidden");
  document.getElementById("globalAppShell").classList.remove("auth-locked");
  document.getElementById("globalUserPill").classList.remove("hidden");
  document.getElementById("globalUserName").textContent = profile.name || profile.username || "Personel";
  document.getElementById("globalUserRole").textContent = roleLabel(profile.role);
  if (!appStarted) {
    appStarted = true;
    const hashView = location.hash.replace("#", "");
    const savedView = localStorage.getItem("kasaflow_active_view");
    openView(VIEWS[hashView] ? hashView : (VIEWS[savedView] ? savedView : "hizli-kayit"), false);
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

function openView(key, pushState = true) {
  const view = VIEWS[key] || VIEWS["hizli-kayit"];
  activeView = VIEWS[key] ? key : "hizli-kayit";
  title.textContent = view.title;
  setActiveButton(activeView);
  const isSettings = view.kind === "settings";
  viewport.classList.toggle("hidden", isSettings);
  settingsView.classList.toggle("hidden", !isSettings);
  document.getElementById("refreshViewButton").classList.toggle("hidden", isSettings);

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
    badge.classList.toggle("hidden", !event.data.count);
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
  appStarted = false;
  showLogin("Oturum kapatıldı.");
});

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js?v=1.0.0").catch(console.warn));

applyTheme(localStorage.getItem("kasaflow_theme") || "pembe-seker", { save: false, notify: false });
window.KasaFlow = { openView, applyTheme, showToast };
initializeAuth();
