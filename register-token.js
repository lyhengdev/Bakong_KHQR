import fetch from 'node-fetch';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

const BASE_URL = 'https://api-bakong.nbc.org.kh';

async function registerToken() {
  console.log('\n🔐 Bakong API Token Registration Helper\n');
  console.log('This script will help you get your Bakong API token.\n');

  try {
    // Step 1: Get user information
    console.log('📝 Step 1: Enter your information\n');
    const email = await question('Email address: ');
    const organization = await question('Organization/Business name: ');
    const project = await question('Project name: ');

    console.log('\n🚀 Requesting token...\n');

    // Step 2: Request token
    const requestResponse = await fetch(`${BASE_URL}/v1/request_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, organization, project })
    });

    const requestResult = await requestResponse.json();

    if (requestResult.responseCode === 0) {
      console.log('✅', requestResult.responseMessage);
      console.log('\n📧 Please check your email for the verification code.\n');

      // Step 3: Verify code
      const code = await question('Enter verification code: ');

      console.log('\n🔍 Verifying code...\n');

      const verifyResponse = await fetch(`${BASE_URL}/v1/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });

      const verifyResult = await verifyResponse.json();

      if (verifyResult.responseCode === 0 && verifyResult.data?.token) {
        console.log('🎉 Success! Your token has been generated.\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('📋 Your Bakong API Token:\n');
        console.log(verifyResult.data.token);
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('⚠️  Keep this token secure! Add it to your .env file:\n');
        console.log(`BAKONG_API_TOKEN=${verifyResult.data.token}\n`);
        console.log('💡 Tip: Copy .env.example to .env and paste the token there.\n');
      } else {
        console.log('❌ Verification failed:', verifyResult.responseMessage);
        console.log('Error code:', verifyResult.errorCode);
      }
    } else {
      console.log('❌ Request failed:', requestResult.responseMessage);
      console.log('Error code:', requestResult.errorCode);
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    rl.close();
  }
}

// Run the registration
registerToken();
