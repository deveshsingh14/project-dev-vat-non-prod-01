/* ============================================================
   Delivery partner portal
     Ready to pick up  -> Shipped orders nobody has taken yet
     My deliveries     -> Out for Delivery / Attempted orders I carry
   Status flow and rules are enforced by the backend
   (PATCH /orders/:id/delivery-status); this page only offers the
   buttons that make sense for each order.
   Needs api.js (API_URL, esc, inr, authHeaders, toast, beforeLogout).
   ============================================================ */

let me = null;
let deliveries = [];

const ALLOWED_ROLES = ["DELIVERY_PARTNER", "ADMIN", "OWNER"];

// Page navigation (a seam so tests can observe redirects).
const nav = { to(url) { window.location.assign(url); } };

async function boot() {
  const t = localStorage.getItem("token");
  if (!t) { window.localStorage.removeItem("token"); return nav.to("index.html"); }

  try {
    const res = await fetch(`${API_URL}/users/me`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`users/me ${res.status}`);
    me = await res.json();
    if (!ALLOWED_ROLES.includes(me.role)) throw new Error("Unauthorized");
  } catch (e) {
    localStorage.removeItem("token");
    return nav.to("index.html");
  }

  const hello = document.getElementById("partnerName");
  if (hello) hello.textContent = me.name ? `Hi, ${me.name.split(" ")[0]}` : "";
  loadDeliveries();
}

async function loadDeliveries() {
  try {
    const res = await fetch(`${API_URL}/orders/delivery`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`orders/delivery ${res.status}`);
    deliveries = await res.json();
    renderDeliveries();
  } catch (e) {
    console.error("Error loading deliveries", e);
    document.getElementById("deliveriesContainer").innerHTML =
      `<p class="dl-empty dl-error">Couldn't load deliveries. Pull to refresh or try again.</p>`;
  }
}

function isMine(o) { return !!me && o.deliveryPartnerId === me.id; }

// Cash to collect at the door: only unpaid cash-on-delivery orders.
function cashToCollect(o) {
  return o.paymentMethod === "COD" && o.paymentStatus !== "Paid" ? Number(o.totalAmount) || 0 : 0;
}

function actionsFor(o) {
  const btn = (status, label, cls = "") =>
    `<button class="btn-update ${cls}" data-id="${Number(o.id)}" data-status="${esc(status)}">${esc(label)}</button>`;
  if (o.status === "Shipped") return btn("Out for Delivery", "Pick up · out for delivery");
  if (o.status === "Attempted" && (isMine(o) || !o.deliveryPartnerId)) return btn("Out for Delivery", "Try again · out for delivery");
  if (o.status === "Out for Delivery" && (isMine(o) || !o.deliveryPartnerId || me?.role !== "DELIVERY_PARTNER")) {
    return btn("Delivered", "Mark delivered") + btn("Attempted", "Couldn't deliver", "btn-warn");
  }
  if (o.deliveryPartner && !isMine(o)) return `<p class="dl-note">With ${esc(o.deliveryPartner.name || "another partner")}</p>`;
  return "";
}

function cardHTML(o) {
  const address = [o.address, o.city, o.state].filter(Boolean).join(", ") + (o.pincode ? ` - ${o.pincode}` : "");
  const items = (o.orderItems || []).map(i => `${esc(i.title || i.product?.title || "Item")} × ${Number(i.quantity) || 0}`).join(", ");
  const cash = cashToCollect(o);
  const tel = String(o.phone || "").replace(/[^\d+]/g, "");
  const maps = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : "";
  return `
    <div class="card" data-order="${Number(o.id)}">
      <h3>Order #${Number(o.id)} <span class="status-badge status-${esc(String(o.status).replace(/\s+/g, "-"))}">${esc(o.status)}</span></h3>
      <p><strong>Customer:</strong> ${esc(o.fullName || "N/A")}</p>
      <p><strong>Phone:</strong> ${tel ? `<a href="tel:${esc(tel)}">${esc(o.phone)}</a>` : "N/A"}</p>
      <p><strong>Address:</strong> ${address ? esc(address) : "N/A"}
        ${maps ? ` · <a href="${esc(maps)}" target="_blank" rel="noopener">Map</a>` : ""}</p>
      ${items ? `<p><strong>Items:</strong> ${items}</p>` : ""}
      <p class="dl-cash ${cash ? "due" : "paid"}"><strong>${cash ? "Collect cash:" : "Payment:"}</strong>
        ${cash ? esc(inr(cash)) : `${esc(o.paymentMethod || "")} · ${esc(o.paymentStatus || "")}`}</p>
      <div class="dl-actions">${actionsFor(o)}</div>
    </div>`;
}

function renderDeliveries() {
  const container = document.getElementById("deliveriesContainer");
  if (!deliveries.length) {
    container.innerHTML = `<p class="dl-empty">No deliveries right now. New shipped orders will appear here.</p>`;
    return;
  }
  const ready = deliveries.filter(o => o.status === "Shipped");
  const mine = deliveries.filter(o => o.status !== "Shipped");
  const section = (title, list, empty) => `
    <h2 class="dl-section">${esc(title)} <span>${list.length}</span></h2>
    ${list.length ? list.map(cardHTML).join("") : `<p class="dl-empty">${esc(empty)}</p>`}`;
  container.innerHTML =
    section(me && me.role === "DELIVERY_PARTNER" ? "My deliveries" : "On the road", mine, "Nothing on the road.") +
    section("Ready to pick up", ready, "No orders waiting for pickup.");
}

// One listener for all action buttons (no inline handlers with data in them).
document.getElementById("deliveriesContainer").addEventListener("click", e => {
  const b = e.target.closest("button[data-status]");
  if (b) updateStatus(Number(b.dataset.id), b.dataset.status);
});

async function updateStatus(orderId, newStatus) {
  const o = deliveries.find(d => d.id === orderId);
  const cash = o ? cashToCollect(o) : 0;
  const question = newStatus === "Delivered" && cash
    ? `Mark order #${orderId} as delivered and ${inr(cash)} cash collected?`
    : `Mark order #${orderId} as "${newStatus}"?`;
  if (!confirm(question)) return;

  try {
    const res = await fetch(`${API_URL}/orders/${orderId}/delivery-status`, {
      method: "PATCH",
      headers: authHeaders(true),
      body: JSON.stringify({ status: newStatus })
    });
    if (res.ok) {
      toast(`Order #${orderId}: ${newStatus}`);
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.message || "Failed to update status", "err");
    }
  } catch (e) {
    console.error(e);
    toast("Something went wrong", "err");
  }
  loadDeliveries(); // always refresh: another partner may have taken it
}

async function logout() {
  if (typeof beforeLogout === "function") await beforeLogout();
  localStorage.removeItem("token");
  nav.to("index.html");
}

boot();

if (typeof module !== "undefined") {
  module.exports = { nav, updateStatus, boot, loadDeliveries, renderDeliveries, logout, cashToCollect, actionsFor,
    _setMe: m => { me = m; }, _setDeliveries: d => { deliveries = d; } };
}
