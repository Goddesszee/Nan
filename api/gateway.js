// api/gateway.js
// Circle Gateway — Unified USDC Balance
// Docs: https://developers.circle.com/gateway/quickstarts/unified-balance-evm
//
// IMPORTANT per Circle docs:
// - Do NOT transfer USDC directly to Gateway contract — use deposit() function
// - Balance updates require block confirmations — can take up to 20 minutes
// - Gateway API returns balances already in USDC format (not atomic units)
// - Arc Testnet domain = 26

const GATEWAY_API    = 'https://gateway-api-testnet.circle.com/v1';
const GATEWAY_WALLET = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9';
const GATEWAY_MINTER = '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B';

// All supported Gateway testnet domains per Circle docs
const DOMAINS = {
  'ETH-SEPOLIA':  0,
  'AVAX-FUJI':    1,
  'BASE-SEPOLIA': 6,
  'ARC-TESTNET':  26,
};

// USDC contract addresses per chain — needed to build the burn intent's
// TransferSpec (source/destination token fields). Same addresses already
// used elsewhere in the codebase (circle-wallets.js, x402-cctp-status.js).
const USDC_ADDR = {
  'ETH-SEPOLIA':  '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  'AVAX-FUJI':    '0x5425890298aed601595a70AB815c96711a31Bc65',
  'BASE-SEPOLIA': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  'ARC-TESTNET':  '0x3600000000000000000000000000000000000000',
};

// RPC endpoints for calling gatewayMint() on the destination chain
const RPC_BY_CHAIN = {
  'ETH-SEPOLIA':  'https://rpc.sepolia.org',
  'AVAX-FUJI':    'https://api.avax-test.network/ext/bc/C/rpc',
  'BASE-SEPOLIA': 'https://sepolia.base.org',
  'ARC-TESTNET':  'https://rpc.testnet.arc.network',
};

function isValidAddress(addr) {
  return typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/.test(addr);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).end();

  const { action, address } = req.body;

  // ── getBalance ────────────────────────────────────────────────────────────
  if (action === 'getBalance') {
    if (!address)              return res.status(400).json({ error: 'address required' });
    if (!isValidAddress(address)) return res.status(400).json({ error: 'Invalid wallet address' });

    try {
      const body = {
        token: 'USDC',
        sources: Object.entries(DOMAINS).map(([_, domain]) => ({
          domain,
          depositor: address,
        })),
      };

      const response = await fetch(`${GATEWAY_API}/balances`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Gateway API ${response.status}: ${errText}`);
      }

      const result = await response.json();
      let total = 0;
      const balances = {};

      for (const balance of (result.balances || [])) {
        // Gateway API returns balance as a decimal string already in USDC
        // e.g. "2.000000" means 2 USDC — do NOT divide by 1e6
        const amount = parseFloat(balance.balance || 0);
        const chain  = Object.keys(DOMAINS).find(k => DOMAINS[k] === balance.domain)
                    || `domain-${balance.domain}`;
        balances[chain] = amount;
        total += amount;
      }

      return res.json({
        success:       true,
        total:         total.toFixed(6),
        balances,
        gatewayWallet: GATEWAY_WALLET,
        gatewayMinter: GATEWAY_MINTER,
        note: total === 0
          ? 'Balance pending finality — deposits can take up to 20 minutes to confirm per Circle docs'
          : undefined,
      });

    } catch (err) {
      console.error('Gateway balance error:', err.message);
      return res.json({
        success:  false,
        error:    'Could not fetch Gateway balance — ' + err.message.slice(0, 100),
        total:    '0.00',
        balances: {},
      });
    }
  }

  // ── info ──────────────────────────────────────────────────────────────────
  if (action === 'info') {
    try {
      const response = await fetch(`${GATEWAY_API}/info`);
      if (!response.ok) throw new Error('Gateway info unavailable');
      const data = await response.json();
      return res.json({ success: true, data });
    } catch (err) {
      return res.json({ success: false, error: 'Could not fetch Gateway info' });
    }
  }

  // ── withdraw ──────────────────────────────────────────────────────────────
  // Pulls NAN's accumulated x402/Gateway balance out to a destination chain.
  // This is admin-only — it always signs with X402_SELLER_PRIVATE_KEY (the
  // wallet that owns the Gateway balance from x402 revenue), never a
  // user-supplied key. Flow per Circle docs: build burn intent → sign EIP-712
  // → POST /v1/transfer for attestation → call gatewayMint() on destination.
  if (action === 'withdraw') {
    const { sourceChain, destChain, amount, recipient } = req.body;

    if (!process.env.X402_SELLER_PRIVATE_KEY) {
      return res.json({ success: false, error: 'X402_SELLER_PRIVATE_KEY not configured — withdraw unavailable' });
    }
    if (!sourceChain || !destChain || !amount) {
      return res.json({ success: false, error: 'sourceChain, destChain, amount required' });
    }
    if (DOMAINS[sourceChain] === undefined) {
      return res.json({ success: false, error: 'Unsupported sourceChain: ' + sourceChain });
    }
    if (DOMAINS[destChain] === undefined) {
      return res.json({ success: false, error: 'Unsupported destChain: ' + destChain });
    }
    if (sourceChain === destChain) {
      return res.json({ success: false, error: 'sourceChain and destChain must differ' });
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.json({ success: false, error: 'Invalid amount' });
    }
    if (recipient && !isValidAddress(recipient)) {
      return res.json({ success: false, error: 'Invalid recipient address' });
    }

    try {
      const { ethers } = await import('ethers');
      const signer = new ethers.Wallet(process.env.X402_SELLER_PRIVATE_KEY);
      const sellerAddr = signer.address;
      const recipientAddr = recipient || sellerAddr;

      const addressToBytes32 = (addr) => ethers.zeroPadValue(ethers.getAddress(addr), 32);

      const value = BigInt(Math.floor(parsedAmount * 1e6)); // USDC has 6 decimals
      const salt = ethers.hexlify(ethers.randomBytes(32));

      // EIP-712 type definitions — copied exactly from Circle's reference
      // implementation. Do NOT modify field names, types, or ordering; doing
      // so produces a signature the Gateway API will reject as invalid.
      const domain = { name: 'GatewayWallet', version: '1' };
      const types = {
        TransferSpec: [
          { name: 'version',              type: 'uint32'  },
          { name: 'sourceDomain',         type: 'uint32'  },
          { name: 'destinationDomain',    type: 'uint32'  },
          { name: 'sourceContract',       type: 'bytes32' },
          { name: 'destinationContract',  type: 'bytes32' },
          { name: 'sourceToken',          type: 'bytes32' },
          { name: 'destinationToken',     type: 'bytes32' },
          { name: 'sourceDepositor',      type: 'bytes32' },
          { name: 'destinationRecipient', type: 'bytes32' },
          { name: 'sourceSigner',         type: 'bytes32' },
          { name: 'destinationCaller',    type: 'bytes32' },
          { name: 'value',                type: 'uint256' },
          { name: 'salt',                 type: 'bytes32' },
          { name: 'hookData',             type: 'bytes'   },
        ],
        BurnIntent: [
          { name: 'maxBlockHeight', type: 'uint256'     },
          { name: 'maxFee',         type: 'uint256'     },
          { name: 'spec',           type: 'TransferSpec' },
        ],
      };

      const spec = {
        version:              1,
        sourceDomain:         DOMAINS[sourceChain],
        destinationDomain:    DOMAINS[destChain],
        sourceContract:       addressToBytes32(GATEWAY_WALLET),
        destinationContract:  addressToBytes32(GATEWAY_MINTER),
        sourceToken:          addressToBytes32(USDC_ADDR[sourceChain]),
        destinationToken:     addressToBytes32(USDC_ADDR[destChain]),
        sourceDepositor:      addressToBytes32(sellerAddr),
        destinationRecipient: addressToBytes32(recipientAddr),
        sourceSigner:         addressToBytes32(sellerAddr),
        destinationCaller:    addressToBytes32(ethers.ZeroAddress),
        value,
        salt,
        hookData: '0x',
      };

      const message = {
        maxBlockHeight: ethers.MaxUint256,
        maxFee:         2010000n, // matches Circle's reference fee buffer
        spec,
      };

      // Sign EIP-712 — ethers wants nested types without EIP712Domain key
      const signature = await signer.signTypedData(domain, types, message);

      // Submit signed burn intent to Gateway API for attestation
      const transferRes = await fetch(`${GATEWAY_API}/transfer`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ burnIntent: message, signature }], (_k, v) =>
          typeof v === 'bigint' ? v.toString() : v
        ),
      });

      if (!transferRes.ok) {
        const errText = await transferRes.text().catch(() => '');
        throw new Error(`Gateway transfer API ${transferRes.status}: ${errText.slice(0, 200)}`);
      }

      const transferResult = await transferRes.json();
      if (transferResult.success === false) {
        throw new Error(transferResult.message || 'Gateway rejected the transfer request');
      }

      const { attestation, signature: attestationSig } = transferResult;
      if (!attestation || !attestationSig) {
        throw new Error('Gateway API did not return an attestation');
      }

      // Call gatewayMint() on the destination chain to complete the withdraw
      const rpcUrl = RPC_BY_CHAIN[destChain];
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const connectedSigner = signer.connect(provider);
      const minterIface = new ethers.Interface([
        'function gatewayMint(bytes attestationPayload, bytes signature)'
      ]);
      const calldata = minterIface.encodeFunctionData('gatewayMint', [attestation, attestationSig]);

      const tx = await connectedSigner.sendTransaction({
        to:   GATEWAY_MINTER,
        data: calldata,
      });
      const receipt = await tx.wait(1);

      return res.json({
        success:    receipt.status === 1,
        mintTxHash: tx.hash,
        sourceChain,
        destChain,
        amount:     parsedAmount.toFixed(6),
        recipient:  recipientAddr,
      });

    } catch (err) {
      console.error('Gateway withdraw error:', err.message);
      return res.json({
        success: false,
        error:   'Withdraw failed — ' + err.message.slice(0, 200),
      });
    }
  }

  return res.status(400).json({ error: 'Valid actions: getBalance, info, withdraw' });
}
