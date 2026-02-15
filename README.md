# Bakong KHQR Payment Integration

A complete Node.js project for integrating Bakong KHQR payments with your personal Bakong account (e.g., ACLEDA).

## 🌟 Features

- ✅ Generate KHQR codes for payments
- ✅ Support for both USD and KHR currencies
- ✅ Generate deeplinks to open Bakong app directly
- ✅ Check payment status in real-time
- ✅ Verify Bakong account existence
- ✅ Beautiful web interface for testing
- ✅ RESTful API for easy integration
- ✅ Payment history tracking

## 📋 Prerequisites

- Node.js (v16 or higher)
- A Bakong account (e.g., username@acleda)
- Bakong API token (free registration)

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Get Your Bakong API Token

You need to register for a free API token:

1. Go to the Bakong Open API portal: https://api-bakong.nbc.org.kh
2. Register with your email
3. You'll receive a verification code via email
4. Use the code to get your access token

**Alternative: Use the API endpoints to get token programmatically**

```bash
# Step 1: Request token
curl -X POST https://api-bakong.nbc.org.kh/v1/request_token \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "organization": "Your Business Name",
    "project": "Bakong Integration"
  }'

# Step 2: Check your email for verification code, then verify
curl -X POST https://api-bakong.nbc.org.kh/v1/verify \
  -H "Content-Type: application/json" \
  -d '{"code": "YOUR_CODE_FROM_EMAIL"}'

# You'll receive your token in the response
```

### 3. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and fill in your details:

```env
# Bakong API Configuration
BAKONG_API_BASE_URL=https://api-bakong.nbc.org.kh
BAKONG_API_TOKEN=eyJ0eXAiOiJKV1QiLCJhbGc...  # Your token here

# Your Bakong Account Details
BAKONG_ACCOUNT_ID=your_username@acleda  # Replace with your actual account
MERCHANT_NAME=My Shop
MERCHANT_CITY=Phnom Penh
MERCHANT_PHONE=85512345678

# Server Configuration
PORT=3000
NODE_ENV=development
```

### 4. Run the Server

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

The server will start at `http://localhost:3000`

### 5. Run Checks

```bash
# Run local automated tests (no external API calls)
npm test

# Optional: run live integration examples
npm run test:examples
```

### 6. Open the Demo Interface

Open your browser and go to:
```
http://localhost:3000
```

You'll see a beautiful interface where you can:
- Generate payment QR codes
- Check payment status
- View payment history
- Verify Bakong accounts

## 📡 API Endpoints

### Generate KHQR Payment

```bash
POST /api/khqr/generate
Content-Type: application/json

{
  "amount": 10.00,
  "currency": "USD",
  "billNumber": "INV-001",
  "description": "Payment for services"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "billNumber": "INV-001",
    "qrString": "00020101021229190015...",
    "qrCodeImage": "data:image/png;base64,...",
    "md5": "d60f3db96913029a2af979a1662c1e72",
    "deeplinkUrl": "https://bakongsit.page.link/xyz",
    "amount": 10.00,
    "currency": "USD"
  }
}
```

### Check Payment Status

```bash
POST /api/payment/check
Content-Type: application/json

{
  "md5": "d60f3db96913029a2af979a1662c1e72"
}
```

Response:
```json
{
  "success": true,
  "status": "completed",
  "data": {
    "hash": "8465d722d7d5065f...",
    "fromAccountId": "customer@wing",
    "toAccountId": "yourname@acleda",
    "currency": "USD",
    "amount": 10.0,
    "description": "Payment for services"
  }
}
```

### Get Payment by Bill Number

```bash
GET /api/payment/INV-001
```

### List All Payments

```bash
GET /api/payments
```

### Check Bakong Account

```bash
POST /api/account/check
Content-Type: application/json

{
  "accountId": "username@bank"
}
```

### Decode KHQR

```bash
POST /api/khqr/decode
Content-Type: application/json

{
  "qrString": "00020101021229190015..."
}
```

## 🏗️ Project Structure

```
bakong-integration/
├── server.js              # Express server with all API endpoints
├── khqrService.js         # KHQR generation and management
├── bakongAPI.js           # Bakong Open API client
├── package.json           # Dependencies
├── .env.example           # Environment template
├── .env                   # Your configuration (create this)
├── public/
│   └── index.html         # Demo web interface
└── README.md              # This file
```

## 💡 Usage Examples

### In Your E-commerce Site

```javascript
// Generate payment on checkout
const response = await fetch('http://localhost:3000/api/khqr/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    amount: orderTotal,
    currency: 'USD',
    billNumber: orderId,
    description: `Order #${orderId}`
  })
});

const { data } = await response.json();

// Show QR code to customer
displayQRCode(data.qrCodeImage);

// Or redirect to Bakong app
window.location.href = data.deeplinkUrl;

// Poll for payment status
const checkInterval = setInterval(async () => {
  const status = await fetch('http://localhost:3000/api/payment/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ md5: data.md5 })
  });
  
  const result = await status.json();
  
  if (result.status === 'completed') {
    clearInterval(checkInterval);
    completeOrder();
  }
}, 3000);
```

### In Your Mobile App

```javascript
// Generate payment
const payment = await createPayment(100, 'USD', 'Order #123');

// Open Bakong app with deeplink
Linking.openURL(payment.deeplinkUrl);

// Listen for payment completion
// (Use webhook or polling in production)
```

## 🔒 Security Notes

- ✅ Never expose your API token in frontend code
- ✅ In production, use HTTPS only
- ✅ Implement proper authentication for your API
- ✅ Use webhook callbacks instead of polling for payment status
- ✅ Validate all input data
- ✅ Store payment data in a proper database (not in-memory)
- ✅ Implement rate limiting

## 📝 Production Checklist

Before deploying to production:

- [ ] Replace in-memory storage with a database (MongoDB, PostgreSQL, etc.)
- [ ] Add proper authentication/authorization
- [ ] Implement webhook handling for payment callbacks
- [ ] Add logging and monitoring
- [ ] Set up HTTPS with valid SSL certificate
- [ ] Implement rate limiting
- [ ] Add input validation and sanitization
- [ ] Set up proper error handling and reporting
- [ ] Configure CORS properly
- [ ] Add automated tests

## 🌐 Deployment

### Deploy to Heroku

```bash
# Install Heroku CLI
heroku create your-app-name

# Set environment variables
heroku config:set BAKONG_API_TOKEN=your_token
heroku config:set BAKONG_ACCOUNT_ID=your_username@acleda
heroku config:set MERCHANT_NAME="Your Shop"

# Deploy
git push heroku main
```

### Deploy to Railway/Render

1. Connect your repository
2. Set environment variables in dashboard
3. Deploy!

## 🔧 Troubleshooting

### "Unauthorized" error
- Check if your API token is valid
- Try renewing your token using `/v1/renew_token` endpoint

### "Transaction not found"
- The payment hasn't been made yet
- QR code might have expired (10 minutes for dynamic QR)

### Can't connect to Bakong API
- Check your internet connection
- Verify the API base URL is correct
- Check if Bakong API is operational

## 📚 Additional Resources

- [Bakong Official Website](https://bakong.nbc.gov.kh)
- [Bakong API Documentation](https://api-bakong.nbc.org.kh)
- [KHQR Specification](https://bakong.nbc.gov.kh/download/KHQR/)

## 🤝 Contributing

Feel free to submit issues and enhancement requests!

## 📄 License

MIT License - feel free to use this in your projects!

## 👨‍💻 Support

For issues related to:
- **This project**: Open an issue on GitHub
- **Bakong API**: Contact NBC support
- **Your bank account**: Contact your bank (ACLEDA, etc.)

---

**Happy coding! 🎉**
# Bakong_KHQR
