// Setup DOM first
document.body.innerHTML = `
  <div id="deliveriesContainer"></div>
  <div id="toast"></div>
`;

// Mock globals
global.API_URL = "http://localhost:5000";
global.authHeaders = jest.fn(() => ({ Authorization: "Bearer mock" }));
global.toast = jest.fn();

// Mock localStorage
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: jest.fn(() => "mock-token"),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  writable: true
});

// Avoid jsdom "not implemented" error and suppress expected errors
jest.spyOn(console, 'error').mockImplementation((msg) => {
  if (msg && msg.toString().includes('Not implemented: navigation')) return;
});

// Mock window.location
delete window.location;
window.location = {
  href: 'http://localhost/',
};

// Mock fetch, fetchAuth and confirm
global.fetch = jest.fn();
global.fetchAuth = jest.fn();
window.confirm = jest.fn();

const { updateStatus } = require('./delivery');

describe('delivery.js updateStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Scenario 1: User cancels confirmation dialog', async () => {
    window.confirm.mockReturnValue(false);

    await updateStatus(1, 'Delivered');

    expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to mark this order as Delivered?');
    expect(global.fetchAuth).not.toHaveBeenCalled();
    expect(global.toast).not.toHaveBeenCalled();
  });

  it('Scenario 2: Successful delivery status update', async () => {
    window.confirm.mockReturnValue(true);

    global.fetchAuth.mockImplementation((url) => {
      if (url.includes('/orders/1/delivery-status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({})
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    global.fetch.mockImplementation((url) => {
      if (url.includes('/orders/delivery')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    await updateStatus(1, 'Delivered');

    expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to mark this order as Delivered?');
    expect(global.fetchAuth).toHaveBeenCalledWith(
      `${global.API_URL}/orders/1/delivery-status`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: 'Delivered' })
      })
    );
    expect(global.toast).toHaveBeenCalledWith('Order updated to Delivered');

    // Also expect loadDeliveries to be called, which calls fetch
    expect(global.fetch).toHaveBeenCalledWith(
      `${global.API_URL}/orders/delivery`,
      expect.anything()
    );
  });

  it('Scenario 3: Failed update API response with an error message in payload', async () => {
    window.confirm.mockReturnValue(true);

    global.fetchAuth.mockImplementation((url) => {
      if (url.includes('/orders/1/delivery-status')) {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ message: "Invalid status" })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    await updateStatus(1, 'Attempted');

    expect(global.fetchAuth).toHaveBeenCalledWith(
      `${global.API_URL}/orders/1/delivery-status`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: 'Attempted' })
      })
    );
    expect(global.toast).toHaveBeenCalledWith('Invalid status');
  });

  it('Scenario 4: Exception/network error during the request', async () => {
    window.confirm.mockReturnValue(true);
    global.fetchAuth.mockRejectedValue(new Error("Network error"));

    await updateStatus(1, 'Delivered');

    expect(console.error).toHaveBeenCalledWith(expect.any(Error));
    expect(global.toast).toHaveBeenCalledWith('Something went wrong');
  });
});
