# 🚀 ASTRO META-TRADE

**Intelligent Crypto Investment Platform — Full-Stack Production Build**

Bloomberg Terminal meets Web3 DeFi. Built with React, Vite, TypeScript, TailwindCSS, Framer Motion, Node.js, Express, and Supabase.

---

## 📦 Project Structure

```
astro-meta-trade/
├── frontend/          # React + Vite + TypeScript + TailwindCSS
├── backend/           # Node.js + Express + TypeScript API
├── supabase/          # SQL migration + RLS policies
└── README.md
```

---

## 🛠️ Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier works)
- A [Stripe](https://stripe.com) account
- A [Paystack](https://paystack.com) account (optional)
- A [PayPal Developer](https://developer.paypal.com) app (optional)
- SMTP credentials (Gmail App Password works)

---

## 🗄️ 1. Database Setup (Supabase)

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Navigate to **SQL Editor**
3. Copy and paste the contents of `supabase/migration.sql`
4. Click **Run** — this creates all 10 tables, indexes, triggers, and RLS policies
5. After the migration runs, make yourself an admin:
   ```sql
   UPDATE public.users SET role = 'admin' WHERE email = 'your@email.com';
   ```

---

## ⚙️ 2. Frontend Setup

```bash
cd frontend
cp .env.example .env
```

Edit `.env`:
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key         # Found in: Project Settings > API
VITE_API_URL=http://localhost:4000
```

```bash
npm install
npm run dev
```

Frontend runs at **http://localhost:3000**

---

## ⚙️ 3. Backend Setup

```bash
cd backend
cp .env.example .env
```

Edit `.env` with your credentials:
```env
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # Project Settings > API > service_role

STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

PAYSTACK_SECRET_KEY=sk_test_...

PAYPAL_CLIENT_ID=...
PAYPAL_SECRET=...
PAYPAL_WEBHOOK_ID=...

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your@gmail.com
SMTP_PASS=your-app-password
ADMIN_EMAIL=admin@astrometatrade.com
```

```bash
npm install
npm run dev
```

Backend runs at **http://localhost:4000**

---

## 💳 4. Stripe Setup

1. Create a Stripe account at [stripe.com](https://stripe.com)
2. Get your **Secret Key** from Dashboard > Developers > API Keys
3. Set up a webhook:
   - Go to **Developers > Webhooks > Add Endpoint**
   - URL: `https://your-domain.com/api/webhooks/stripe`
   - Events to listen: `checkout.session.completed`
   - Copy the **Signing Secret** → `STRIPE_WEBHOOK_SECRET`

**Local testing with Stripe CLI:**
```bash
stripe listen --forward-to localhost:4000/api/webhooks/stripe
```

---

## 💚 5. Paystack Setup

1. Create account at [paystack.com](https://paystack.com)
2. Go to **Settings > API Keys & Webhooks**
3. Copy your **Secret Key** → `PAYSTACK_SECRET_KEY`
4. Add webhook URL: `https://your-domain.com/api/webhooks/paystack`

---

## 🅿️ 6. PayPal Setup

1. Go to [developer.paypal.com](https://developer.paypal.com)
2. Create an app → get **Client ID** and **Secret**
3. Add webhook: `https://your-domain.com/api/webhooks/paypal`
   - Event: `CHECKOUT.ORDER.APPROVED`
4. Copy the **Webhook ID** → `PAYPAL_WEBHOOK_ID`

---

## 🪙 7. Adding Crypto Deposit Addresses

1. Log in as admin
2. Go to **Admin Panel → Deposit Addresses**
3. Add wallet addresses for each coin/chain:
   - **BTC** — Bitcoin mainnet
   - **ETH** — Ethereum mainnet  
   - **USDC** — ERC-20
   - **USDT** — ERC-20, TRC-20, BEP-20 (one entry each)
4. Toggle each address to **Active**

Alternatively, insert directly via SQL:
```sql
INSERT INTO deposit_addresses (coin, chain, address, is_active)
VALUES 
  ('btc',  'btc',   'your-btc-address',  TRUE),
  ('eth',  'eth',   'your-eth-address',  TRUE),
  ('usdc', 'erc20', 'your-usdc-address', TRUE),
  ('usdt', 'erc20', 'your-usdt-erc20',   TRUE),
  ('usdt', 'trc20', 'your-usdt-trc20',   TRUE),
  ('usdt', 'bep20', 'your-usdt-bep20',   TRUE);
```

---

## 📧 8. Email Setup (Gmail)

1. Enable 2FA on your Gmail account
2. Go to **Google Account > Security > App Passwords**
3. Generate an App Password for "Mail"
4. Use that as `SMTP_PASS` in your `.env`

---

## 💬 9. Live Chat (Tawk.to)

1. Sign up at [tawk.to](https://www.tawk.to)
2. Create a property and get your **Property ID**
3. Add the Tawk.to script to `frontend/index.html`:
```html
<script type="text/javascript">
var Tawk_API=Tawk_API||{}, Tawk_LoadStart=new Date();
(function(){var s1=document.createElement("script"),s0=document.getElementsByTagName("script")[0];
s1.async=true;s1.src='https://embed.tawk.to/YOUR_PROPERTY_ID/default';
s1.charset='UTF-8';s1.setAttribute('crossorigin','*');
s0.parentNode.insertBefore(s1,s0);})();
</script>
```

---

## 🚀 10. Production Deployment

### Frontend (Vercel)
```bash
cd frontend
npm run build
# Deploy dist/ to Vercel, Netlify, or any static host
```

Set environment variables in your hosting dashboard.

### Backend (Railway / Render / VPS)
```bash
cd backend
npm run build
npm start
```

Set all `.env` variables in your platform dashboard.

### Environment Checklist for Production
- [ ] `NODE_ENV=production`
- [ ] `FRONTEND_URL=https://yourdomain.com`
- [ ] All Supabase keys configured
- [ ] All payment provider keys + webhook secrets set
- [ ] SMTP configured and tested
- [ ] Stripe CLI replaced with production webhook endpoint
- [ ] PayPal switched from sandbox to live
- [ ] Admin user created in database

---

## 🔐 Security Checklist

- [x] Helmet.js security headers
- [x] CORS restricted to frontend domain
- [x] Rate limiting (100/15min global, 5/15min auth)
- [x] XSS cleaning on all inputs
- [x] JWT via Supabase (httpOnly cookies)
- [x] Webhook signature verification (Stripe, Paystack, PayPal)
- [x] Input validation with Zod (client + server)
- [x] RLS policies on all database tables
- [x] SQL injection prevention (parameterized Supabase client)
- [x] Audit logging on all authenticated actions
- [x] HTTPS redirect in production
- [x] Password hashing by Supabase Auth (bcrypt)
- [x] 2FA TOTP support (speakeasy)
- [x] Admin role middleware on all admin routes

---

## 📊 Admin Panel

Access at `/admin` when logged in as an admin user.

**Features:**
- Dashboard with key metrics
- User management table
- Portfolio Manager — update individual user balances, return rates, and manager assignments daily
- Withdrawal approvals (approve/reject with one click)
- Deposit address management
- Full audit log viewer

---

## 🌍 Languages Supported

🇺🇸 English · 🇫🇷 French · 🇪🇸 Spanish · 🇨🇳 Chinese (Simplified) · 🇮🇹 Italian · 🇩🇪 German

Add translations in `frontend/src/i18n/locales/`.

---

## 🤝 Support

For technical issues, contact: support@astrometatrade.com

---

*Built to the highest production standard. © 2025 ASTRO META-TRADE.*
