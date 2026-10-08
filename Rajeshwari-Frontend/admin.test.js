// Setup DOM first
const domElements = [
  "toast", "sidebar", "view-dashboard", "view-products", "crumb", "pageTitle",
  "adminAvatar", "editModal", "detailsModal", "adminCpOld", "adminCpNew",
  "adminCpConfirm", "promotionToggleContainer", "btnCreateOwnerModal", "revRange",
  "statusChart", "bulkUploadFile", "f-cat", "f-search", "f-stock", "productGrid",
  "addForm", "pCat", "imagePreview", "editImagePreview", "categoryGrid",
  "pincodeCheck", "pincodeList", "o-search", "o-status", "orderGrid",
  "paymentGrid", "customerGrid", "repStart", "repEnd", "repRev", "repOrders",
  "repAov", "catChart", "productSearch", "productCategoryFilter",
  "productStockFilter", "orderSearch", "orderStatusFilter",
  "customerSearch", "deliveryAreaSearch"
];

document.body.innerHTML = domElements.map(id => `<div id="${id}"></div>`).join('') + `
  <canvas id="revChart"></canvas>
  <button id="btnCreateOwnerModal"></button>
`;

// Mock globals

global.esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
global.NO_IMAGE_PLACEHOLDER = "";
global.imgSrc = (p) => p || "";
global.token = () => "mock-token";
global.authHeaders = jest.fn(() => ({}));
global.handle401 = jest.fn(() => false);
global.inr = jest.fn((n) => "₹" + n);
global.Chart = jest.fn().mockImplementation(() => ({
  destroy: jest.fn()
}));

// JSDOM specific window location mock
delete window.location;
window.location = {
  assign: jest.fn(),
  replace: jest.fn(),
  reload: jest.fn(),
  href: 'http://localhost/',
  toString: () => 'http://localhost/'
};
window.alert = jest.fn();

// Avoid jsdom "not implemented" error
jest.spyOn(console, 'error').mockImplementation((msg) => {
  if (msg && msg.toString().includes('Not implemented: navigation')) return;
  console.log(msg);
});

// Avoid fetch errors
global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }));

global.localStorage = {
  getItem: jest.fn(() => null),
  setItem: jest.fn(),
  removeItem: jest.fn(),
};

// Import code
const { shortDate, statusBadge, stockBadge, revenueOf, catchErr } = require('./admin');

describe('Admin panel helpers', () => {
  describe('shortDate', () => {
    it('formats a valid date string correctly', () => {
      // 2023-01-15T00:00:00Z -> Should format nicely. We can mock Date or just check general output.
      const dateStr = "2023-01-15T00:00:00Z";
      const formatted = shortDate(dateStr);
      // Depending on node timezone it might be slightly different, but should contain Jan and 23
      expect(formatted).toMatch(/15|14/); // day
      expect(formatted).toMatch(/Jan/i); // month
      expect(formatted).toMatch(/23/); // year
    });

    it('returns "—" for missing or invalid dates', () => {
      expect(shortDate(null)).toBe("—");
      expect(shortDate(undefined)).toBe("—");
      expect(shortDate("")).toBe("—");
    });
  });

  describe('statusBadge', () => {
    it('returns correctly styled badges for each status', () => {
      expect(statusBadge("Delivered")).toContain("b-ok");
      expect(statusBadge("Shipped")).toContain("b-info");
      expect(statusBadge("Pending")).toContain("b-warn");
      expect(statusBadge("Cancelled")).toContain("b-bad");
    });

    it('returns a mute badge for unknown status', () => {
      expect(statusBadge("Unknown")).toContain("b-mute");
      expect(statusBadge(null)).toContain("b-mute");
      expect(statusBadge("")).toContain("b-mute");
    });
  });

  describe('stockBadge', () => {
    it('returns "Out of stock" for stock <= 0', () => {
      expect(stockBadge(0)).toContain("Out of stock");
      expect(stockBadge(0)).toContain("b-bad");
      expect(stockBadge(-5)).toContain("Out of stock");
    });

    it('returns "Low" for stock between 1 and 5 (assuming LOW_STOCK is 5)', () => {
      expect(stockBadge(3)).toContain("Low");
      expect(stockBadge(3)).toContain("b-warn");
      expect(stockBadge(5)).toContain("Low");
    });

    it('returns "In stock" for stock > LOW_STOCK', () => {
      expect(stockBadge(6)).toContain("In stock");
      expect(stockBadge(6)).toContain("b-ok");
      expect(stockBadge(100)).toContain("In stock");
    });
  });

  describe('catchErr', () => {
    let consoleErrorSpy;

    beforeEach(() => {
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      global.toast = jest.fn();
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
      jest.clearAllMocks();
      delete global.toast;
    });

    it('logs the error to console.error', () => {
      const error = new Error('Test error');
      catchErr(error, 'Message');

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error:', error);
    });

    it('sets textContent of the provided DOM element if el is given', () => {
      const el = { textContent: '' };
      const error = new Error('Test error');

      catchErr(error, 'Message', el);

      expect(el.textContent).toBe('Message');
    });

    it('calls toast with err kind if no el is given but msg is provided', () => {
      const error = new Error('Test error');

      catchErr(error, 'Message');

      expect(global.toast).toHaveBeenCalledWith('Message', 'err');
    });

    it('only logs to console.error if neither el nor msg is provided', () => {
      const error = new Error('Test error');

      catchErr(error);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error:', error);
      expect(global.toast).not.toHaveBeenCalled();
    });
  });

  describe('revenueOf', () => {
    it('calculates total revenue excluding cancelled orders', () => {
      const orders = [
        { status: "Delivered", totalAmount: 100 },
        { status: "Shipped", totalAmount: 200 },
        { status: "Pending", totalAmount: 50 },
        { status: "Cancelled", totalAmount: 500 } // Should be ignored
      ];
      expect(revenueOf(orders)).toBe(350);
    });

    it('returns 0 for empty array', () => {
      expect(revenueOf([])).toBe(0);
    });

    it('returns 0 if all orders are cancelled', () => {
      const orders = [
        { status: "Cancelled", totalAmount: 100 },
        { status: "Cancelled", totalAmount: 200 }
      ];
      expect(revenueOf(orders)).toBe(0);
    });
  });
});

  describe('toast', () => {
    it('shows toast with message and default kind', () => {
      jest.useFakeTimers();
      const toastEl = document.getElementById("toast");

      const { toast } = require('./api');
      toast("Test message");

      expect(toastEl.textContent).toBe("Test message");
      expect(toastEl.className).toBe("show ok");

      jest.runAllTimers();
      expect(toastEl.className).toBe("ok");

      jest.useRealTimers();
    });

    it('shows toast with custom kind', () => {
      jest.useFakeTimers();
      const toastEl = document.getElementById("toast");

      const { toast } = require('./api');
      toast("Error message", "err");

      expect(toastEl.textContent).toBe("Error message");
      expect(toastEl.className).toBe("show err");

      jest.runAllTimers();
      expect(toastEl.className).toBe("err");

      jest.useRealTimers();
    });
  });
