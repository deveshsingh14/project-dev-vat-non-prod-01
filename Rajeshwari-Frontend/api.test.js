// Mock localStorage
let store = {};
global.localStorage = {
  getItem: jest.fn((key) => store[key] || null),
  setItem: jest.fn((key, value) => { store[key] = value; }),
  removeItem: jest.fn((key) => { delete store[key]; }),
  clear: jest.fn(() => { store = {}; })
};

// Mock alert
global.alert = jest.fn();

const { inr, esc, imgSrc, token, authHeaders, toast, API_URL } = require('./api');

describe('api.js utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
    store = {};
  });

  describe('inr', () => {
    it('formats positive integers', () => {
      expect(inr(100)).toBe('₹100');
      expect(inr(1000)).toBe('₹1,000');
      expect(inr(100000)).toBe('₹1,00,000');
    });

    it('formats zero and handles null/undefined', () => {
      expect(inr(0)).toBe('₹0');
      expect(inr(null)).toBe('₹0');
      expect(inr(undefined)).toBe('₹0');
    });

    it('formats negative numbers', () => {
      expect(inr(-100)).toBe('₹-100');
    });

    it('handles string numbers', () => {
      expect(inr('1000')).toBe('₹1,000');
    });
  });

  describe('esc', () => {
    it('handles null and undefined', () => {
      expect(esc(null)).toBe('');
      expect(esc(undefined)).toBe('');
    });

    it('escapes HTML characters', () => {
      expect(esc('<script>alert("XSS & hacking \'fun\'")</script>'))
        .toBe('&lt;script&gt;alert(&quot;XSS &amp; hacking &#039;fun&#039;&quot;)&lt;/script&gt;');
    });

    it('returns string for numbers or booleans', () => {
      expect(esc(123)).toBe('123');
      expect(esc(true)).toBe('true');
    });
  });

  describe('imgSrc', () => {
    it('returns NO_IMAGE_PLACEHOLDER for falsy values', () => {
      expect(imgSrc(null)).toContain('data:image/svg+xml');
      expect(imgSrc('')).toContain('data:image/svg+xml');
      expect(imgSrc(undefined)).toContain('data:image/svg+xml');
    });

    it('returns absolute URL unchanged', () => {
      const url = 'http://example.com/image.jpg';
      expect(imgSrc(url)).toBe(url);
      const httpsUrl = 'https://example.com/image.png';
      expect(imgSrc(httpsUrl)).toBe(httpsUrl);
    });

    it('prepends API_URL for relative paths', () => {
      expect(imgSrc('/uploads/test.jpg')).toBe(API_URL + '/uploads/test.jpg');
    });
  });

  describe('token', () => {
    it('returns token from localStorage', () => {
      global.localStorage.setItem('token', 'my-mock-token');
      expect(token()).toBe('my-mock-token');
    });
  });

  describe('authHeaders', () => {
    it('returns headers with Authorization', () => {
      global.localStorage.setItem('token', 'my-mock-token');
      const headers = authHeaders();
      expect(headers).toEqual({ Authorization: 'Bearer my-mock-token' });
    });

    it('includes Content-Type when json is true', () => {
      global.localStorage.setItem('token', 'my-mock-token');
      const headers = authHeaders(true);
      expect(headers).toEqual({
        Authorization: 'Bearer my-mock-token',
        'Content-Type': 'application/json'
      });
    });
  });

  describe('toast', () => {
    it('uses alert if toast element is not in DOM', () => {
      toast('Test alert message');
      expect(global.alert).toHaveBeenCalledWith('Test alert message');
    });

    it('updates toast element and adds classes if in DOM', () => {
      document.body.innerHTML = '<div id="toast"></div>';
      toast('Test toast message');

      const t = document.getElementById('toast');
      expect(t.textContent).toBe('Test toast message');
      expect(t.className).toBe('show ok');
    });

    it('uses custom kind if provided', () => {
      document.body.innerHTML = '<div id="toast"></div>';
      toast('Test error message', 'error');

      const t = document.getElementById('toast');
      expect(t.className).toBe('show error');
    });

    it('removes show class after timeout', () => {
      jest.useFakeTimers();
      document.body.innerHTML = '<div id="toast"></div>';
      toast('Test message');

      const t = document.getElementById('toast');
      expect(t.className).toBe('show ok');

      jest.advanceTimersByTime(2500);
      expect(t.className).toBe('ok');
      expect(t.classList.contains('show')).toBe(false);

      jest.useRealTimers();
    });
  });
});
