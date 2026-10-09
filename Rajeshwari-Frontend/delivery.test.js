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

// Mock fetch, fetchAuth and confirm
global.fetch = jest.fn();
global.fetchAuth = jest.fn();
window.confirm = jest.fn();


const { updateStatus, boot, loadDeliveries, renderDeliveries, logout } = require('./delivery');

describe('delivery.js boot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete window.location;
    const assignMock = jest.fn();
    window.location = { assign: assignMock, href: 'http://localhost/' };
    global.mockAssign = assignMock;
    document.getElementById('deliveriesContainer').innerHTML = '';
  });

  it('redirects to index.html if token is missing', async () => {
    window.localStorage.getItem.mockReturnValueOnce(null);
    await boot();
    expect(window.localStorage.removeItem).toHaveBeenCalledWith('token');
  });

  it('redirects to index.html on unauthorized role', async () => {
    window.localStorage.getItem.mockReturnValueOnce('mock-token');
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ role: 'USER' })
    });

    await boot();

    expect(window.localStorage.removeItem).toHaveBeenCalledWith('token');
  });

  it('redirects to index.html on fetch failure', async () => {
    window.localStorage.getItem.mockReturnValueOnce('mock-token');
    global.fetch.mockResolvedValueOnce({
      ok: false
    });

    await boot();

    expect(window.localStorage.removeItem).toHaveBeenCalledWith('token');
  });

  it('calls loadDeliveries for authorized role', async () => {
    window.localStorage.getItem.mockReturnValue('mock-token');
    global.fetch.mockImplementation((url) => {
      if (url.includes('/auth/me')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ role: 'DELIVERY_PARTNER' })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    await boot();

    expect(global.fetch).toHaveBeenCalledWith(`${global.API_URL}/auth/me`, expect.any(Object));
    expect(global.fetch).toHaveBeenCalledWith(`${global.API_URL}/orders/delivery`, expect.any(Object));
  });
});

describe('delivery.js loadDeliveries & renderDeliveries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.getElementById('deliveriesContainer').innerHTML = '';
  });

  it('handles empty deliveries array', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([])
    });

    await loadDeliveries();

    const container = document.getElementById('deliveriesContainer');
    expect(container.innerHTML).toContain('No deliveries assigned or pending.');
  });

  it('renders deliveries successfully', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([
        {
          id: 101,
          status: 'Dispatched',
          fullName: 'John Doe',
          phone: '1234567890',
          address: '123 St',
          city: 'City',
          state: 'State',
          pincode: '123456',
          paymentMethod: 'Cash',
          paymentStatus: 'Pending',
          totalAmount: 500
        }
      ])
    });

    await loadDeliveries();

    const container = document.getElementById('deliveriesContainer');
    expect(container.innerHTML).toContain('Order #101');
    expect(container.innerHTML).toContain('Mark Out for Delivery');
  });

  it('renders deliveries with missing fields (N/A fallback)', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([
        {
          id: 103,
          status: 'Dispatched',
          paymentMethod: 'Cash',
          paymentStatus: 'Paid',
          totalAmount: 500
        }
      ])
    });

    await loadDeliveries();

    const container = document.getElementById('deliveriesContainer');
    expect(container.innerHTML).toContain('Order #103');
    expect(container.innerHTML).toContain('N/A');
  });

  it('handles fetch failure and shows error', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false
    });

    await loadDeliveries();

    const container = document.getElementById('deliveriesContainer');
    expect(console.error).toHaveBeenCalled();
    expect(container.innerHTML).toContain('Failed to load deliveries');
  });
});

describe('delivery.js logout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete window.location;
    window.location = { assign: jest.fn(), href: 'http://localhost/' };
  });

  it('removes token and redirects', () => {
    logout();
    expect(window.localStorage.removeItem).toHaveBeenCalledWith('token');
  });
});

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


  it('Scenario 5: Failed update API response with NO error message in payload', async () => {
    window.confirm.mockReturnValue(true);

    global.fetchAuth.mockImplementation((url) => {
      if (url.includes('/orders/1/delivery-status')) {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({})
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
    expect(global.toast).toHaveBeenCalledWith('Failed to update status');
  });

  it('Scenario 4: Exception/network error during the request', async () => {
    window.confirm.mockReturnValue(true);
    global.fetchAuth.mockRejectedValue(new Error("Network error"));

    await updateStatus(1, 'Delivered');

    expect(console.error).toHaveBeenCalledWith(expect.any(Error));
    expect(global.toast).toHaveBeenCalledWith('Something went wrong');
  });
});
