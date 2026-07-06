# Deploy AstroPaymentReceiver — Step-by-Step

## What this contract does
- Accepts ETH, USDT, and USDC payments from users
- Immediately forwards all funds to **your wallet** (no funds are held in the contract)
- Emits a `PaymentReceived` event that the backend listener watches to auto-credit user balances

---

## Step 1 — Open Remix IDE
Go to **https://remix.ethereum.org**

## Step 2 — Create the contract file
1. In the left sidebar, click the **+** icon to create a new file
2. Name it `AstroPaymentReceiver.sol`
3. Copy and paste the full contents of `contracts/AstroPaymentReceiver.sol` from this project

## Step 3 — Compile
1. Click the **Solidity compiler** icon (left sidebar)
2. Set compiler version to **0.8.20**
3. Click **Compile AstroPaymentReceiver.sol**
4. Confirm no errors appear

## Step 4 — Deploy to Ethereum Mainnet
1. Click the **Deploy & Run Transactions** icon (left sidebar)
2. Change **Environment** to **Injected Provider - MetaMask**
3. MetaMask will pop up — connect and switch to **Ethereum Mainnet**
4. Make sure your wallet has a small amount of ETH for gas (≈ $5–10 worth)
5. In the **Contract** dropdown, select `AstroPaymentReceiver`
6. In the **Deploy** field, enter your owner wallet address as the constructor argument:
   ```
   0xf2BA87c0DCbA20Ba7dC3218fFeddc71a552f68Ce
   ```
7. Click **Deploy** and confirm in MetaMask

## Step 5 — Copy the contract address
After deployment, the contract appears under **Deployed Contracts** in Remix.
Copy the address (starts with `0x`).

## Step 6 — Save the contract address in Replit
1. In the Replit project, go to **Secrets** (or ask the agent to set it)
2. Set the environment variable:
   - Key: `CONTRACT_ADDRESS`
   - Value: the address you copied

OR tell the agent: "I deployed the contract, here's the address: 0x..."
The backend blockchain listener will start automatically on the next restart.

---

## Supported tokens (Ethereum Mainnet)
| Token | Contract address |
|-------|-----------------|
| USDT  | 0xdAC17F958D2ee523a2206206994597C13D831ec7 |
| USDC  | 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 |
| ETH   | Native — no token address needed |

---

## How it works end-to-end
1. User selects coin + USD amount → backend generates a unique `paymentId` and pending transaction
2. User clicks "Pay with Wallet" → MetaMask opens, sends ETH/tokens to the contract
3. Contract forwards funds to your wallet instantly + emits `PaymentReceived` event
4. Backend listener detects the event → credits the user's balance automatically
5. User sees their balance update within ~15 seconds of on-chain confirmation
