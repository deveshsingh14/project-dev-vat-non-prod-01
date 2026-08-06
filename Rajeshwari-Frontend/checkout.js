/* Checkout — uses the same API. Guards for login, pre-fills saved
   delivery details from /users/me, shows the bag summary, and places
   the order with the chosen payment method. */

const API_URL = "https://project-dev-vat-non-prod-01.onrender.com";
// Set this to your real UPI id to render the scan-to-pay QR:
const UPI_ID = "rajeshwari@upi";
const UPI_NAME = "Rajeshwari Bangles Jewellery";

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
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2600);
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

// ---- guard: must be logged in with items in the bag ----
if (!token()) {
  window.location.href = "index.html";
}

let CART = [];
let payMethod = "COD";

async function boot() {
  // pre-fill from profile (saved on every checkout)
  try {
    const res = await fetch(`${API_URL}/users/me`, { headers: authHeaders() });
    if (handle401(res)) return;
    if (res.ok) {
      const me = await res.json();
      setVal("fullName", me.name);
      setVal("phone", me.phone);
      setVal("address", me.address);
      setVal("city", me.city);
      setVal("state", me.state);
      setVal("pincode", me.pincode);
    }
  } catch (e) { console.log(e); }

  await loadSummary();

  // UPI QR
  const upiUrl = `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(UPI_NAME)}&cu=INR`;
  document.getElementById("upiQr").src =
    `https://api.qrserver.com/v1/create-qr-code/?size=340x340&data=${encodeURIComponent(upiUrl)}`;
}
function setVal(id, v) { if (v) document.getElementById(id).value = v; }

async function loadSummary() {
  try {
    const res = await fetch(`${API_URL}/cart`, { headers: authHeaders() });
    if (handle401(res)) return;
    CART = await res.json();

    if (!CART.length) {
      document.getElementById("summaryItems").innerHTML =
        `<p style="color:var(--muted);font-size:13px;">Your bag is empty. <a href="index.html" style="color:var(--maroon);font-weight:700;">Go add something ♥</a></p>`;
      document.getElementById("placeBtn").disabled = true;
      return;
    }

    let total = 0;
    document.getElementById("summaryItems").innerHTML = CART.map(item => {
      const p = item.product || {};
      total += p.price * item.quantity;
      return `
        <div class="sum-line">
          <img src="${esc(imgSrc(p.image))}" alt="">
          <div style="flex:1;min-width:0;">
            <div class="sl-t">${esc(p.title)}</div>
            <div class="sl-q">Qty ${item.quantity}</div>
          </div>
          <div class="sl-p">${inr(p.price * item.quantity)}</div>
        </div>`;
    }).join("");
    document.getElementById("subTotal").textContent = inr(total);
    document.getElementById("grandTotal").textContent = inr(total);
  } catch (e) { console.log(e); }
}

function pickPay(method) {
  payMethod = method;
  document.getElementById("opt-COD").classList.toggle("sel", method === "COD");
  document.getElementById("opt-UPI").classList.toggle("sel", method === "UPI");
  document.getElementById("upiBox").style.display = method === "UPI" ? "block" : "none";
}

async function placeOrder() {
  const body = {
    fullName: val("fullName"), phone: val("phone"),
    address: val("address"), city: val("city"),
    state: val("state"), pincode: val("pincode"),
    paymentMethod: payMethod
  };
  if (!body.fullName || !body.phone || !body.address || !body.city || !body.state || !body.pincode) {
    toast("Please fill in all delivery details");
    return;
  }

  const btn = document.getElementById("placeBtn");
  btn.disabled = true; btn.textContent = "Placing order…";

  try {
    const res = await fetch(`${API_URL}/orders/checkout`, {
      method: "POST", headers: authHeaders(true), body: JSON.stringify(body)
    });
    if (handle401(res)) return;
    const data = await res.json();

    if (!res.ok) {
      // e.g. 409 stock conflict with a useful message
      toast(data.message || "Checkout failed");
      btn.disabled = false; btn.textContent = "Place order";
      if (res.status === 409) loadSummary();
      return;
    }

    // success
    document.getElementById("checkoutView").style.display = "none";
    document.getElementById("successView").style.display = "block";
    document.getElementById("successOrderNo").textContent = "#" + data.order.id;
    document.getElementById("successPayNote").textContent =
      payMethod === "UPI"
        ? `Pay ${inr(data.order.totalAmount)} via UPI and mention order #${data.order.id} in the note — we dispatch once payment is confirmed.`
        : `Keep ${inr(data.order.totalAmount)} ready — pay when your order arrives.`;
    window.scrollTo({ top: 0 });
  } catch (e) {
    console.log(e);
    toast("Couldn't reach the server");
    btn.disabled = false; btn.textContent = "Place order";
  }
}
function val(id) { return document.getElementById(id).value.trim(); }

boot();

