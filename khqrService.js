import { BakongKHQR, khqrData, IndividualInfo, MerchantInfo } from 'bakong-khqr';
import crypto from 'crypto';

class KHQRService {
  constructor() {
    this.bakongKHQR = new BakongKHQR();
  }

  resolveCurrency(currency) {
    return currency === 'KHR' ? khqrData.currency.khr : khqrData.currency.usd;
  }

  validateRequiredFields(accountId, merchantName) {
    if (!accountId || !String(accountId).trim()) {
      return 'Bakong account ID is required';
    }

    if (!merchantName || !String(merchantName).trim()) {
      return 'Merchant name is required';
    }

    return null;
  }

  /**
   * Generate KHQR for individual/personal account
   */
  generateIndividualQR({
    accountId,
    merchantName,
    merchantCity = 'Phnom Penh',
    amount = 0,
    currency = 'USD',
    billNumber = null,
    mobileNumber = null,
    storeLabel = null,
    terminalLabel = null,
    purposeOfTransaction = null,
  }) {
    const validationError = this.validateRequiredFields(accountId, merchantName);
    if (validationError) {
      return {
        success: false,
        error: validationError,
      };
    }

    const optionalData = {};
    const resolvedCurrency = this.resolveCurrency(currency);

    if (amount > 0) {
      optionalData.amount = amount;
      optionalData.currency = resolvedCurrency;
      // For dynamic QR (with amount), set expiration to 10 minutes from now
      optionalData.expirationTimestamp = Date.now() + 10 * 60 * 1000;
    }

    if (billNumber) optionalData.billNumber = billNumber;
    if (mobileNumber) optionalData.mobileNumber = mobileNumber;
    if (storeLabel) optionalData.storeLabel = storeLabel;
    if (terminalLabel) optionalData.terminalLabel = terminalLabel;
    if (purposeOfTransaction) optionalData.purposeOfTransaction = purposeOfTransaction;

    const individualInfo = new IndividualInfo(
      accountId,
      merchantName,
      merchantCity,
      {
        currency: resolvedCurrency,
        ...optionalData,
      }
    );

    const result = this.bakongKHQR.generateIndividual(individualInfo);
    
    if (result.status.code === 0) {
      return {
        success: true,
        qrString: result.data.qr,
        md5: this.generateMD5(result.data.qr),
      };
    } else {
      return {
        success: false,
        error: result.status.message,
      };
    }
  }

  /**
   * Generate KHQR for merchant account
   */
  generateMerchantQR({
    accountId,
    merchantName,
    merchantId,
    acquiringBank,
    merchantCity = 'Phnom Penh',
    amount = 0,
    currency = 'USD',
    billNumber = null,
    mobileNumber = null,
    storeLabel = null,
    terminalLabel = null,
  }) {
    const validationError = this.validateRequiredFields(accountId, merchantName);
    if (validationError) {
      return {
        success: false,
        error: validationError,
      };
    }

    const optionalData = {};
    const resolvedCurrency = this.resolveCurrency(currency);

    if (amount > 0) {
      optionalData.amount = amount;
      optionalData.currency = resolvedCurrency;
      optionalData.expirationTimestamp = Date.now() + 10 * 60 * 1000;
    }

    if (billNumber) optionalData.billNumber = billNumber;
    if (mobileNumber) optionalData.mobileNumber = mobileNumber;
    if (storeLabel) optionalData.storeLabel = storeLabel;
    if (terminalLabel) optionalData.terminalLabel = terminalLabel;

    const merchantInfo = new MerchantInfo(
      accountId,
      merchantName,
      merchantCity,
      merchantId,
      acquiringBank,
      {
        currency: resolvedCurrency,
        ...optionalData,
      }
    );

    const result = this.bakongKHQR.generateMerchant(merchantInfo);
    
    if (result.status.code === 0) {
      return {
        success: true,
        qrString: result.data.qr,
        md5: this.generateMD5(result.data.qr),
      };
    } else {
      return {
        success: false,
        error: result.status.message,
      };
    }
  }

  /**
   * Verify KHQR string
   */
  verifyKHQR(qrString) {
    return BakongKHQR.verify(qrString);
  }

  /**
   * Decode KHQR string to get information
   */
  decodeKHQR(qrString) {
    return BakongKHQR.decode(qrString);
  }

  /**
   * Generate MD5 hash from QR string
   */
  generateMD5(qrString) {
    return crypto.createHash('md5').update(qrString).digest('hex');
  }

  /**
   * Generate short hash (first 8 characters of full hash)
   */
  generateShortHash(qrString) {
    const fullHash = crypto.createHash('sha256').update(qrString).digest('hex');
    return fullHash.substring(0, 8);
  }
}

export default KHQRService;
