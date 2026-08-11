/* ============================================================
   Rajeshwari Admin — dashboard logic (self-contained)
   Works against the existing backend:
     GET  /products                 GET  /orders/admin/all
     POST /products                 PUT  /orders/:id/status
     PUT  /products/:id             GET  /categories
     DELETE /products/:id           POST /categories
     POST /products/upload          DELETE /categories/:id
     GET  /users  (new userRoutes)  GET /users/:id/orders
   ============================================================ */

const API_URL = "https://project-dev-vat-non-prod-01.onrender.com";
const LOW_STOCK = 5;

// ---------- auth guard ----------
const token = localStorage.getItem("token");
let adminUser = null;
try {
  adminUser = JSON.parse(atob(token.split(".")[1]));
} catch (e) { /* invalid token */ }

if (!token || !adminUser || (adminUser.role !== "ADMIN" && adminUser.role !== "OWNER")) {
  alert("Admin or Owner access required. Please sign in with an authorized account.");
  window.location.href = "index.html";
}

// ---------- state ----------
let PRODUCTS = [];
let ORDERS = [];
let CUSTOMERS = [];
let CATEGORIES = [];
let productById = {};
let charts = {};

// ---------- helpers ----------
function esc(v) {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function inr(n) { return "₹" + Number(n || 0).toLocaleString("en-IN"); }
// ADDED: uploaded images are stored as relative paths (/uploads/xyz.jpg).
// Prefix the API origin so they load from the backend, not this page's origin.
function imgSrc(image) {
  if (!image) return "";
  return image.startsWith("http") ? image : API_URL + image;
}
function shortDate(d) { return d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }) : "—"; }
function authHeaders(json) {
  const h = { Authorization: `Bearer ${token}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}
async function api(path, opts) {
  const res = await fetch(`${API_URL}${path}`, opts);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}
function toast(msg, kind = "ok") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "show " + kind;
  setTimeout(() => (t.className = kind), 2200);
}
function statusBadge(s) {
  const map = { Delivered: "b-ok", Shipped: "b-info", Pending: "b-warn", Cancelled: "b-bad" };
  return `<span class="badge ${map[s] || "b-mute"}">${esc(s || "—")}</span>`;
}
function stockBadge(stock) {
  if (stock <= 0) return `<span class="badge b-bad">Out of stock</span>`;
  if (stock <= LOW_STOCK) return `<span class="badge b-warn">Low</span>`;
  return `<span class="badge b-ok">In stock</span>`;
}
function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(cell => {
    const s = String(cell ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ---------- navigation ----------
const titles = {
  dashboard: ["Overview", "Dashboard"], reports: ["Overview", "Reports"],
  products: ["Catalog", "Products"], addProduct: ["Catalog", "Add product"],
  categories: ["Catalog", "Categories"], orders: ["Commerce", "Orders"],
  payments: ["Commerce", "Payments"], customers: ["Commerce", "Customers"]
};
function showView(view) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById("view-" + view)?.classList.add("active");
  document.querySelectorAll(".nav-item").forEach(n =>
    n.classList.toggle("active", n.dataset.view === view));
  const [crumb, title] = titles[view] || ["", ""];
  document.getElementById("crumb").textContent = crumb;
  document.getElementById("pageTitle").textContent = title;
  document.getElementById("sidebar").classList.remove("open");
  if (view === "reports") runReport();
}
document.querySelectorAll("[data-view]").forEach(el =>
  el.addEventListener("click", () => showView(el.dataset.view)));
function toggleSidebar() { document.getElementById("sidebar").classList.toggle("open"); }
function adminLogout() { localStorage.removeItem("token"); window.location.href = "index.html"; }

// ============================================================
//  DATA LOADING
// ============================================================
async function loadAll() {
  try {
    const [products, orders, customers, categories] = await Promise.all([
      api("/products"),
      api("/orders/admin/all", { headers: authHeaders() }),
      api("/users", { headers: authHeaders() }).catch(() => []),
      api("/categories")
    ]);
    PRODUCTS = products || [];
    ORDERS = orders || [];
    CUSTOMERS = customers || [];
    CATEGORIES = categories || [];
    productById = {};
    PRODUCTS.forEach(p => (productById[p.id] = p));

    renderDashboard();
    renderProducts();
    renderCategories();
    renderOrders();
    renderPayments();
    renderCustomers();
    populateCategoryFilters();
  } catch (err) {
    console.log(err);
    toast("Couldn't load data — is the API running?", "err");
  }
}

// ============================================================
//  DASHBOARD
// ============================================================
function revenueOf(orders) {
  return orders.filter(o => o.status !== "Cancelled")
    .reduce((s, o) => s + o.totalAmount, 0);
}
function renderDashboard() {
  const live = ORDERS.filter(o => o.status !== "Cancelled");
  const revenue = revenueOf(ORDERS);
  const aov = live.length ? Math.round(revenue / live.length) : 0;
  const lowStock = PRODUCTS.filter(p => p.stock <= LOW_STOCK);

  const kpis = [
    { label: "Revenue", value: revenue, cur: true, foot: `${live.length} paid orders` },
    { label: "Orders", value: ORDERS.length, foot: `${live.length} active` },
    { label: "Customers", value: CUSTOMERS.length, foot: "registered accounts" },
    { label: "Products", value: PRODUCTS.length, foot: `${CATEGORIES.length} categories` },
    { label: "Avg order value", value: aov, cur: true, foot: "excl. cancelled" },
    { label: "Low stock", value: lowStock.length, alert: lowStock.length > 0, foot: `≤ ${LOW_STOCK} units` }
  ];
  document.getElementById("kpiGrid").innerHTML = kpis.map(k => `
    <div class="kpi ${k.alert ? "alert" : ""}">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value">${k.cur ? '<span class="cur">₹</span>' : ""}${Number(k.value).toLocaleString("en-IN")}</div>
      <div class="kpi-foot">${k.foot}</div>
    </div>`).join("");

  drawRevenueChart(14);
  drawStatusChart();

  // recent orders
  const recent = [...ORDERS].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6);
  document.querySelector("#recentOrdersTable tbody").innerHTML = recent.length
    ? recent.map(o => `
      <tr>
        <td class="cell-strong">#${o.id}</td>
        <td>${esc(o.fullName || o.user?.name || "—")}</td>
        <td class="num">${inr(o.totalAmount)}</td>
        <td>${statusBadge(o.status)}</td>
        <td class="cell-sub">${shortDate(o.createdAt)}</td>
      </tr>`).join("")
    : emptyRow(5, "No orders yet");

  // low stock
  document.getElementById("lowStockCount").textContent = lowStock.length;
  document.querySelector("#lowStockTable tbody").innerHTML = lowStock.length
    ? lowStock.sort((a, b) => a.stock - b.stock).slice(0, 8).map(p => `
      <tr>
        <td class="row-flex"><img class="thumb" src="${esc(imgSrc(p.image))}" alt=""><span class="cell-strong">${esc(p.title)}</span></td>
        <td class="num"><span class="badge ${p.stock <= 0 ? "b-bad" : "b-warn"}">${p.stock}</span></td>
      </tr>`).join("")
    : emptyRow(2, "Everything well stocked ✦");
}
function emptyRow(cols, msg) {
  return `<tr><td colspan="${cols}"><div class="empty"><div class="big">✦</div>${esc(msg)}</div></td></tr>`;
}

// buckets orders into the last `days` days
function dailyRevenue(days) {
  const labels = [], data = [];
  const map = {};
  ORDERS.filter(o => o.status !== "Cancelled").forEach(o => {
    const key = new Date(o.createdAt).toISOString().slice(0, 10);
    map[key] = (map[key] || 0) + o.totalAmount;
  });
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    labels.push(d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }));
    data.push(map[key] || 0);
  }
  return { labels, data };
}
function drawRevenueChart(days) {
  if (typeof Chart === "undefined") return;
  const { labels, data } = dailyRevenue(days);
  const ctx = document.getElementById("revenueChart");
  charts.revenue?.destroy();
  const grad = ctx.getContext("2d").createLinearGradient(0, 0, 0, 260);
  grad.addColorStop(0, "rgba(193,150,60,.28)");
  grad.addColorStop(1, "rgba(193,150,60,0)");
  charts.revenue = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ data, fill: true, backgroundColor: grad,
      borderColor: "#c1963c", borderWidth: 2, tension: .35, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: "#7a1f3d" }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => inr(c.parsed.y) } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#8b8290", maxRotation: 0, autoSkipPadding: 16 } },
        y: { grid: { color: "#f0ebe3" }, ticks: { color: "#8b8290", callback: v => "₹" + v } }
      }
    }
  });
}
function drawStatusChart() {
  if (typeof Chart === "undefined") return;
  const order = ["Pending", "Shipped", "Delivered", "Cancelled"];
  const colors = { Pending: "#c98a1e", Shipped: "#3f6bb0", Delivered: "#2f9e6f", Cancelled: "#cf4b48" };
  const counts = order.map(s => ORDERS.filter(o => o.status === s).length);
  const ctx = document.getElementById("statusChart");
  charts.status?.destroy();
  if (ORDERS.length === 0) return;
  charts.status = new Chart(ctx, {
    type: "doughnut",
    data: { labels: order, datasets: [{ data: counts, backgroundColor: order.map(s => colors[s]), borderWidth: 0, hoverOffset: 6 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: "64%",
      plugins: { legend: { position: "bottom", labels: { color: "#2b2430", boxWidth: 10, padding: 14, font: { size: 12 } } } } }
  });
}
// revenue range toggle
document.getElementById("revRange").addEventListener("click", e => {
  const btn = e.target.closest("button"); if (!btn) return;
  document.querySelectorAll("#revRange button").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  drawRevenueChart(Number(btn.dataset.days));
});

// ============================================================
//  PRODUCTS
// ============================================================
function populateCategoryFilters() {
  const sel = document.getElementById("productCategoryFilter");
  sel.innerHTML = `<option value="">All categories</option>` +
    CATEGORIES.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("");

  const boxes = CATEGORIES.map(c => `
    <label class="cat-option"><input type="checkbox" value="${c.id}"> ${esc(c.name)}</label>`).join("");
  document.getElementById("productCategoryOptions").innerHTML = boxes || `<span class="cell-sub">Create a category first.</span>`;
}
function filteredProducts() {
  const q = document.getElementById("productSearch").value.toLowerCase().trim();
  const cat = document.getElementById("productCategoryFilter").value;
  const stock = document.getElementById("productStockFilter").value;
  return PRODUCTS.filter(p => {
    if (q && !(`${p.title} ${p.keywords || ""}`.toLowerCase().includes(q))) return false;
    if (cat && !(p.categories || []).some(c => String(c.category.id) === cat)) return false;
    if (stock === "in" && p.stock <= LOW_STOCK) return false;
    if (stock === "low" && !(p.stock > 0 && p.stock <= LOW_STOCK)) return false;
    if (stock === "out" && p.stock > 0) return false;
    return true;
  });
}
function renderProducts() {
  const rows = filteredProducts();
  document.querySelector("#productsTable tbody").innerHTML = rows.length
    ? rows.map(p => `
      <tr>
        <td class="row-flex">
          <img class="thumb" src="${esc(imgSrc(p.image))}" alt="">
          <div><div class="cell-strong">${esc(p.title)}</div><div class="cell-sub">#${p.id}</div></div>
        </td>
        <td>${(p.categories || []).map(c => `<span class="chip">${esc(c.category.name)}</span>`).join("") || "<span class='cell-sub'>—</span>"}</td>
        <td class="num cell-strong">${inr(p.price)}</td>
        <td class="num">${p.stock}</td>
        <td>${stockBadge(p.stock)}</td>
        <td><div class="btn-row">
          <button class="btn btn-sm" onclick='openEdit(${JSON.stringify(p)})'>Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteProduct(${p.id})">Delete</button>
        </div></td>
      </tr>`).join("")
    : emptyRow(6, "No products match these filters");
}
["productSearch", "productCategoryFilter", "productStockFilter"].forEach(id =>
  document.getElementById(id).addEventListener("input", renderProducts));

async function createProduct() {
  const categoryIds = [...document.querySelectorAll("#productCategoryOptions input:checked")].map(i => Number(i.value));
  const body = {
    title: val("productTitle"), description: val("productDescription"),
    price: val("productPrice"), image: val("productImage"),
    stock: val("productStock"), keywords: val("productKeywords"), categoryIds
  };
  if (!body.title || !body.price) return toast("Title and price are required", "err");
  try {
    await api("/products", { method: "POST", headers: authHeaders(true), body: JSON.stringify(body) });
    toast("Product created");
    resetProductForm();
    await loadAll();
    showView("products");
  } catch (e) { console.log(e); toast("Couldn't create product", "err"); }
}
function resetProductForm() {
  ["productTitle", "productDescription", "productPrice", "productImage", "productStock", "productKeywords"].forEach(id => document.getElementById(id).value = "");
  document.querySelectorAll("#productCategoryOptions input:checked").forEach(i => i.checked = false);
  document.getElementById("uploadStatus").textContent = "";
}
async function uploadProductImage() {
  const file = document.getElementById("productImageFile").files[0];
  if (!file) return;
  const status = document.getElementById("uploadStatus");
  status.innerHTML = `<span class="spinner"></span> Uploading…`;
  try {
    const fd = new FormData(); fd.append("image", file);
    const res = await fetch(`${API_URL}/products/upload`, { method: "POST", headers: authHeaders(), body: fd });
    const data = await res.json();
    if (data.imageUrl) {
      document.getElementById("productImage").value = data.imageUrl;
      status.textContent = "Uploaded ✓";
    } else { status.textContent = data.message || "Upload failed"; }
  } catch (e) { console.log(e); status.textContent = "Upload failed"; }
}
async function deleteProduct(id) {
  if (!confirm("Delete this product? This cannot be undone.")) return;
  try {
    await api(`/products/${id}`, { method: "DELETE", headers: authHeaders() });
    toast("Product deleted");
    await loadAll();
  } catch (e) { console.log(e); toast("Couldn't delete", "err"); }
}
function val(id) { return document.getElementById(id).value; }

// edit modal
function openEdit(p) {
  document.getElementById("editProductId").value = p.id;
  document.getElementById("editProductTitle").value = p.title || "";
  document.getElementById("editProductDescription").value = p.description || "";
  document.getElementById("editProductPrice").value = p.price ?? "";
  document.getElementById("editProductStock").value = p.stock ?? "";
  document.getElementById("editProductImage").value = p.image || "";
  document.getElementById("editProductKeywords").value = p.keywords || "";
  const checked = new Set((p.categories || []).map(c => c.category.id));
  document.getElementById("editCategoryOptions").innerHTML = CATEGORIES.map(c => `
    <label class="cat-option"><input type="checkbox" value="${c.id}" ${checked.has(c.id) ? "checked" : ""}> ${esc(c.name)}</label>`).join("");
  document.getElementById("editModal").classList.add("open");
}
function closeEdit() { document.getElementById("editModal").classList.remove("open"); }
async function updateProduct() {
  const id = val("editProductId");
  const categoryIds = [...document.querySelectorAll("#editCategoryOptions input:checked")].map(i => Number(i.value));
  const body = {
    title: val("editProductTitle"), description: val("editProductDescription"),
    price: val("editProductPrice"), image: val("editProductImage"),
    stock: val("editProductStock"), keywords: val("editProductKeywords"), categoryIds
  };
  try {
    await api(`/products/${id}`, { method: "PUT", headers: authHeaders(true), body: JSON.stringify(body) });
    toast("Product updated");
    closeEdit();
    await loadAll();
  } catch (e) { console.log(e); toast("Couldn't update", "err"); }
}
function exportProductsCSV() {
  const rows = [["ID", "Title", "Price", "Stock", "Categories", "Keywords"]];
  filteredProducts().forEach(p => rows.push([p.id, p.title, p.price, p.stock,
    (p.categories || []).map(c => c.category.name).join(" | "), p.keywords || ""]));
  downloadCSV("products.csv", rows);
}

// ============================================================
//  CATEGORIES
// ============================================================
function renderCategories() {
  const counts = {};
  PRODUCTS.forEach(p => (p.categories || []).forEach(c => {
    counts[c.category.id] = (counts[c.category.id] || 0) + 1;
  }));
  document.getElementById("categoryList").innerHTML = CATEGORIES.length
    ? CATEGORIES.map(c => `
      <div class="cat-card">
        <div><h4>${esc(c.name)}</h4><div class="count">${counts[c.id] || 0} products</div></div>
        <button class="btn btn-sm btn-danger" onclick="deleteCategory(${c.id})">Delete</button>
      </div>`).join("")
    : `<div class="empty" style="grid-column:1/-1;"><div class="big">❖</div>No categories yet — add one above.</div>`;
}
async function createCategory() {
  const name = val("categoryName").trim();
  if (!name) return toast("Enter a category name", "err");
  try {
    await api("/categories", { method: "POST", headers: authHeaders(true), body: JSON.stringify({ name }) });
    document.getElementById("categoryName").value = "";
    toast("Category added");
    await loadAll();
  } catch (e) { console.log(e); toast("Couldn't add category", "err"); }
}
async function deleteCategory(id) {
  if (!confirm("Delete this category?")) return;
  try {
    await api(`/categories/${id}`, { method: "DELETE", headers: authHeaders() });
    toast("Category deleted");
    await loadAll();
  } catch (e) { console.log(e); toast("Couldn't delete", "err"); }
}

// ============================================================
//  ORDERS
// ============================================================
function filteredOrders() {
  const q = document.getElementById("orderSearch").value.toLowerCase().trim();
  const status = document.getElementById("orderStatusFilter").value;
  return ORDERS.filter(o => {
    if (status && o.status !== status) return false;
    if (q && !(`#${o.id} ${o.fullName || ""} ${o.user?.name || ""} ${o.user?.email || ""}`.toLowerCase().includes(q))) return false;
    return true;
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}
function renderOrders() {
  const rows = filteredOrders();
  document.querySelector("#ordersTable tbody").innerHTML = rows.length
    ? rows.map(o => `
      <tr>
        <td class="cell-strong">#${o.id}</td>
        <td>${esc(o.fullName || o.user?.name || "—")}<div class="cell-sub">${esc(o.user?.email || "")}</div></td>
        <td class="num">${(o.orderItems || []).reduce((s, i) => s + i.quantity, 0)}</td>
        <td class="num cell-strong">${inr(o.totalAmount)}</td>
        <td>
          <select onchange="updateOrderStatus(${o.id}, this.value)" style="padding:5px 8px;font-size:12px;">
            ${["Pending", "Shipped", "Delivered", "Cancelled"].map(s => `<option ${s === o.status ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </td>
        <td class="cell-sub">${shortDate(o.createdAt)}</td>
        <td><button class="btn btn-sm" onclick="viewOrder(${o.id})">Details</button></td>
      </tr>`).join("")
    : emptyRow(7, "No orders match these filters");
}
["orderSearch", "orderStatusFilter"].forEach(id =>
  document.getElementById(id).addEventListener("input", renderOrders));

async function updateOrderStatus(id, status) {
  try {
    await api(`/orders/${id}/status`, { method: "PUT", headers: authHeaders(true), body: JSON.stringify({ status }) });
    const o = ORDERS.find(o => o.id === id); if (o) o.status = status;
    toast(`Order #${id} → ${status}`);
    renderDashboard(); renderPayments();
  } catch (e) { console.log(e); toast("Couldn't update status", "err"); }
}
function viewOrder(id) {
  const o = ORDERS.find(o => o.id === id); if (!o) return;
  document.getElementById("detailsTitle").textContent = `Order #${o.id}`;
  const items = (o.orderItems || []).map(i => `
    <div class="order-line">
      <img class="thumb" src="${esc(imgSrc(i.product?.image))}" alt="">
      <div style="flex:1"><div class="cell-strong">${esc(i.product?.title || "Product")}</div>
      <div class="cell-sub">Qty ${i.quantity} × ${inr(i.price)}</div></div>
      <div class="cell-strong">${inr(i.price * i.quantity)}</div>
    </div>`).join("");
  document.getElementById("detailsBody").innerHTML = `
    <div class="detail-row"><span class="k">Customer</span><span>${esc(o.fullName || o.user?.name || "—")}</span></div>
    <div class="detail-row"><span class="k">Phone</span><span>${esc(o.phone || "—")}</span></div>
    <div class="detail-row"><span class="k">Address</span><span style="text-align:right;max-width:60%">${esc([o.address, o.city, o.state, o.pincode].filter(Boolean).join(", ") || "—")}</span></div>
    <div class="detail-row"><span class="k">Status</span><span>${statusBadge(o.status)}</span></div>
    <div class="detail-row"><span class="k">Placed</span><span>${shortDate(o.createdAt)}</span></div>
    <h4 style="margin:18px 0 6px;">Items</h4>
    ${items || "<div class='cell-sub'>No items</div>"}
    <div class="detail-row" style="margin-top:10px;border-bottom:none;"><span class="k" style="font-weight:600;color:var(--ink-2)">Total</span><span class="cell-strong">${inr(o.totalAmount)}</span></div>`;
  document.getElementById("detailsModal").classList.add("open");
}
function closeDetails() { document.getElementById("detailsModal").classList.remove("open"); }
function exportOrdersCSV() {
  const rows = [["Order", "Customer", "Email", "Phone", "Amount", "Status", "Date", "City", "Pincode"]];
  filteredOrders().forEach(o => rows.push([o.id, o.fullName || o.user?.name || "", o.user?.email || "",
    o.phone || "", o.totalAmount, o.status, shortDate(o.createdAt), o.city || "", o.pincode || ""]));
  downloadCSV("orders.csv", rows);
}

// ============================================================
//  PAYMENTS  (derived from order status)
// ============================================================
function renderPayments() {
  // CHANGED: now uses the real paymentMethod / paymentStatus fields
  // (falls back to status-derived logic for old orders created before
  // the migration, which will have defaults COD/Pending).
  const paid = ORDERS.filter(o => o.paymentStatus === "Paid");
  const awaiting = ORDERS.filter(o => o.paymentStatus === "Pending" && o.status !== "Cancelled");
  const refunded = ORDERS.filter(o => o.paymentStatus === "Refunded");
  const sum = list => list.reduce((s, o) => s + o.totalAmount, 0);

  const kpis = [
    { label: "Collected", value: sum(paid), foot: `${paid.length} paid orders`, cls: "" },
    { label: "Awaiting payment", value: sum(awaiting), foot: `${awaiting.length} unpaid (COD/UPI)`, cls: "" },
    { label: "Refunded", value: sum(refunded), foot: `${refunded.length} orders`, cls: refunded.length ? "alert" : "" },
    { label: "UPI share", value: sum(ORDERS.filter(o => o.paymentMethod === "UPI" && o.paymentStatus === "Paid")), foot: "collected via UPI", cls: "" }
  ];
  document.getElementById("paymentKpis").innerHTML = kpis.map(k => `
    <div class="kpi ${k.cls}">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value"><span class="cur">₹</span>${Number(k.value).toLocaleString("en-IN")}</div>
      <div class="kpi-foot">${k.foot}</div>
    </div>`).join("");

  const pill = o => {
    if (o.paymentStatus === "Paid") return `<span class="badge b-ok">Paid</span>`;
    if (o.paymentStatus === "Refunded") return `<span class="badge b-mute">Refunded</span>`;
    if (o.status === "Cancelled") return `<span class="badge b-bad">Cancelled unpaid</span>`;
    return `<span class="badge b-warn">Awaiting</span>`;
  };
  const rows = [...ORDERS].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  document.querySelector("#paymentsTable tbody").innerHTML = rows.length
    ? rows.map(o => `
      <tr>
        <td class="cell-strong">#${o.id}<div class="cell-sub">${esc(o.paymentMethod || "COD")}</div></td>
        <td>${esc(o.fullName || o.user?.name || "—")}</td>
        <td class="num cell-strong">${inr(o.totalAmount)}</td>
        <td>${pill(o)}</td>
        <td class="cell-sub">${shortDate(o.createdAt)}</td>
        <td>${o.paymentStatus === "Paid"
            ? `<button class="btn btn-sm btn-ghost" onclick="setPayment(${o.id}, 'Refunded')">Refund</button>`
            : o.status === "Cancelled"
              ? ""
              : `<button class="btn btn-sm btn-gold" onclick="setPayment(${o.id}, 'Paid')">Mark paid</button>`}
        </td>
      </tr>`).join("")
    : emptyRow(6, "No transactions yet");
}

// ADDED: flip an order's payment status via the new admin endpoint.
async function setPayment(id, paymentStatus) {
  try {
    await api(`/orders/${id}/payment`, {
      method: "PUT", headers: authHeaders(true),
      body: JSON.stringify({ paymentStatus })
    });
    const o = ORDERS.find(o => o.id === id);
    if (o) o.paymentStatus = paymentStatus;
    toast(`Order #${id} payment → ${paymentStatus}`);
    renderPayments();
  } catch (e) { console.log(e); toast("Couldn't update payment", "err"); }
}

// ============================================================
//  CUSTOMERS
// ============================================================
function renderCustomers() {
  const q = document.getElementById("customerSearch").value.toLowerCase().trim();
  const rows = CUSTOMERS.filter(c => !q || `${c.name} ${c.email}`.toLowerCase().includes(q));
  document.querySelector("#customersTable tbody").innerHTML = rows.length
    ? rows.map(c => `
      <tr>
        <td class="row-flex">
          <div class="admin-chip" style="border:none;padding:0"><div class="avatar" style="width:34px;height:34px">${esc((c.name || "?")[0].toUpperCase())}</div></div>
          <div><div class="cell-strong">${esc(c.name)}</div><div class="cell-sub">${esc(c.email)}</div></div>
        </td>
        <td>${c.role === "ADMIN" ? '<span class="badge b-info">Admin</span>' : c.role === "OWNER" ? '<span class="badge b-ok">Owner</span>' : '<span class="badge b-mute">Customer</span>'}</td>
        <td class="num">${c.orderCount}</td>
        <td class="num cell-strong">${inr(c.totalSpent)}</td>
        <td class="cell-sub">${shortDate(c.lastOrderAt)}</td>
        <td class="cell-sub">${shortDate(c.createdAt)}</td>
        <td>
          <div class="btn-row">
            <button class="btn btn-sm" onclick="viewCustomer(${c.id}, '${esc(c.name)}')">Orders</button>
            ${adminUser.role === "ADMIN" && (c.role === "CUSTOMER" || c.role === "customer") ? `<button class="btn btn-sm btn-gold" onclick="promoteToOwner(${c.id}, '${esc(c.name)}')">Promote</button>` : ''}
          </div>
        </td>
      </tr>`).join("")
    : emptyRow(7, "No customers found");
}
document.getElementById("customerSearch").addEventListener("input", renderCustomers);

async function viewCustomer(id, name) {
  try {
    const orders = await api(`/users/${id}/orders`, { headers: authHeaders() });
    document.getElementById("detailsTitle").textContent = `${name} · orders`;
    document.getElementById("detailsBody").innerHTML = orders.length
      ? orders.map(o => `
        <div class="order-line">
          <div style="flex:1"><div class="cell-strong">Order #${o.id}</div>
          <div class="cell-sub">${shortDate(o.createdAt)} · ${(o.orderItems || []).length} items</div></div>
          ${statusBadge(o.status)}
          <div class="cell-strong" style="margin-left:12px">${inr(o.totalAmount)}</div>
        </div>`).join("")
      : "<div class='empty'><div class='big'>✦</div>No orders yet</div>";
    document.getElementById("detailsModal").classList.add("open");
  } catch (e) { console.log(e); toast("Couldn't load customer orders", "err"); }
}
function exportCustomersCSV() {
  const rows = [["ID", "Name", "Email", "Role", "Orders", "Total spent", "Joined"]];
  CUSTOMERS.forEach(c => rows.push([c.id, c.name, c.email, c.role, c.orderCount, c.totalSpent, shortDate(c.createdAt)]));
  downloadCSV("customers.csv", rows);
}

async function promoteToOwner(id, name) {
  if (!confirm(`Are you sure you want to promote ${name} to OWNER?`)) return;
  try {
    const res = await fetch(`${API_URL}/users/${id}/promote`, {
      method: "PUT",
      headers: authHeaders()
    });
    const data = await res.json();
    if (!res.ok) {
      toast(data.message || "Failed to promote user", "err");
      return;
    }
    toast(`${name} is now an OWNER`);
    await loadAll();
  } catch (e) {
    console.log(e);
    toast("Couldn't promote user", "err");
  }
}

// ============================================================
//  REPORTS
// ============================================================
function initReportDates() {
  const to = new Date();
  const from = new Date(); from.setDate(from.getDate() - 30);
  document.getElementById("reportTo").value = to.toISOString().slice(0, 10);
  document.getElementById("reportFrom").value = from.toISOString().slice(0, 10);
}
function runReport() {
  if (!document.getElementById("reportFrom").value) initReportDates();
  const from = new Date(document.getElementById("reportFrom").value); from.setHours(0, 0, 0, 0);
  const to = new Date(document.getElementById("reportTo").value); to.setHours(23, 59, 59, 999);

  const inRange = ORDERS.filter(o => {
    const d = new Date(o.createdAt);
    return d >= from && d <= to && o.status !== "Cancelled";
  });
  const revenue = inRange.reduce((s, o) => s + o.totalAmount, 0);
  const units = inRange.reduce((s, o) => s + (o.orderItems || []).reduce((n, i) => n + i.quantity, 0), 0);
  const aov = inRange.length ? Math.round(revenue / inRange.length) : 0;

  const kpis = [
    { label: "Revenue", value: revenue, cur: true },
    { label: "Orders", value: inRange.length },
    { label: "Units sold", value: units },
    { label: "Avg order value", value: aov, cur: true }
  ];
  document.getElementById("reportKpis").innerHTML = kpis.map(k => `
    <div class="kpi"><div class="kpi-label">${k.label}</div>
      <div class="kpi-value">${k.cur ? '<span class="cur">₹</span>' : ""}${Number(k.value).toLocaleString("en-IN")}</div>
      <div class="kpi-foot">${shortDate(from)} – ${shortDate(to)}</div></div>`).join("");

  // top products
  const agg = {};
  inRange.forEach(o => (o.orderItems || []).forEach(i => {
    const key = i.productId ?? i.product?.id;
    if (!agg[key]) agg[key] = { title: i.product?.title || productById[key]?.title || `#${key}`, units: 0, revenue: 0 };
    agg[key].units += i.quantity;
    agg[key].revenue += i.price * i.quantity;
  }));
  const top = Object.values(agg).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  document.querySelector("#topProductsTable tbody").innerHTML = top.length
    ? top.map(p => `<tr><td class="cell-strong">${esc(p.title)}</td><td class="num">${p.units}</td><td class="num">${inr(p.revenue)}</td></tr>`).join("")
    : emptyRow(3, "No sales in this range");

  drawCategoryChart(inRange);
}
function drawCategoryChart(orders) {
  if (typeof Chart === "undefined") return;
  const byCat = {};
  orders.forEach(o => (o.orderItems || []).forEach(i => {
    const prod = productById[i.productId ?? i.product?.id];
    const cat = prod?.categories?.[0]?.category?.name || "Uncategorised";
    byCat[cat] = (byCat[cat] || 0) + i.price * i.quantity;
  }));
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const ctx = document.getElementById("categoryChart");
  charts.category?.destroy();
  if (!entries.length) return;
  charts.category = new Chart(ctx, {
    type: "bar",
    data: { labels: entries.map(e => e[0]), datasets: [{ data: entries.map(e => e[1]),
      backgroundColor: "#7a1f3d", borderRadius: 6, barThickness: 20 }] },
    options: { indexAxis: "y", responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => inr(c.parsed.x) } } },
      scales: { x: { grid: { color: "#f0ebe3" }, ticks: { color: "#8b8290", callback: v => "₹" + v } },
        y: { grid: { display: false }, ticks: { color: "#2b2430" } } } }
  });
}

// ---------- boot ----------
document.getElementById("adminAvatar").textContent = "A";
initReportDates();
loadAll();