let me = null;
let deliveries = [];

async function boot() {
  const t = localStorage.getItem("token");
  if (!t) return window.location.href = "index.html";

  try {
    const res = await fetch(`${API_URL}/auth/me`, { headers: { "Authorization": `Bearer ${t}` } });
    if (!res.ok) throw new Error();
    me = await res.json();
    if (me.role !== "DELIVERY_PARTNER" && me.role !== "ADMIN" && me.role !== "OWNER") {
      throw new Error("Unauthorized");
    }
  } catch (e) {
    localStorage.removeItem("token");
    return window.location.href = "index.html";
  }

  loadDeliveries();
}

async function loadDeliveries() {
  try {
    const res = await fetchAuth(`${API_URL}/orders/delivery`);
    if (!res.ok) throw new Error();
    deliveries = await res.json();
    renderDeliveries();
  } catch (e) {
    console.error("Error loading deliveries", e);
    document.getElementById("deliveriesContainer").innerHTML = `<p style="text-align:center; color:red;">Failed to load deliveries</p>`;
  }
}

function renderDeliveries() {
  const container = document.getElementById("deliveriesContainer");
  if (deliveries.length === 0) {
    container.innerHTML = `<p style="text-align:center; color:#888;">No deliveries assigned or pending.</p>`;
    return;
  }

  container.innerHTML = deliveries.map(o => `
    <div class="card">
      <h3>Order #${o.id} <span class="status-badge status-${o.status.replace(/\s+/g, '-')}">${o.status}</span></h3>
      <p><strong>Customer:</strong> ${o.fullName || "N/A"}</p>
      <p><strong>Phone:</strong> ${o.phone || "N/A"}</p>
      <p><strong>Address:</strong> ${o.address || "N/A"}, ${o.city || "N/A"}, ${o.state || "N/A"} - ${o.pincode || "N/A"}</p>
      <p><strong>Payment:</strong> ${o.paymentMethod} (${o.paymentStatus})</p>
      <p><strong>Amount to Collect:</strong> ₹${o.paymentStatus === 'Pending' ? o.totalAmount : 0}</p>
      
      <div style="margin-top: 15px;">
        ${o.status === 'Dispatched' ? `<button class="btn-update" onclick="updateStatus(${o.id}, 'Out for Delivery')">Mark Out for Delivery</button>` : ''}
        ${o.status === 'Out for Delivery' ? `<button class="btn-update" onclick="updateStatus(${o.id}, 'Delivered')">Mark Delivered</button>` : ''}
        ${o.status === 'Out for Delivery' ? `<button class="btn-update" style="background:#e53935;" onclick="updateStatus(${o.id}, 'Attempted')">Mark Attempted</button>` : ''}
      </div>
    </div>
  `).join("");
}

async function updateStatus(orderId, newStatus) {
  if (!confirm(`Are you sure you want to mark this order as ${newStatus}?`)) return;
  
  try {
    const res = await fetchAuth(`${API_URL}/orders/${orderId}/delivery-status`, {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus })
    });
    
    if (res.ok) {
      toast(`Order updated to ${newStatus}`);
      loadDeliveries();
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.message || "Failed to update status");
    }
  } catch (e) {
    console.error(e);
    toast("Something went wrong");
  }
}

function logout() {
  localStorage.removeItem("token");
  window.location.href = "index.html";
}

function toast(msg) {
  const t = document.getElementById("toast");
  if (!t) return alert(msg);
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}

boot();
