import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import QRCode from 'qrcode';
import KHQRService from './khqrService.js';
import BakongAPIService from './bakongAPI.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize services
const khqrService = new KHQRService();
const bakongAPI = new BakongAPIService(
  process.env.BAKONG_API_TOKEN,
  process.env.BAKONG_API_BASE_URL
);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// In-memory storage for demo (use database in production)
const payments = new Map();
const SUPPORTED_CURRENCIES = new Set(['USD', 'KHR']);

const normalizeOptionalText = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
};

const appendWarning = (existingWarning, nextWarning) => (
  existingWarning ? `${existingWarning} | ${nextWarning}` : nextWarning
);

const shouldGenerateDeeplinkInBackground = () => {
  const mode = String(process.env.DEEPLINK_MODE || 'async').toLowerCase();
  return mode !== 'sync';
};

const isDemoManualSettleEnabled = () => (
  String(process.env.DEMO_MANUAL_SETTLE_ENABLED || 'true').toLowerCase() !== 'false'
);

const isLikelyPendingMessage = (message) => {
  if (typeof message !== 'string' || !message.trim()) {
    return false;
  }

  return /(not found|not yet|pending|processing|wait)/i.test(message);
};

const resolvePaymentStatus = (result) => {
  if (!result || typeof result !== 'object') {
    return 'error';
  }

  const responseCode = Number(result.responseCode);
  const errorCode = result.errorCode;
  const errorCodeNumber = Number(errorCode);
  const responseMessage = typeof result.responseMessage === 'string'
    ? result.responseMessage
    : '';

  if (responseCode === 0) {
    return 'completed';
  }

  if (errorCodeNumber === 3) {
    return 'failed';
  }

  if (errorCodeNumber === 1 || isLikelyPendingMessage(responseMessage)) {
    return 'pending';
  }

  if (['MISSING_TOKEN', 'TIMEOUT', 'NETWORK_ERROR', 'INVALID_RESPONSE'].includes(String(errorCode))) {
    return 'error';
  }

  if (responseCode === -1) {
    return 'error';
  }

  // Unknown non-success provider responses are treated as actionable errors.
  return 'error';
};

const getProviderSummary = (result) => ({
  responseCode: result?.responseCode ?? null,
  errorCode: result?.errorCode ?? null,
  responseMessage: result?.responseMessage ?? null,
});

const buildStatusMessage = (status, result) => {
  if (status === 'completed') {
    return 'Payment completed';
  }

  if (status === 'failed') {
    return result?.responseMessage || 'Payment failed';
  }

  if (status === 'pending') {
    return result?.responseMessage || 'Payment is still pending';
  }

  return result?.responseMessage || 'Unable to confirm payment status due to provider error';
};

/**
 * Health check endpoint
 */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Generate KHQR code for payment
 */
app.post('/api/khqr/generate', async (req, res) => {
  try {
    const {
      amount,
      currency = 'USD',
      billNumber,
      description,
      storeLabel,
    } = req.body;

    const parsedAmount = Number.parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount is required and must be greater than 0',
      });
    }

    const resolvedCurrency = String(currency).toUpperCase();
    if (!SUPPORTED_CURRENCIES.has(resolvedCurrency)) {
      return res.status(400).json({
        success: false,
        error: 'Currency must be either USD or KHR',
      });
    }

    if (!process.env.BAKONG_ACCOUNT_ID || !process.env.MERCHANT_NAME) {
      return res.status(500).json({
        success: false,
        error: 'Server is missing required Bakong configuration',
      });
    }

    // Generate unique bill number if not provided
    const finalBillNumber = normalizeOptionalText(billNumber) || `INV-${Date.now()}`;
    const purposeOfTransaction = normalizeOptionalText(description);
    const resolvedStoreLabel = normalizeOptionalText(storeLabel) || process.env.MERCHANT_NAME;

    // Generate KHQR
    const result = khqrService.generateIndividualQR({
      accountId: process.env.BAKONG_ACCOUNT_ID,
      merchantName: process.env.MERCHANT_NAME,
      merchantCity: process.env.MERCHANT_CITY || 'Phnom Penh',
      amount: parsedAmount,
      currency: resolvedCurrency,
      billNumber: finalBillNumber,
      mobileNumber: process.env.MERCHANT_PHONE,
      storeLabel: resolvedStoreLabel,
      purposeOfTransaction,
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error,
      });
    }

    // Generate QR code image
    const qrCodeDataURL = await QRCode.toDataURL(result.qrString, {
      width: 300,
      margin: 1,
    });

    // Generate deeplink, but do not fail the entire request if this call fails
    let deeplinkUrl = null;
    let warning = null;

    const sourceInfo = {
      appIconUrl: 'https://bakong.nbc.org.kh/images/logo.svg',
      appName: process.env.MERCHANT_NAME,
      appDeepLinkCallback: `${req.protocol}://${req.get('host')}/payment/callback`,
    };

    if (process.env.BAKONG_API_TOKEN) {
      if (shouldGenerateDeeplinkInBackground()) {
        warning = appendWarning(
          warning,
          'Deeplink is being prepared in background. QR scan payment works immediately.'
        );
      } else {
        const deeplink = await bakongAPI.generateDeeplink(result.qrString, sourceInfo);

        deeplinkUrl = deeplink.data?.shortLink || null;
        if (!deeplinkUrl && deeplink.responseCode !== 0) {
          warning = deeplink.responseMessage || 'Unable to generate deeplink';
        }
      }
    } else {
      warning = 'BAKONG_API_TOKEN is not configured, deeplink is unavailable';
    }

    if (bakongAPI.isUsingDevEnvironment()) {
      warning = appendWarning(
        warning,
        'Using Bakong DEV API base URL. Live payments may not reflect in status checks.'
      );
    }

    // Store payment info
    const paymentInfo = {
      billNumber: finalBillNumber,
      amount: parsedAmount,
      currency: resolvedCurrency,
      qrString: result.qrString,
      md5: result.md5,
      description: purposeOfTransaction,
      status: 'pending',
      createdAt: new Date().toISOString(),
      deeplinkUrl,
    };

    payments.set(result.md5, paymentInfo);

    if (process.env.BAKONG_API_TOKEN && shouldGenerateDeeplinkInBackground()) {
      void (async () => {
        try {
          const deeplink = await bakongAPI.generateDeeplink(result.qrString, sourceInfo);
          const shortLink = deeplink.data?.shortLink || null;
          if (!shortLink) {
            return;
          }

          const currentPayment = payments.get(result.md5);
          if (!currentPayment) {
            return;
          }

          currentPayment.deeplinkUrl = shortLink;
          payments.set(result.md5, currentPayment);
        } catch (deeplinkError) {
          console.error('Background deeplink generation failed:', deeplinkError);
        }
      })();
    }

    const responseBody = {
      success: true,
      data: {
        billNumber: finalBillNumber,
        qrString: result.qrString,
        qrCodeImage: qrCodeDataURL,
        md5: result.md5,
        deeplinkUrl,
        amount: parsedAmount,
        currency: resolvedCurrency,
        manualSettleEnabled: isDemoManualSettleEnabled(),
      },
    };

    if (warning) {
      responseBody.warning = warning;
    }

    res.json(responseBody);
  } catch (error) {
    console.error('Error generating KHQR:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Check payment status
 */
app.post('/api/payment/check', async (req, res) => {
  try {
    const { md5 } = req.body;

    if (!md5) {
      return res.status(400).json({
        success: false,
        error: 'MD5 hash is required',
      });
    }

    const payment = payments.get(md5);
    if (payment && payment.manualSettledAt) {
      return res.json({
        success: true,
        status: 'completed',
        data: {
          hash: payment.transactionHash || null,
          fromAccountId: payment.fromAccount || 'demo@manual',
          amount: payment.amount,
          currency: payment.currency,
        },
        deeplinkUrl: payment.deeplinkUrl || null,
        message: 'Payment marked as completed manually (demo mode)',
        errorCode: null,
        checkedBy: 'manual',
        provider: null,
        warning: 'Demo manual settle override is enabled.',
        manualSettleEnabled: isDemoManualSettleEnabled(),
      });
    }

    // Check with Bakong API (primary: md5)
    let result = await bakongAPI.checkTransactionByMD5(md5);
    let status = resolvePaymentStatus(result);
    let checkedBy = 'md5';
    let fallbackProvider = null;

    // Update local storage
    if (
      status === 'pending'
      && payment
      && payment.qrString
      && process.env.BAKONG_API_TOKEN
    ) {
      const shortHash = khqrService.generateShortHash(payment.qrString);
      const shortHashResult = await bakongAPI.checkTransactionByShortHash(
        shortHash,
        payment.amount,
        payment.currency
      );
      const shortHashStatus = resolvePaymentStatus(shortHashResult);

      fallbackProvider = {
        checkedBy: 'short_hash',
        ...getProviderSummary(shortHashResult),
      };

      if (shortHashStatus === 'completed' || shortHashStatus === 'failed') {
        result = shortHashResult;
        status = shortHashStatus;
        checkedBy = 'short_hash';
      }
    }

    if (payment && status === 'completed') {
      payment.status = 'completed';
      payment.completedAt = new Date().toISOString();
      payment.transactionHash = result.data?.hash || null;
      payment.fromAccount = result.data?.fromAccountId || null;
      payments.set(md5, payment);
    } else if (payment && status === 'failed') {
      payment.status = 'failed';
      payments.set(md5, payment);
    } else if (payment && status === 'error') {
      payment.lastProviderError = {
        checkedAt: new Date().toISOString(),
        checkedBy,
        ...getProviderSummary(result),
      };
      payments.set(md5, payment);
    }

    let warning = null;
    if (bakongAPI.isUsingDevEnvironment()) {
      warning = appendWarning(
        warning,
        'Using Bakong DEV API base URL. Live payments may remain pending.'
      );
    }

    if (status === 'error') {
      warning = appendWarning(
        warning,
        'Provider status lookup failed. Please verify API base URL/token and retry.'
      );
    }

    res.json({
      success: status === 'completed',
      status,
      data: result.data,
      deeplinkUrl: payment?.deeplinkUrl || null,
      message: buildStatusMessage(status, result),
      errorCode: result.errorCode,
      checkedBy,
      provider: {
        checkedBy,
        ...getProviderSummary(result),
        fallback: fallbackProvider,
      },
      warning,
      manualSettleEnabled: isDemoManualSettleEnabled(),
    });
  } catch (error) {
    console.error('Error checking payment:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Mark payment as completed manually (demo fallback)
 */
app.post('/api/payment/mark-paid', (req, res) => {
  try {
    if (!isDemoManualSettleEnabled()) {
      return res.status(403).json({
        success: false,
        error: 'Manual settle mode is disabled',
      });
    }

    const { md5, fromAccountId, transactionHash } = req.body || {};
    if (!md5) {
      return res.status(400).json({
        success: false,
        error: 'MD5 hash is required',
      });
    }

    const payment = payments.get(md5);
    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found',
      });
    }

    payment.status = 'completed';
    payment.completedAt = new Date().toISOString();
    payment.manualSettledAt = payment.completedAt;
    payment.fromAccount = normalizeOptionalText(fromAccountId) || 'demo@manual';
    payment.transactionHash = normalizeOptionalText(transactionHash) || `manual-${Date.now()}`;
    payments.set(md5, payment);

    return res.json({
      success: true,
      status: 'completed',
      message: 'Payment marked as completed manually (demo mode)',
      data: {
        md5,
        ...payment,
      },
      manualSettleEnabled: true,
    });
  } catch (error) {
    console.error('Error manually completing payment:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get payment by md5 hash
 */
app.get('/api/payment-md5/:md5', (req, res) => {
  try {
    const { md5 } = req.params;
    const payment = payments.get(md5);

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found',
      });
    }

    return res.json({
      success: true,
      data: {
        md5,
        ...payment,
      },
    });
  } catch (error) {
    console.error('Error getting payment by md5:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get payment by bill number
 */
app.get('/api/payment/:billNumber', (req, res) => {
  try {
    const { billNumber } = req.params;

    // Find payment by bill number
    let payment = null;
    for (const [md5, paymentData] of payments.entries()) {
      if (paymentData.billNumber === billNumber) {
        payment = { md5, ...paymentData };
        break;
      }
    }

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found',
      });
    }

    res.json({
      success: true,
      data: payment,
    });
  } catch (error) {
    console.error('Error getting payment:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * List all payments
 */
app.get('/api/payments', (_req, res) => {
  try {
    const paymentsList = Array.from(payments.entries()).map(([md5, payment]) => ({
      md5,
      ...payment,
    }));

    res.json({
      success: true,
      data: paymentsList,
    });
  } catch (error) {
    console.error('Error listing payments:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Decode KHQR string
 */
app.post('/api/khqr/decode', (req, res) => {
  try {
    const { qrString } = req.body;

    if (!qrString) {
      return res.status(400).json({
        success: false,
        error: 'QR string is required',
      });
    }

    const decoded = khqrService.decodeKHQR(qrString);
    const verified = khqrService.verifyKHQR(qrString);

    res.json({
      success: true,
      data: {
        decoded: decoded,
        isValid: verified.isValid,
      },
    });
  } catch (error) {
    console.error('Error decoding KHQR:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Check if Bakong account exists
 */
app.post('/api/account/check', async (req, res) => {
  try {
    const { accountId } = req.body;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        error: 'Account ID is required',
      });
    }

    const result = await bakongAPI.checkBakongAccount(accountId);

    res.json({
      success: result.responseCode === 0,
      exists: result.responseCode === 0,
      message: result.responseMessage,
      errorCode: result.errorCode,
    });
  } catch (error) {
    console.error('Error checking account:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Payment callback endpoint
 */
app.get('/payment/callback', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payment Completed</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 10px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.2);
          text-align: center;
        }
        h1 { color: #28a745; margin-bottom: 10px; }
        p { color: #666; font-size: 18px; }
        .checkmark {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: #28a745;
          margin: 20px auto;
          position: relative;
        }
        .checkmark:after {
          content: '✓';
          color: white;
          font-size: 50px;
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="checkmark"></div>
        <h1>Payment Successful!</h1>
        <p>Thank you for your payment.</p>
        <p>You can close this window now.</p>
      </div>
    </body>
    </html>
  `);
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Bakong Integration Server running on port ${PORT}`);
  console.log(`📱 Health check: http://localhost:${PORT}/health`);
  console.log(`\n⚙️  Configuration:`);
  console.log(`   - Bakong Account: ${process.env.BAKONG_ACCOUNT_ID || 'NOT SET'}`);
  console.log(`   - Merchant Name: ${process.env.MERCHANT_NAME || 'NOT SET'}`);
  console.log(`   - API Token: ${process.env.BAKONG_API_TOKEN ? '✓ SET' : '✗ NOT SET'}`);
  console.log(`   - API Base URL: ${process.env.BAKONG_API_BASE_URL || 'https://api-bakong.nbc.org.kh'}`);

  if (bakongAPI.isUsingDevEnvironment()) {
    console.log('   - WARNING: DEV API URL is active; real payments may not resolve to completed.');
  }

  console.log(`\n📝 Don't forget to copy .env.example to .env and configure it!\n`);
});

export default app;
