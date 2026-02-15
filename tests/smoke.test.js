import test from 'node:test';
import assert from 'node:assert/strict';
import KHQRService from '../khqrService.js';
import BakongAPIService from '../bakongAPI.js';

test('KHQRService.generateMD5 returns deterministic hash', () => {
  const service = new KHQRService();
  const hash = service.generateMD5('sample-qr-content');
  assert.equal(hash, 'f2ef9121db78fb8e510b6607b3185cd8');
});

test('KHQRService.generateIndividualQR validates missing account ID', () => {
  const service = new KHQRService();
  const result = service.generateIndividualQR({
    accountId: '',
    merchantName: 'Demo Shop',
    amount: 1,
    currency: 'USD',
  });

  assert.equal(result.success, false);
  assert.equal(result.error, 'Bakong account ID is required');
});

test('KHQRService.generateIndividualQR returns qr payload for valid input', () => {
  const service = new KHQRService();
  const result = service.generateIndividualQR({
    accountId: 'jonhsmith@nbcq',
    merchantName: 'Demo Shop',
    merchantCity: 'Phnom Penh',
    amount: 1,
    currency: 'USD',
    billNumber: 'INV-TEST-001',
  });

  assert.equal(result.success, true);
  assert.equal(typeof result.qrString, 'string');
  assert.equal(typeof result.md5, 'string');
  assert.match(result.md5, /^[a-f0-9]{32}$/);
});

test('BakongAPIService returns missing-token error for auth endpoints without token', async () => {
  const api = new BakongAPIService('', 'https://api-bakong.nbc.org.kh');
  const result = await api.checkTransactionByMD5('dummy-md5');

  assert.equal(result.responseCode, -1);
  assert.equal(result.errorCode, 'MISSING_TOKEN');
});

test('BakongAPIService identifies dev environment URL', () => {
  const devApi = new BakongAPIService('', 'https://api-bakong-dev.nbc.org.kh');
  const prodApi = new BakongAPIService('', 'https://api-bakong.nbc.org.kh');

  assert.equal(devApi.isUsingDevEnvironment(), true);
  assert.equal(prodApi.isUsingDevEnvironment(), false);
});

test('BakongAPIService has aggressive default deeplink timeout for fast generate flow', () => {
  const api = new BakongAPIService('', 'https://api-bakong.nbc.org.kh');
  assert.equal(api.deeplinkTimeoutMs, 3500);
});

test('BakongAPIService has retry and status timeout defaults for status checks', () => {
  const api = new BakongAPIService('', 'https://api-bakong.nbc.org.kh');
  assert.equal(api.statusTimeoutMs, 18000);
  assert.equal(api.retryAttempts, 1);
  assert.equal(api.retryDelayMs, 450);
  assert.equal(api.enableIpv4Fallback, true);
});
