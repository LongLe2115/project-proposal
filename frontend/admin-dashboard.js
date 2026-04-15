(function () {
  "use strict";

  function parseJwt(token) {
    try {
      var parts = token.split(".");
      if (parts.length !== 3) return null;
      return JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    } catch (_) {
      return null;
    }
  }

  var token = getToken();
  var payload = token ? parseJwt(token) : null;
  if (!payload || payload.role !== "admin") {
    setToken(null);
    window.location.href = "./admin-login.html";
    return;
  }

  if (typeof initBackendCheck === "function") initBackendCheck();

  function toast(message, type) {
    var container = document.getElementById("toastContainer");
    if (!container) return;
    var el = document.createElement("div");
    el.className =
      "px-4 py-3 rounded-lg shadow-lg text-sm font-medium " +
      (type === "error" ? "bg-red-600 text-white" : "bg-emerald-600 text-white");
    el.textContent = message;
    container.appendChild(el);
    setTimeout(function () { el.remove(); }, 3500);
  }

  function roleText(role) {
    return { customer: "Khách hàng", admin: "Quản trị" }[role] || role;
  }

  function showView(page) {
    ["Overview", "Users", "Bookings", "Rooms"].forEach(function (name) {
      var el = document.getElementById("view" + name);
      if (el) el.classList.toggle("hidden", name.toLowerCase() !== page);
    });
    document.querySelectorAll(".sidebar-link").forEach(function (link) {
      var active = link.getAttribute("data-page") === page;
      link.classList.toggle("text-white", active);
      link.classList.toggle("bg-white/10", active);
      link.classList.toggle("border-l-4", active);
      link.classList.toggle("border-amber-400", active);
      link.classList.toggle("text-slate-300", !active);
    });
    if (page === "overview") loadOverview();
    if (page === "users") loadUsers();
    if (page === "bookings") loadBookings();
    if (page === "rooms") loadRooms();
  }

  function loadMe() {
    api("/auth/me").then(function (me) {
      var el = document.getElementById("headerAdminEmail");
      if (el) el.textContent = me.email || "Admin";
    }).catch(function () {});
  }

  function loadUsers() {
    var body = document.getElementById("usersTableBody");
    var empty = document.getElementById("usersEmpty");
    if (!body) return;
    body.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-sm text-slate-500">Đang tải...</td></tr>';

    api("/auth/users")
      .then(function (users) {
        users = Array.isArray(users) ? users : [];
        body.innerHTML = "";
        if (empty) empty.classList.toggle("hidden", users.length > 0);
        users.forEach(function (u) {
          var isCurrentUser = String(u.id) === String(payload.sub);
          var tr = document.createElement("tr");
          tr.className = "hover:bg-slate-50";
          tr.innerHTML =
            '<td class="px-4 py-3 text-sm text-slate-700">' + u.id + '</td>' +
            '<td class="px-4 py-3 text-sm text-slate-700">' + (u.email || "") + '</td>' +
            '<td class="px-4 py-3 text-sm text-slate-700">' + (u.name || "") + '</td>' +
            '<td class="px-4 py-3 text-sm text-slate-700">' + roleText(u.role) + '</td>' +
            '<td class="px-4 py-3 text-sm">' +
            (isCurrentUser
              ? '<span class="text-xs text-slate-400 italic">Bản thân</span>'
              : '<button type="button" class="delete-user px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700" data-id="' + u.id + '" data-email="' + (u.email || "") + '">Xóa</button>') +
            '</td>';
          body.appendChild(tr);
        });

        body.querySelectorAll(".delete-user").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var id = btn.getAttribute("data-id");
            var email = btn.getAttribute("data-email") || "người dùng";
            if (!confirm("Xóa tài khoản " + email + "?")) return;
            btn.disabled = true;
            api("/auth/users/" + id, { method: "DELETE" })
              .then(function () {
                toast("Đã xóa tài khoản " + email);
                loadUsers();
              })
              .catch(function (e) {
                btn.disabled = false;
                toast(e && e.message ? e.message : "Không thể xóa tài khoản", "error");
              });
          });
        });
      })
      .catch(function (e) {
        body.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-sm text-red-600">Không tải được danh sách: ' + (e.message || "Lỗi") + '</td></tr>';
      });
  }

  function loadOverview() {
    Promise.all([
      api("/auth/users").catch(function () { return []; }),
      api("/bookings").catch(function () { return []; }),
      api("/rooms").catch(function () { return []; }),
    ]).then(function (results) {
      var users = Array.isArray(results[0]) ? results[0] : [];
      var bookings = Array.isArray(results[1]) ? results[1] : [];
      var rooms = Array.isArray(results[2]) ? results[2] : [];
      var activeBookings = bookings.filter(function (b) { return b.status === "active"; });
      if (document.getElementById("statUsers")) document.getElementById("statUsers").textContent = users.length;
      if (document.getElementById("statBookings")) document.getElementById("statBookings").textContent = activeBookings.length;
      if (document.getElementById("statRooms")) document.getElementById("statRooms").textContent = rooms.length;
    });
  }

  function formatTimeRange(b) {
    try {
      var start = new Date(b.start_at);
      var end = new Date(b.end_at);
      return start.toLocaleString("vi-VN") + " - " + end.toLocaleString("vi-VN");
    } catch (_) {
      return (b.start_at || "") + " - " + (b.end_at || "");
    }
  }

  function loadBookings() {
    var body = document.getElementById("bookingsTableBody");
    var empty = document.getElementById("bookingsEmpty");
    if (!body) return;
    body.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-sm text-slate-500">Đang tải...</td></tr>';
    Promise.all([
      api("/bookings"),
      api("/rooms").catch(function () { return []; }),
    ]).then(function (results) {
      var bookings = Array.isArray(results[0]) ? results[0] : [];
      var rooms = Array.isArray(results[1]) ? results[1] : [];
      var roomMap = {};
      rooms.forEach(function (r) { roomMap[r.id] = r.name; });
      body.innerHTML = "";
      if (empty) empty.classList.toggle("hidden", bookings.length > 0);
      bookings.forEach(function (b) {
        var tr = document.createElement("tr");
        tr.className = "hover:bg-slate-50";
        var cancelBtn =
          b.status === "active"
            ? '<button type="button" class="cancel-booking text-slate-700 hover:underline mr-3" data-id="' +
              b.id +
              '">Hủy đặt</button>'
            : "";
        var deleteBtn =
          '<button type="button" class="delete-booking text-red-600 hover:underline font-medium" data-id="' +
          b.id +
          '">Xóa</button>';
        tr.innerHTML =
          '<td class="px-4 py-3 text-sm text-slate-700">' + (roomMap[b.room_id] || ("Phòng #" + b.room_id)) + '</td>' +
          '<td class="px-4 py-3 text-sm text-slate-700">' + (b.title || "") + '</td>' +
          '<td class="px-4 py-3 text-sm text-slate-700">' + formatTimeRange(b) + '</td>' +
          '<td class="px-4 py-3 text-sm text-slate-700">' + (b.status === "active" ? "Đang dùng" : "Đã hủy") + '</td>' +
          '<td class="px-4 py-3 text-sm whitespace-nowrap">' +
          cancelBtn +
          deleteBtn +
          '</td>';
        body.appendChild(tr);
      });
      body.querySelectorAll(".cancel-booking").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (!confirm("Hủy đặt phòng này?")) return;
          api("/bookings/" + btn.getAttribute("data-id") + "/cancel", { method: "POST" })
            .then(function () {
              toast("Đã hủy đặt phòng.");
              loadBookings();
              loadOverview();
            })
            .catch(function (e) { toast(e.message || "Không thể hủy đặt phòng", "error"); });
        });
      });
      body.querySelectorAll(".delete-booking").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (!confirm("Xóa vĩnh viễn bản ghi đặt phòng này khỏi hệ thống?")) return;
          api("/bookings/" + btn.getAttribute("data-id"), { method: "DELETE" })
            .then(function () {
              toast("Đã xóa đặt phòng.");
              loadBookings();
              loadOverview();
            })
            .catch(function (e) { toast(e.message || "Không thể xóa đặt phòng", "error"); });
        });
      });
    }).catch(function (e) {
      body.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-sm text-red-600">Không tải được đặt phòng: ' + (e.message || "Lỗi") + '</td></tr>';
    });
  }

  function roomPayload() {
    var pr = Number(String(document.getElementById("roomPrice").value || "0").replace(/\s/g, "").replace(",", "."));
    if (!isFinite(pr) || pr < 0) pr = 0;
    return {
      name: (document.getElementById("roomName").value || "").trim(),
      location: (document.getElementById("roomLocation").value || "").trim(),
      capacity: Number(document.getElementById("roomCapacity").value || 1),
      image_url: (document.getElementById("roomImageUrl").value || "").trim(),
      amenities: (document.getElementById("roomAmenities").value || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean),
      status: document.getElementById("roomStatus").value || "active",
      price: pr,
    };
  }

  function formatRoomPrice(n) {
    var x = Number(n);
    if (!isFinite(x)) return "—";
    return x.toLocaleString("vi-VN");
  }

  function openRoomModal(room) {
    document.getElementById("roomId").value = room && room.id ? room.id : "";
    document.getElementById("modalRoomTitle").textContent = room && room.id ? "Sửa phòng" : "Tạo phòng";
    document.getElementById("roomName").value = room && room.name ? room.name : "";
    document.getElementById("roomLocation").value = room && room.location ? room.location : "";
    document.getElementById("roomCapacity").value = room && room.capacity ? room.capacity : 10;
    document.getElementById("roomImageUrl").value = room && room.image_url ? room.image_url : "";
    document.getElementById("roomAmenities").value = room && Array.isArray(room.amenities) ? room.amenities.join(", ") : "";
    document.getElementById("roomPrice").value =
      room && room.price != null && room.price !== "" ? Number(room.price) : 0;
    document.getElementById("roomStatus").value = room && room.status ? room.status : "active";
    var modal = document.getElementById("modalRoom");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }

  function closeRoomModal() {
    var modal = document.getElementById("modalRoom");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }

  function loadRooms() {
    var body = document.getElementById("roomsTableBody");
    var empty = document.getElementById("roomsEmpty");
    if (!body) return;
    body.innerHTML = '<tr><td colspan="8" class="px-4 py-6 text-sm text-slate-500">Đang tải...</td></tr>';
    api("/rooms").then(function (rooms) {
      rooms = Array.isArray(rooms) ? rooms : [];
      body.innerHTML = "";
      if (empty) empty.classList.toggle("hidden", rooms.length > 0);
      rooms.forEach(function (r) {
        var tr = document.createElement("tr");
        tr.className = "hover:bg-slate-50";
        var imgSrc = r.image_url && String(r.image_url).trim();
        var thumb = imgSrc
          ? '<img src="' + imgSrc.replace(/"/g, "&quot;") + '" alt="" class="h-12 w-16 rounded-md object-cover border border-slate-200 bg-slate-50" loading="lazy" onerror="this.replaceWith(document.createTextNode(\'—\'))" />'
          : '<span class="text-slate-400">—</span>';
        tr.innerHTML =
          '<td class="px-4 py-3 text-sm text-slate-700">' + r.id + '</td>' +
          '<td class="px-4 py-3 align-middle">' + thumb + '</td>' +
          '<td class="px-4 py-3 text-sm text-slate-700">' + (r.name || "") + '</td>' +
          '<td class="px-4 py-3 text-sm text-slate-700">' + (r.location || "") + '</td>' +
          '<td class="px-4 py-3 text-sm text-slate-700">' + (r.capacity || "") + '</td>' +
          '<td class="px-4 py-3 text-sm text-slate-700 tabular-nums">' + formatRoomPrice(r.price) + '</td>' +
          '<td class="px-4 py-3 text-sm text-slate-700">' + (r.status === "active" ? "Hoạt động" : "Tạm đóng") + '</td>' +
          '<td class="px-4 py-3 text-sm"><button type="button" class="edit-room text-slate-700 hover:underline mr-3" data-id="' + r.id + '">Sửa</button><button type="button" class="delete-room text-red-600 hover:underline" data-id="' + r.id + '">Xóa</button></td>';
        tr._room = r;
        body.appendChild(tr);
      });
      body.querySelectorAll(".edit-room").forEach(function (btn) {
        btn.addEventListener("click", function () {
          openRoomModal(btn.closest("tr")._room);
        });
      });
      body.querySelectorAll(".delete-room").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (!confirm("Xóa phòng này?")) return;
          api("/rooms/" + btn.getAttribute("data-id"), { method: "DELETE" })
            .then(function () {
              toast("Đã xóa phòng.");
              loadRooms();
              loadOverview();
            })
            .catch(function (e) { toast(e.message || "Không thể xóa phòng", "error"); });
        });
      });
    }).catch(function (e) {
      body.innerHTML = '<tr><td colspan="8" class="px-4 py-6 text-sm text-red-600">Không tải được phòng: ' + (e.message || "Lỗi") + '</td></tr>';
    });
  }

  function openCreateModal() {
    document.getElementById("newUserEmail").value = "";
    document.getElementById("newUserName").value = "";
    document.getElementById("newUserPassword").value = "";
    document.getElementById("newUserRole").value = "customer";
    var modal = document.getElementById("modalCreateUser");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }

  function closeCreateModal() {
    var modal = document.getElementById("modalCreateUser");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }

  document.getElementById("btnAdminLogout").addEventListener("click", function () {
    setToken(null);
    window.location.href = "./admin-login.html";
  });
  var sidebarLogout = document.getElementById("btnSidebarLogout");
  if (sidebarLogout) {
    sidebarLogout.addEventListener("click", function () {
      setToken(null);
      window.location.href = "./admin-login.html";
    });
  }
  document.querySelectorAll(".sidebar-link").forEach(function (link) {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      showView(link.getAttribute("data-page") || "users");
    });
  });
  document.getElementById("btnCreateUser").addEventListener("click", openCreateModal);
  document.getElementById("modalCreateUserCancel").addEventListener("click", closeCreateModal);
  document.getElementById("modalCreateUser").addEventListener("click", function (e) {
    if (e.target === this) closeCreateModal();
  });
  document.getElementById("modalCreateUserConfirm").addEventListener("click", function () {
    var body = {
      email: (document.getElementById("newUserEmail").value || "").trim().toLowerCase(),
      name: (document.getElementById("newUserName").value || "").trim(),
      password: document.getElementById("newUserPassword").value || "",
      role: document.getElementById("newUserRole").value || "customer",
    };
    if (!body.email || !body.name || body.password.length < 6) {
      toast("Nhập đủ email, họ tên và mật khẩu tối thiểu 6 ký tự.", "error");
      return;
    }
    api("/auth/users", { method: "POST", body: body })
      .then(function () {
        closeCreateModal();
        toast("Đã tạo tài khoản.");
        loadUsers();
      })
      .catch(function (e) {
        toast(e && e.message ? e.message : "Tạo tài khoản thất bại", "error");
      });
  });

  var btnCreateRoom = document.getElementById("btnCreateRoom");
  if (btnCreateRoom) btnCreateRoom.addEventListener("click", function () { openRoomModal(null); });
  var btnImportRoomsCsv = document.getElementById("btnImportRoomsCsv");
  var roomCsvFile = document.getElementById("roomCsvFile");
  if (btnImportRoomsCsv && roomCsvFile) {
    btnImportRoomsCsv.addEventListener("click", function () {
      roomCsvFile.click();
    });
    roomCsvFile.addEventListener("change", function (ev) {
      var input = ev.target;
      var f = input.files && input.files[0];
      if (!f) return;
      if (typeof apiForm !== "function") {
        toast("Thiếu apiForm (shared.js).", "error");
        input.value = "";
        return;
      }
      var fd = new FormData();
      fd.append("file", f);
      btnImportRoomsCsv.disabled = true;
      btnImportRoomsCsv.textContent = "Đang import...";
      apiForm("/rooms/import-csv", fd)
        .then(function (res) {
          var msg = "Import xong: tạo " + (res.created || 0) + " phòng.";
          if (res.failed) msg += " Lỗi " + res.failed + " dòng.";
          toast(msg, res.failed ? "error" : undefined);
          if (res.errors && res.errors.length) {
            console.warn(res.errors);
            if (res.errors.length <= 5) {
              alert(res.errors.join("\n"));
            } else {
              alert(res.errors.slice(0, 5).join("\n") + "\n… (xem console)");
            }
          }
          loadRooms();
          loadOverview();
        })
        .catch(function (e) {
          toast(e && e.message ? e.message : "Import thất bại", "error");
        })
        .finally(function () {
          btnImportRoomsCsv.disabled = false;
          btnImportRoomsCsv.textContent = "Import CSV";
          input.value = "";
        });
    });
  }
  var modalRoomCancel = document.getElementById("modalRoomCancel");
  if (modalRoomCancel) modalRoomCancel.addEventListener("click", closeRoomModal);
  var modalRoom = document.getElementById("modalRoom");
  if (modalRoom) modalRoom.addEventListener("click", function (e) {
    if (e.target === modalRoom) closeRoomModal();
  });
  var modalRoomConfirm = document.getElementById("modalRoomConfirm");
  if (modalRoomConfirm) {
    modalRoomConfirm.addEventListener("click", function () {
      var id = document.getElementById("roomId").value;
      var data = roomPayload();
      if (!data.name || !data.location || data.capacity < 1) {
        toast("Nhập đủ tên phòng, vị trí và sức chứa.", "error");
        return;
      }
      var path = id ? "/rooms/" + id : "/rooms";
      var method = id ? "PATCH" : "POST";
      modalRoomConfirm.disabled = true;
      modalRoomConfirm.textContent = "Đang lưu...";
      api(path, { method: method, body: data })
        .then(function () {
          closeRoomModal();
          toast(id ? "Đã cập nhật phòng." : "Đã tạo phòng.");
          loadRooms();
          loadOverview();
        })
        .catch(function (e) {
          var msg = (e && e.message) || "Không thể lưu phòng";
          if (e && e.status) msg = "[HTTP " + e.status + "] " + msg;
          toast(msg, "error");
        })
        .finally(function () {
          modalRoomConfirm.disabled = false;
          modalRoomConfirm.textContent = "Lưu";
        });
    });
  }

  loadMe();
  loadOverview();
  loadUsers();
})();
