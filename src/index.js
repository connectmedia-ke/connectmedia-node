'use strict';

const DEFAULT_BASE_URL = 'https://app.connectmedia.co.ke/api.php';

// Application code returned in the JSON envelope when each action succeeds.
const SUCCESS_CODES = { send: '201', balance: '200', history: '202', inbox: '302' };

class ConnectMediaError extends Error {
  constructor(code, message, response = {}) {
    super(`[${code}] ${message}`);
    this.name = 'ConnectMediaError';
    this.code = code;
    this.apiMessage = message;
    this.response = response;
  }
}

/**
 * Return a number in 2547XXXXXXXX form: strips spaces, dashes, brackets and a
 * leading '+', and converts Kenyan local numbers (07XXXXXXXX / 01XXXXXXXX).
 */
function normalizeMsisdn(number) {
  const digits = String(number).replace(/[\s\-()+]/g, '');
  return /^0[17]\d{8}$/.test(digits) ? `254${digits.slice(1)}` : digits;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatDateTime(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

class Client {
  /**
   * @param {string} apiKey 64-character key from the dashboard (Profile, then API keys)
   * @param {{baseUrl?: string, timeoutMs?: number, fetch?: typeof fetch}} [options]
   */
  constructor(apiKey, options = {}) {
    if (!apiKey) throw new TypeError('apiKey is required');
    this.apiKey = apiKey;
    this.baseUrl = options.baseUrl || DEFAULT_BASE_URL;
    this.timeoutMs = options.timeoutMs || 30000;
    this._fetch = options.fetch || globalThis.fetch;
    if (typeof this._fetch !== 'function') throw new TypeError('fetch is not available; use Node 18+ or pass options.fetch');
  }

  /**
   * Send an SMS to one number, a comma-separated string or an array of numbers.
   * @param {string|string[]} to
   * @param {string} message
   * @param {{sender?: string, scheduleAt?: Date}} [options]
   */
  send(to, message, options = {}) {
    const list = (Array.isArray(to) ? to : [to])
      .flatMap((part) => String(part).split(','))
      .map((n) => n.trim())
      .filter(Boolean)
      .map(normalizeMsisdn);
    if (!list.length) throw new TypeError('at least one recipient is required');
    if (!message) throw new TypeError('message is required');
    const payload = { to: list.join(','), message };
    if (options.sender) {
      if (options.sender.length > 11) throw new TypeError('sender must be 11 characters or fewer');
      payload.sender = options.sender;
    }
    if (options.scheduleAt) {
      payload.schedule = 1;
      payload.schedule_datetime = formatDateTime(options.scheduleAt);
    }
    return this._call('send', payload);
  }

  /** Return the account's credit balance. */
  balance() {
    return this._call('balance', {});
  }

  /**
   * List sent messages with delivery status. Dates are YYYY-MM-DD.
   * @param {{limit?: number, offset?: number, startDate?: string, endDate?: string}} [options]
   */
  history({ limit = 50, offset = 0, startDate, endDate } = {}) {
    const payload = { limit, offset };
    if (startDate) payload.start_date = startDate;
    if (endDate) payload.end_date = endDate;
    return this._call('history', payload);
  }

  /** List replies received from customers (two-way SMS). */
  inbox({ limit = 50 } = {}) {
    return this._call('inbox', { limit });
  }

  async _call(action, payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res;
    try {
      res = await this._fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'connectmedia-sms-node/10.0.1',
        },
        body: JSON.stringify({ action, ...payload }),
        signal: controller.signal,
      });
    } catch (err) {
      throw new ConnectMediaError('network', err.message);
    } finally {
      clearTimeout(timer);
    }
    let data;
    try {
      data = JSON.parse(await res.text());
    } catch (err) {
      throw new ConnectMediaError('invalid_response', 'The API did not return JSON');
    }
    const code = String(data.code ?? '');
    if (code !== SUCCESS_CODES[action]) {
      throw new ConnectMediaError(code || 'unknown', data.message || 'Unknown error', data);
    }
    return data;
  }
}

module.exports = { Client, ConnectMediaError, normalizeMsisdn, DEFAULT_BASE_URL };
