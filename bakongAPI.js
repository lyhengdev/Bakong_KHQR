import fetch from 'node-fetch';
import https from 'https';

class BakongAPIService {
  constructor(apiToken, baseUrl = 'https://api-bakong.nbc.org.kh') {
    this.apiToken = apiToken;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.timeoutMs = Number.parseInt(process.env.BAKONG_API_TIMEOUT_MS || '10000', 10);
    this.statusTimeoutMs = Number.parseInt(process.env.BAKONG_STATUS_TIMEOUT_MS || '18000', 10);
    this.deeplinkTimeoutMs = Number.parseInt(process.env.BAKONG_DEEPLINK_TIMEOUT_MS || '3500', 10);
    this.retryAttempts = Number.parseInt(process.env.BAKONG_API_RETRY_ATTEMPTS || '1', 10);
    this.retryDelayMs = Number.parseInt(process.env.BAKONG_API_RETRY_DELAY_MS || '450', 10);
    this.enableIpv4Fallback = String(process.env.BAKONG_IPV4_FALLBACK || 'true').toLowerCase() !== 'false';
    this.httpsIpv4Agent = new https.Agent({ family: 4 });
  }

  isUsingDevEnvironment() {
    return this.baseUrl.includes('-dev.');
  }

  async post(endpoint, payload, requiresAuth = false, options = {}) {
    if (requiresAuth && !this.apiToken) {
      return {
        responseCode: -1,
        errorCode: 'MISSING_TOKEN',
        responseMessage: 'Bakong API token is missing',
      };
    }

    const headers = {
      'Content-Type': 'application/json',
    };

    if (requiresAuth) {
      headers.Authorization = `Bearer ${this.apiToken}`;
    }

    const timeoutMs = Number.parseInt(String(options.timeoutMs ?? this.timeoutMs), 10);
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    const shouldForceIpv4 = options.forceIpv4 === true;
    const canTryIpv4Fallback = this.enableIpv4Fallback && !shouldForceIpv4;

    let response;
    try {
      response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
        agent: shouldForceIpv4 ? this.httpsIpv4Agent : undefined,
      });
    } catch (error) {
      clearTimeout(timeoutHandle);
      const retryableNetworkError = [
        'ENETUNREACH',
        'EHOSTUNREACH',
        'ETIMEDOUT',
        'ECONNREFUSED',
        'ECONNRESET',
      ].includes(String(error.code));

      if (canTryIpv4Fallback && (error.name === 'AbortError' || retryableNetworkError)) {
        return this.post(endpoint, payload, requiresAuth, {
          ...options,
          forceIpv4: true,
          ipv4FallbackTried: true,
        });
      }

      if (error.name === 'AbortError') {
        return {
          responseCode: -1,
          errorCode: 'TIMEOUT',
          responseMessage: options.ipv4FallbackTried
            ? `Bakong API request timed out after ${timeoutMs}ms (including IPv4 fallback)`
            : `Bakong API request timed out after ${timeoutMs}ms`,
        };
      }

      return {
        responseCode: -1,
        errorCode: 'NETWORK_ERROR',
        responseMessage: error.message || 'Network request failed',
      };
    }
    clearTimeout(timeoutHandle);

    let result;
    try {
      result = await response.json();
    } catch (error) {
      return {
        responseCode: -1,
        errorCode: 'INVALID_RESPONSE',
        responseMessage: `Invalid response from Bakong API (HTTP ${response.status})`,
      };
    }

    if (!response.ok && result.responseCode === undefined) {
      return {
        responseCode: -1,
        errorCode: response.status,
        responseMessage: `Bakong API request failed (HTTP ${response.status})`,
        data: result,
      };
    }

    return result;
  }

  isRetryable(result) {
    return (
      result &&
      Number(result.responseCode) === -1 &&
      ['TIMEOUT', 'NETWORK_ERROR', 'INVALID_RESPONSE'].includes(String(result.errorCode))
    );
  }

  async sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async postWithRetry(endpoint, payload, requiresAuth = false, options = {}) {
    const retries = Number.parseInt(String(options.retries ?? this.retryAttempts), 10);
    const retryDelayMs = Number.parseInt(String(options.retryDelayMs ?? this.retryDelayMs), 10);

    let result = await this.post(endpoint, payload, requiresAuth, options);
    if (!this.isRetryable(result) || retries <= 0) {
      return result;
    }

    for (let attempt = 1; attempt <= retries; attempt += 1) {
      await this.sleep(retryDelayMs);
      result = await this.post(endpoint, payload, requiresAuth, options);
      if (!this.isRetryable(result)) {
        return result;
      }
    }

    return result;
  }

  /**
   * Request a new token
   */
  async requestToken(email, organization, project) {
    return this.post('/v1/request_token', { email, organization, project });
  }

  /**
   * Verify token with code from email
   */
  async verifyToken(code) {
    return this.post('/v1/verify', { code });
  }

  /**
   * Renew expired token
   */
  async renewToken(email) {
    return this.post('/v1/renew_token', { email });
  }

  /**
   * Generate deeplink from QR code
   */
  async generateDeeplink(qrString, sourceInfo) {
    return this.post(
      '/v1/generate_deeplink_by_qr',
      {
        qr: qrString,
        sourceInfo: sourceInfo || {
          appIconUrl: 'https://bakong.nbc.org.kh/images/logo.svg',
          appName: 'My Shop',
          appDeepLinkCallback: 'https://yourwebsite.com/payment/success',
        },
      },
      false,
      { timeoutMs: this.deeplinkTimeoutMs }
    );
  }

  /**
   * Check transaction status by MD5
   */
  async checkTransactionByMD5(md5Hash) {
    return this.postWithRetry(
      '/v1/check_transaction_by_md5',
      { md5: md5Hash },
      true,
      { timeoutMs: this.statusTimeoutMs }
    );
  }

  /**
   * Check transaction status by full hash
   */
  async checkTransactionByHash(hash) {
    return this.postWithRetry(
      '/v1/check_transaction_by_hash',
      { hash },
      true,
      { timeoutMs: this.statusTimeoutMs }
    );
  }

  /**
   * Check transaction status by short hash
   */
  async checkTransactionByShortHash(shortHash, amount, currency) {
    return this.postWithRetry(
      '/v1/check_transaction_by_short_hash',
      {
        hash: shortHash,
        amount,
        currency,
      },
      true,
      { timeoutMs: this.statusTimeoutMs }
    );
  }

  /**
   * Check if Bakong account exists
   */
  async checkBakongAccount(accountId) {
    return this.post('/v1/check_bakong_account', { accountId }, true);
  }
}

export default BakongAPIService;
