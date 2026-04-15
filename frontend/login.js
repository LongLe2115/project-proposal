if (typeof initBackendCheck === "function") initBackendCheck();

const accountTitle = document.getElementById("accountTitle");
for (const t of document.querySelectorAll(".account-tab")) {
  t.addEventListener("click", () => {
    document.querySelectorAll(".account-tab").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    const tab = t.dataset.tab;
    $("tab-login").classList.toggle("hidden", tab !== "login");
    $("tab-register").classList.toggle("hidden", tab !== "register");
    if (accountTitle) accountTitle.textContent = tab === "login" ? "Đăng nhập" : "Đăng ký tài khoản";
  });
}

$("forgotPassword")?.addEventListener("click", (e) => {
  e.preventDefault();
  alert("Chức năng quên mật khẩu chưa được triển khai.");
});

// Chọn tab ban đầu theo query ?tab=login|register
(() => {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab");
  if (tab === "register") {
    const registerTab = Array.from(document.querySelectorAll(".account-tab")).find(
      (el) => el.dataset.tab === "register"
    );
    if (registerTab) {
      registerTab.click();
    }
  }
})();

// Tự điền "Họ tên" = phần trước @ khi nhập email (có thể sửa)
$("regEmail").addEventListener("blur", () => {
  const email = ($("regEmail").value || "").trim();
  const nameEl = $("regName");
  if (nameEl && email && email.includes("@") && !(nameEl.value || "").trim()) {
    nameEl.value = email.split("@")[0];
  }
});

$("btnRegister").addEventListener("click", async () => {
  try {
    const name = ($("regName").value || "").trim();
    const email = ($("regEmail").value || "").trim().toLowerCase();
    const password = $("regPassword").value || "";
    if (!email) { alert("Vui lòng nhập email @gmail.com."); return; }
    if (!email.endsWith("@gmail.com")) { alert("Chỉ chấp nhận email @gmail.com."); return; }
    if (password.length < 6) { alert("Mật khẩu tối thiểu 6 ký tự."); return; }
    const body = { name, email, password, role: "customer" };
    await api("/auth/register", { method: "POST", body });
    alert("Đăng ký thành công. Hãy đăng nhập bằng email và mật khẩu vừa nhập.");
  } catch (e) {
    console.error("Register error", e);
    const serverDetail =
      e?.data?.detail && Array.isArray(e.data.detail)
        ? e.data.detail.map((d) => (d.msg || JSON.stringify(d))).join("\n")
        : e?.data?.detail || "";
    alert("Đăng ký thất bại:\n" + (serverDetail || e?.message || "Lỗi không xác định"));
  }
});

$("btnLogin").addEventListener("click", async () => {
  try {
    const email = ($("loginEmail").value || "").trim().toLowerCase();
    const password = $("loginPassword").value || "";
    if (!email) { alert("Vui lòng nhập email."); return; }
    if (!password) { alert("Vui lòng nhập mật khẩu."); return; }
    const body = { email, password };
    const tok = await api("/auth/login", { method: "POST", body });
    setToken(tok.access_token);
    const redirect = new URLSearchParams(window.location.search).get("redirect");
    window.location.href = redirect || "./dashboard.html";
  } catch (e) {
    var msg = "Đăng nhập thất bại: " + (e?.message || "Lỗi không xác định");
    var detail = e?.data?.detail;
    if (detail && typeof detail === "string") msg += "\n" + detail;
    else if (detail && Array.isArray(detail)) msg += "\n" + detail.map(function (d) { return d.msg || JSON.stringify(d); }).join("\n");
    msg += "\n\n• Dùng tài khoản quản lý? Đăng nhập tại trang Quản trị (admin-login.html).";
    alert(msg);
  }
});
