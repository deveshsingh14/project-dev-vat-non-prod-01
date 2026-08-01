/* My account — orders history with a status timeline + editable profile. */

const API_URL = "http://localhost:5000";

function token() { return localStorage.getItem("token"); }
function authHeaders(json) {
  const h = { Authorization: `Bearer ${token()}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}
function esc(v) {
  if (v === null || v === undefined) return "";
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function inr(n) { return "₹" + Number(n || 0).toLocaleString("en-IN"); }
function imgSrc(image) {
  if (!image) return "";
  return image.startsWith("http") ? image : API_URL + image;
}
function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2200);
}
function handle401(res) {
  if (res.status === 401) {
    localStorage.removeItem("token");
    toast("Session expired — please log in again");
    setTimeout(() => (window.location.href = "index.html"), 1200);
    return true;
  }
  return false;
}
function logout() {
  localStorage.removeItem("token");
  window.location.href = "index.html";
}

if (!token()) window.location.href = "index.html";

// ---- tabs ----
function showTab(which) {
  document.getElementById("pane-orders").style.display = which === "orders" ? "block" : "none";
  document.getElementById("pane-profile").style.display = which === "profile" ? "block" : "none";
  document.getElementById("tab-orders").classList.toggle("active", which === "orders");
  document.getElementById("tab-profile").classList.toggle("active", which === "profile");
}

// ---- orders ----
const STEPS = ["Pending", "Shipped", "Delivered"];
function timelineHTML(status) {
  if (status === "Cancelled") {
    return `<div class="timeline cancelled">
      ${STEPS.map(s => `<div class="tl-step"><div class="tl-dot">•</div><div class="tl-label">${s}</div></div>`).join("")}
    </div>
    <p style="font-size:12.5px;color:#cf4b48;font-weight:700;margin:6px 0 0;">This order was cancelled.</p>`;
  }
  const reached = STEPS.indexOf(status);
  return `<div class="timeline">
    ${STEPS.map((s, i) => `
      <div class="tl-step ${i <= reached ? "done" : ""}">
        <div class="tl-dot">${i <= reached ? "✓" : "•"}</div>
        <div class="tl-label">${s}</div>
      </div>`).join("")}
  </div>`;
}
function payPill(o) {
  if (o.paymentStatus === "Paid") return `<span class="pill pl-ok">Paid · ${esc(o.paymentMethod || "COD")}</span>`;
  if (o.paymentStatus === "Refunded") return `<span class="pill pl-mute">Refunded</span>`;
  return `<span class="pill pl-warn">${o.paymentMethod === "UPI" ? "Awaiting UPI payment" : "Pay on delivery"}</span>`;
}
function statusPill(s) {
  const cls = { Delivered: "pl-ok", Shipped: "pl-info", Pending: "pl-warn", Cancelled: "pl-bad" }[s] || "pl-mute";
  return `<span class="pill ${cls}">${esc(s)}</span>`;
}

async function loadOrders() {
  const box = document.getElementById("ordersList");
  try {
    const res = await fetch(`${API_URL}/orders`, { headers: authHeaders() });
    if (handle401(res)) return;
    const orders = await res.json();

    if (!orders.length) {
      box.innerHTML = `<div class="empty-feed"><div class="big">🛍</div>
        <h3>No orders yet</h3><p>Your orders will appear here after checkout.</p>
        <a class="btn-solid" style="flex:none;text-decoration:none;display:inline-block;" href="index.html">Start exploring</a></div>`;
      return;
    }

    box.innerHTML = orders.map(o => `
      <div class="order-card">
        <div class="oc-head">
          <div>
            <div class="oc-id">Order #${o.id}</div>
            <div class="oc-date">Placed ${fmtDate(o.createdAt)} · ${(o.orderItems || []).length} item${(o.orderItems || []).length !== 1 ? "s" : ""}</div>
          </div>
          <div class="oc-badges">
            ${statusPill(o.status)}
            ${payPill(o)}
            <span class="pill pl-mute">${inr(o.totalAmount)}</span>
          </div>
        </div>
        ${timelineHTML(o.status)}
        <div class="oc-items">
          ${(o.orderItems || []).map(i => `
            <div class="sum-line">
              <img src="${esc(imgSrc(i.product?.image))}" alt="">
              <div style="flex:1;min-width:0;">
                <div class="sl-t">${esc(i.product?.title || "Product")}</div>
                <div class="sl-q">Qty ${i.quantity} × ${inr(i.price)}</div>
              </div>
              <div class="sl-p">${inr(i.price * i.quantity)}</div>
            </div>`).join("")}
        </div>
      </div>`).join("");
  } catch (e) {
    console.log(e);
    box.innerHTML = `<div class="empty-feed"><div class="big">⚠</div>Couldn't load your orders.</div>`;
  }
}

// ---- profile ----
async function loadProfile() {
  try {
    const res = await fetch(`${API_URL}/users/me`, { headers: authHeaders() });
    if (handle401(res)) return;
    const me = await res.json();
    document.getElementById("helloTitle").textContent = `Hi, ${me.name?.split(" ")[0] || "there"} ✨`;
    set("pfName", me.name); set("pfEmail", me.email);
    set("pfPhone", me.phone); set("pfAddress", me.address);
    set("pfCity", me.city); set("pfState", me.state); set("pfPincode", me.pincode);
  } catch (e) { console.log(e); }
}
function set(id, v) { document.getElementById(id).value = v || ""; }
function get(id) { return document.getElementById(id).value.trim(); }

async function saveProfile() {
  try {
    const res = await fetch(`${API_URL}/users/me`, {
      method: "PUT", headers: authHeaders(true),
      body: JSON.stringify({
        name: get("pfName"), phone: get("pfPhone"), address: get("pfAddress"),
        city: get("pfCity"), state: get("pfState"), pincode: get("pfPincode")
      })
    });
    if (handle401(res)) return;
    const data = await res.json();
    if (!res.ok) return toast(data.message || "Couldn't save");
    toast("Profile saved ✓");
    document.getElementById("helloTitle").textContent = `Hi, ${data.name?.split(" ")[0]} ✨`;
  } catch (e) { console.log(e); toast("Couldn't reach the server"); }
}

loadOrders();
loadProfile();

