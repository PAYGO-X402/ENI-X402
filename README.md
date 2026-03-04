# X402 on ENI Chain

Complete X402 implementation on ENI Chain. Switch between testnet and mainnet by updating files under `config/`.

## Architecture

```
Client (buyer)  -->  Server (seller)  -->  Facilitator  -->  ENI Chain
   :4021                  :4021               :4022          Chain 174
```

1. Client requests `/secret-data`
2. Server returns `402 Payment Required`
3. Client signs payment payload automatically (EIP-712, EIP-3009)
4. Client retries with `PAYMENT-SIGNATURE`
5. Server verifies and settles via Facilitator
6. Server returns protected data

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
# Edit .env and fill in test wallet private keys
```

### 3. Deploy contracts to ENI testnet

Get EGAS from faucet first: https://faucet-testnet.eniac.network

```bash
npm run deploy:pusc
```

After deployment, copy contract addresses into `config/tokens.ts`.

### 4. Set up test accounts

```bash
npm run setup:pusc
```

### 5. Start services

Open three terminals:

```bash
# Terminal 1: Facilitator
npm run facilitator:eip3009

# Terminal 2: Resource Server
npm run server:eip3009

# Terminal 3: Client
npm run client:eip3009
```

Default client request path is `RESOURCE_PATH=/secret-data` (EIP-3009 mode).

## Switch to Mainnet

Update only these three places:

1. `config/chains.ts` - change `activeChain` to `eniMainnet`
2. `config/tokens.ts` - set mainnet contract addresses
3. `.env` - use mainnet wallet private keys

Facilitator endpoint notes:

- Mainnet official facilitator: `https://facilitator.paygo.ac`
- Testnet: no official facilitator at the moment (use self-hosted facilitator)

No business logic changes are required.

## Project Structure

```
x402/
├── config/
│   ├── chains.ts          # Chain definitions and active chain selector
│   └── tokens.ts          # Contract address configuration
├── contracts/
│   ├── src/               # Solidity source code
│   └── deploy/            # Deployment scripts
├── facilitator/           # Self-hosted Facilitator service
├── server/                # Express resource server
├── client/                # Auto-payment client
├── scripts/               # Utility scripts
├── hardhat.config.ts      # Hardhat config
└── .env.example           # Environment template
```

## ENI Chain Parameters

| Parameter | Testnet | Mainnet |
|-----------|---------|---------|
| Chain ID | 174 | 173 |
| Network ID | eip155:174 | eip155:173 |
| RPC | https://rpc-testnet.eniac.network | https://rpc.eniac.network |
| Explorer | https://scan-testnet.eniac.network | https://scan.eniac.network |
