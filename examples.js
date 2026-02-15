import dotenv from 'dotenv';
import KHQRService from './khqrService.js';
import BakongAPIService from './bakongAPI.js';

// Load environment variables
dotenv.config();

const khqrService = new KHQRService();
const bakongAPI = new BakongAPIService(
  process.env.BAKONG_API_TOKEN,
  process.env.BAKONG_API_BASE_URL
);

const DIVIDER = '━'.repeat(60);
const printDivider = () => console.log(`\n${DIVIDER}`);
const hasUsableToken = () => {
  const token = process.env.BAKONG_API_TOKEN;
  return Boolean(token && token !== 'your_token_here');
};
const normalizeEnv = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
};

async function runExamples() {
  console.log('\n🎯 Bakong KHQR Integration Examples\n');
  console.log(DIVIDER);

  const accountId = normalizeEnv(process.env.BAKONG_ACCOUNT_ID);
  const merchantName = normalizeEnv(process.env.MERCHANT_NAME);
  if (!accountId || !merchantName) {
    console.log('\n⚠️  Missing required configuration.');
    console.log('   Please set BAKONG_ACCOUNT_ID and MERCHANT_NAME in .env before running examples.\n');
    return;
  }

  // Example 1: Generate a simple payment QR
  console.log('\n📝 Example 1: Generate Payment QR Code\n');
  
  const payment1 = khqrService.generateIndividualQR({
    accountId,
    merchantName,
    amount: 5.00,
    currency: 'USD',
    billNumber: 'TEST-001',
    purposeOfTransaction: 'Coffee Purchase',
  });

  if (payment1.success) {
    console.log('✅ Payment QR generated successfully!');
    console.log('   Bill Number: TEST-001');
    console.log('   Amount: $5.00 USD');
    console.log('   MD5 Hash:', payment1.md5);
    console.log('   QR String Length:', payment1.qrString.length, 'characters');
  } else {
    console.log('❌ Failed:', payment1.error);
    console.log('\n💡 Check BAKONG_ACCOUNT_ID and MERCHANT_NAME values in .env, then re-run examples.');
    return;
  }

  // Example 2: Generate KHR payment
  printDivider();
  console.log('\n📝 Example 2: Generate KHR Payment\n');
  
  const payment2 = khqrService.generateIndividualQR({
    accountId,
    merchantName,
    amount: 20000,
    currency: 'KHR',
    billNumber: 'TEST-002',
    storeLabel: 'My Coffee Shop',
  });

  if (payment2.success) {
    console.log('✅ KHR Payment QR generated!');
    console.log('   Bill Number: TEST-002');
    console.log('   Amount: 20,000 KHR');
    console.log('   MD5 Hash:', payment2.md5);
  } else {
    console.log('❌ Failed:', payment2.error);
  }

  // Example 3: Decode a QR code
  printDivider();
  console.log('\n📝 Example 3: Decode QR Code\n');
  
  const decoded = khqrService.decodeKHQR(payment1.qrString);
  console.log('Decoded Information:');
  console.log('   Account ID:', decoded.data?.bakongAccountID);
  console.log('   Merchant:', decoded.data?.merchantName);
  console.log('   Amount:', decoded.data?.amount, decoded.data?.currency);
  console.log('   Bill Number:', decoded.data?.billNumber);

  // Example 4: Verify QR code
  printDivider();
  console.log('\n📝 Example 4: Verify QR Code\n');
  
  const verified = khqrService.verifyKHQR(payment1.qrString);
  console.log('QR Code Valid:', verified.isValid ? '✅ Yes' : '❌ No');

  // Example 5: Generate Deeplink (requires valid API token)
  if (hasUsableToken()) {
    printDivider();
    console.log('\n📝 Example 5: Generate Deeplink\n');
    
    try {
      const deeplink = await bakongAPI.generateDeeplink(payment1.qrString, {
        appIconUrl: 'https://bakong.nbc.org.kh/images/logo.svg',
        appName: merchantName,
        appDeepLinkCallback: 'https://example.com/payment/success',
      });

      if (deeplink.responseCode === 0) {
        console.log('✅ Deeplink generated!');
        console.log('   URL:', deeplink.data.shortLink);
        console.log('   📱 Click this link on mobile to open Bakong app');
      } else {
        console.log('❌ Failed:', deeplink.responseMessage);
      }
    } catch (error) {
      console.log('❌ Error:', error.message);
    }

    // Example 6: Check if account exists
    printDivider();
    console.log('\n📝 Example 6: Check Account Existence\n');
    
    try {
      const accountCheck = await bakongAPI.checkBakongAccount(accountId);

      if (accountCheck.responseCode === 0) {
        console.log('✅ Account exists:', accountId);
      } else {
        console.log('❌ Account not found:', accountId);
      }
    } catch (error) {
      console.log('❌ Error:', error.message);
    }

    // Example 7: Check payment status (will fail if not paid)
    printDivider();
    console.log('\n📝 Example 7: Check Payment Status\n');
    
    try {
      const status = await bakongAPI.checkTransactionByMD5(payment1.md5);
      
      if (status.responseCode === 0) {
        console.log('✅ Payment completed!');
        console.log('   From:', status.data.fromAccountId);
        console.log('   Amount:', status.data.amount, status.data.currency);
        console.log('   Hash:', status.data.hash);
      } else if (status.errorCode === 1) {
        console.log('⏳ Payment not found (not paid yet)');
      } else if (status.errorCode === 3) {
        console.log('❌ Payment failed');
      }
    } catch (error) {
      console.log('❌ Error:', error.message);
    }
  } else {
    printDivider();
    console.log('\n⚠️  Skipping API examples - No valid token configured');
    console.log('   Run: node register-token.js to get your token\n');
  }

  printDivider();
  console.log('\n✨ Examples completed!\n');
  console.log('💡 Tips:');
  console.log('   - Run the server: npm start');
  console.log('   - Open browser: http://localhost:3000');
  console.log('   - Generate QR codes and test payments');
  console.log('   - Check the README.md for full documentation\n');
}

// Run examples
runExamples().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
