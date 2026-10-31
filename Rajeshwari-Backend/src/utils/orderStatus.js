// Single source of truth for the order lifecycle.
//
//   Pending ──(admin)──► Shipped ──(partner picks up)──► Out for Delivery
//                                       ▲                  │        │
//                                       └─(retry)─ Attempted ◄──────┤
//                                                                   ▼
//                                                               Delivered
//   Cancelled: admin only, from any state (restocks).

const ORDER_STATUSES = ["Pending", "Shipped", "Out for Delivery", "Attempted", "Delivered", "Cancelled"];

// What the delivery portal works on.
const DELIVERY_QUEUE = ["Shipped", "Out for Delivery", "Attempted"];

// Delivery-partner transitions: target -> allowed current statuses.
const PARTNER_TRANSITIONS = {
  "Out for Delivery": ["Shipped", "Attempted"],
  "Delivered": ["Out for Delivery"],
  "Attempted": ["Out for Delivery"]
};

// When an admin moves an order back to these, any partner assignment is released.
const UNASSIGN_ON = ["Pending", "Shipped"];

module.exports = { ORDER_STATUSES, DELIVERY_QUEUE, PARTNER_TRANSITIONS, UNASSIGN_ON };
