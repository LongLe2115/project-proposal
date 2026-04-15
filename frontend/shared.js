const $ = (id) => document.getElementById(id);

(function () {
  if (typeof window === "undefined") return;
  var loc = window.location;
  if (loc.port === "8000") return;
  if (loc.hostname !== "127.0.0.1" && loc.hostname !== "localhost") return;
  var path = loc.pathname.replace(/^\/frontend/, "") || "/index.html";
  var target = loc.protocol + "//" + loc.hostname + ":8000" + path + loc.search;
  window.location.replace(target);
})();

function getApiBase() {
  if (typeof window !== "undefined" && window.location.port === "8000") return "";
  return "http://127.0.0.1:8000";
}

/** Kiểm tra backend có đang chạy không (GET /health). */
function checkBackendHealth() {
  var url = getApiBase() + "/health";
  return fetch(url, { method: "GET", mode: "cors" })
    .then(function (r) { return r.ok; })
    .catch(function () { return false; });
}

var BACKEND_BANNER_ID = "backend-offline-banner";

function showBackendOfflineBanner() {
  if (document.getElementById(BACKEND_BANNER_ID)) return;
  var banner = document.createElement("div");
  banner.id = BACKEND_BANNER_ID;
  banner.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:9999;background:#dc2626;color:#fff;padding:10px 16px;text-align:center;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:8px;";
  var healthUrl = getApiBase() + "/health";
  banner.innerHTML =
    '<span>Máy chủ backend (port 8000) chưa chạy. Frontend (5500) và backend (8000) dùng 2 port khác nhau — cần chạy cả hai.</span>' +
    '<code style="background:rgba(0,0,0,0.25);padding:4px 8px;border-radius:4px;font-size:12px;">uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000</code>' +
    '<a href="' + healthUrl + '" target="_blank" rel="noopener" style="color:#fff;text-decoration:underline;">Kiểm tra /health</a>' +
    '<button type="button" id="backend-retry-btn" style="padding:6px 14px;background:#fff;color:#dc2626;border:none;border-radius:6px;cursor:pointer;font-weight:600;">Thử lại</button>';
  document.body.appendChild(banner);
  document.getElementById("backend-retry-btn").addEventListener("click", function () {
    var btn = this;
    btn.disabled = true;
    btn.textContent = "Đang kiểm tra...";
    checkBackendHealth().then(function (ok) {
      btn.disabled = false;
      btn.textContent = "Thử lại";
      if (ok) banner.remove();
    });
  });
}

/** Gọi khi load trang: thử 2 lần (lần 2 sau 2 giây) rồi mới hiện banner nếu vẫn lỗi. */
function initBackendCheck() {
  if (getApiBase() === "") return;
  checkBackendHealth().then(function (ok) {
    if (ok) return;
    setTimeout(function () {
      checkBackendHealth().then(function (ok2) {
        if (!ok2) showBackendOfflineBanner();
      });
    }, 2000);
  });
}

function setApiBase(_v) {
  // Giữ cho tương thích, nhưng không còn dùng tới.
}

function parseJwtPayload(token) {
  try {
    var parts = String(token || "").split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
  } catch (_) {
    return null;
  }
}

function isAdminPage() {
  if (typeof window === "undefined") return false;
  var p = (window.location.pathname || "").toLowerCase();
  return p.indexOf("admin-login.html") !== -1 || p.indexOf("admin-dashboard.html") !== -1;
}

function activeTokenKey() {
  return isAdminPage() ? "access_token_admin" : "access_token_user";
}

function getToken() {
  var key = activeTokenKey();
  var scoped = localStorage.getItem(key);
  if (scoped) return scoped;

  // Fallback/migration cho token cũ dùng chung một key.
  var legacy = localStorage.getItem("access_token") || "";
  if (!legacy) return "";
  var payload = parseJwtPayload(legacy);
  var role = payload && payload.role ? String(payload.role) : "";
  if (isAdminPage()) {
    if (role === "admin") {
      localStorage.setItem("access_token_admin", legacy);
      return legacy;
    }
    return "";
  }
  if (role && role !== "admin") {
    localStorage.setItem("access_token_user", legacy);
    return legacy;
  }
  return "";
}

function setToken(token) {
  var key = activeTokenKey();
  if (!token) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, token);
}

/** Token theo trang hiện tại có tồn tại, parse được JWT và chưa hết hạn (theo exp). */
function isUserSessionValid() {
  var token = getToken();
  if (!token) return false;
  var payload = parseJwtPayload(token);
  if (!payload) return false;
  if (payload.exp != null && !isNaN(Number(payload.exp))) {
    if (Date.now() / 1000 >= Number(payload.exp)) return false;
  }
  return true;
}

async function api(path, { method = "GET", body } = {}) {
  const base = getApiBase();
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    const msg =
      err && err.message === "Failed to fetch"
        ? "Không kết nối được máy chủ. Hãy chạy backend: uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000"
        : (err && err.message) || "Lỗi mạng";
    throw Object.assign(new Error(msg), { status: 0, data: { detail: msg } });
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const errMsg = data?.detail || `HTTP ${res.status}`;
    throw Object.assign(new Error(typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg)), {
      status: res.status,
      data,
    });
  }
  return data;
}

/** Gửi multipart/form-data (không set Content-Type để trình duyệt tự thêm boundary). */
async function apiForm(path, formData, { method = "POST" } = {}) {
  const base = getApiBase();
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: formData,
    });
  } catch (err) {
    const msg =
      err && err.message === "Failed to fetch"
        ? "Không kết nối được máy chủ. Hãy chạy backend: uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000"
        : (err && err.message) || "Lỗi mạng";
    throw Object.assign(new Error(msg), { status: 0, data: { detail: msg } });
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const errMsg = data?.detail || `HTTP ${res.status}`;
    throw Object.assign(new Error(typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg)), {
      status: res.status,
      data,
    });
  }
  return data;
}

function parseCommaList(s) {
  return (s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function formatDt(dt) {
  if (!dt) return "";
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return String(dt);
  }
}

function renderList(el, items, renderItem) {
  el.innerHTML = "";
  if (!items?.length) {
    const empty = document.createElement("div");
    empty.className = "item";
    empty.textContent = "No data";
    el.appendChild(empty);
    return;
  }
  for (const it of items) el.appendChild(renderItem(it));
}

