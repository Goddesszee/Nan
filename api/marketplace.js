// api/marketplace.js — NAN Marketplace: listings, offers, and true escrow orders
// Escrow custody: a dedicated Circle Developer-Controlled Wallet, auto-provisioned on
// first use (find-or-create, same pattern as api/circle-wallets.js's getWallet). Circle's
// MPC network holds the actual key material — no private key ever touches this server.
import crypto from 'crypto';

const BLOCKCHAIN = 'ARC-TESTNET';
const ARC_USDC   = process.env.USDC_ADDRESS || '0x3600000000000000000000000000000000000000';
const ESCROW_WALLETSET_NAME = 'nan-marketplace-escrow';

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

// ── Redis helpers — identical implementation to api/agent-wallets.js ────────
async function kvGet(key) {
  const { default: fetch } = await import('node-fetch');
  const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` }
  });
  const d = await r.json();
  return d?.result ? JSON.parse(d.result) : null;
}
async function kvSet(key, value) {
  const { default: fetch } = await import('node-fetch');
  await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify(value))
  });
}
async function kvKeys(prefix) {
  const { default: fetch } = await import('node-fetch');
  const r = await fetch(`${KV_URL}/keys/${encodeURIComponent(prefix + '*')}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` }
  });
  const d = await r.json();
  return d?.result || [];
}

function deterministicUUID(scope, key) {
  const hex = crypto.createHash('sha256').update(`nan:${scope}:${key}`).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}
function newId(prefix) { return prefix + '_' + crypto.randomBytes(8).toString('hex'); }

async function getCircleClient() {
  const { initiateDeveloperControlledWalletsClient } = await import('@circle-fin/developer-controlled-wallets');
  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey || !entitySecret) throw new Error('CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET must be set');
  return initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
}

async function findWalletSetByName(client, name) {
  let pageAfter;
  do {
    const res = await client.listWalletSets({ pageSize: 50, pageAfter });
    const found = (res.data?.walletSets || []).find(ws => ws.name === name);
    if (found) return found;
    pageAfter = res.data?.pageCursor;
  } while (pageAfter);
  return null;
}

// Find-or-create the single platform-owned escrow wallet. Idempotency keys are
// deterministic, so calling this concurrently or repeatedly never creates duplicates.
let _escrowWalletCache = null;
async function getOrCreateEscrowWallet() {
  if (_escrowWalletCache) return _escrowWalletCache;

  const cached = await kvGet('nan:mkt:escrowWallet').catch(() => null);
  if (cached?.id && cached?.address) { _escrowWalletCache = cached; return cached; }

  const client = await getCircleClient();
  let walletSet = await findWalletSetByName(client, ESCROW_WALLETSET_NAME);
  if (!walletSet) {
    const wsRes = await client.createWalletSet({
      name: ESCROW_WALLETSET_NAME,
      idempotencyKey: deterministicUUID('escrow-walletset', ESCROW_WALLETSET_NAME),
    });
    walletSet = wsRes.data?.walletSet;
    if (!walletSet?.id) throw new Error('Circle did not return a walletSet ID for escrow wallet');
  }

  const listRes = await client.listWallets({ walletSetId: walletSet.id, pageSize: 20 });
  let wallet = listRes.data?.wallets?.find(w => w.blockchain === BLOCKCHAIN);
  if (!wallet) {
    const wRes = await client.createWallets({
      walletSetId: walletSet.id,
      blockchains: [BLOCKCHAIN],
      count: 1,
      accountType: 'EOA',
      idempotencyKey: deterministicUUID('escrow-wallet', ESCROW_WALLETSET_NAME),
    });
    wallet = wRes.data?.wallets?.[0];
    if (!wallet?.id || !wallet?.address) throw new Error('Circle did not return an escrow wallet');
  }

  const result = { id: wallet.id, address: wallet.address };
  await kvSet('nan:mkt:escrowWallet', result);
  _escrowWalletCache = result;
  return result;
}

async function transferUSDC(client, { fromWalletAddress, toAddress, amount, idempotencyKey }) {
  const txRes = await client.createTransaction({
    blockchain: BLOCKCHAIN,
    walletAddress: fromWalletAddress,
    destinationAddress: toAddress,
    amount: [String(amount)],
    tokenAddress: ARC_USDC,
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    idempotencyKey,
  });
  const txId = txRes.data?.id;
  if (!txId) throw new Error('No transaction ID in Circle response: ' + JSON.stringify(txRes.data));
  return txId;
}

async function listByPrefix(prefix) {
  const keys = await kvKeys(prefix);
  const items = [];
  for (const k of keys) {
    const v = await kvGet(k);
    if (v) items.push(v);
  }
  return items;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action } = req.body || {};

  try {
    // ── listing-create ──────────────────────────────────────────────────────
    if (action === 'listing-create') {
      const { sellerAddress, sellerEmail, title, description, price, category, location, images, highValue } = req.body;
      if (!sellerAddress || !title || !price) return res.json({ success: false, error: 'sellerAddress, title, and price are required' });
      const parsedPrice = parseFloat(price);
      if (isNaN(parsedPrice) || parsedPrice <= 0) return res.json({ success: false, error: 'Invalid price' });

      if (highValue) {
        const kyc = await kvGet(`nan:kyc:${sellerAddress.toLowerCase()}`);
        if (!kyc || kyc.status !== 'approved')
          return res.json({ success: false, error: 'Verified Listings require identity verification first. Submit a verification request and wait for approval before posting.' });
      }

      let safeImages = [];
      if (Array.isArray(images)) {
        if (images.length > 4) return res.json({ success: false, error: 'Max 4 images per listing' });
        for (const img of images) {
          if (typeof img !== 'string' || !img.startsWith('data:image/')) return res.json({ success: false, error: 'Invalid image data' });
          if (img.length > 350_000) return res.json({ success: false, error: 'An image is too large — please use a smaller photo' });
        }
        safeImages = images;
      }

      const listing = {
        id: newId('lst'), sellerAddress, sellerEmail: sellerEmail || null,
        title: String(title).slice(0, 140), description: String(description || '').slice(0, 2000),
        price: parsedPrice, category: category || 'general', location: location || null,
        images: safeImages, status: 'active', createdAt: Date.now(),
        highValue: !!highValue,
      };
      await kvSet(`nan:mkt:listing:${listing.id}`, listing);
      return res.json({ success: true, listing });
    }

    // ── listing-list ─────────────────────────────────────────────────────────
    if (action === 'listing-list') {
      const { query, category, highValue } = req.body;
      let listings = (await listByPrefix('nan:mkt:listing:')).filter(l => l.status === 'active');
      if (highValue !== undefined) listings = listings.filter(l => !!l.highValue === !!highValue);
      if (category) listings = listings.filter(l => l.category === category);
      if (query) {
        const q = String(query).toLowerCase();
        listings = listings.filter(l => l.title.toLowerCase().includes(q) || l.description.toLowerCase().includes(q));
      }
      listings.sort((a, b) => b.createdAt - a.createdAt);
      return res.json({ success: true, listings });
    }

    // ── offer-create ─────────────────────────────────────────────────────────
    if (action === 'offer-create') {
      const { listingId, buyerAddress, buyerWalletId, offerPrice } = req.body;
      if (!listingId || !buyerAddress || !buyerWalletId) return res.json({ success: false, error: 'listingId, buyerAddress, buyerWalletId required' });
      const listing = await kvGet(`nan:mkt:listing:${listingId}`);
      if (!listing) return res.json({ success: false, error: 'Listing not found' });
      if (listing.status !== 'active') return res.json({ success: false, error: 'Listing is not active' });

      const offer = {
        id: newId('off'), listingId, buyerAddress, buyerWalletId,
        price: offerPrice ? parseFloat(offerPrice) : listing.price,
        status: 'pending', createdAt: Date.now(),
      };
      await kvSet(`nan:mkt:offer:${offer.id}`, offer);
      return res.json({ success: true, offer });
    }

    // ── offer-respond (seller accepts/rejects) ──────────────────────────────
    if (action === 'offer-respond') {
      const { offerId, response, sellerWalletId } = req.body; // response: 'accept' | 'reject'
      const offer = await kvGet(`nan:mkt:offer:${offerId}`);
      if (!offer) return res.json({ success: false, error: 'Offer not found' });
      if (offer.status !== 'pending') return res.json({ success: false, error: `Offer is already ${offer.status}` });

      if (response === 'reject') {
        offer.status = 'rejected';
        await kvSet(`nan:mkt:offer:${offer.id}`, offer);
        return res.json({ success: true, offer });
      }

      const listing = await kvGet(`nan:mkt:listing:${offer.listingId}`);
      if (!listing) return res.json({ success: false, error: 'Listing not found' });

      offer.status = 'accepted';
      await kvSet(`nan:mkt:offer:${offer.id}`, offer);

      const order = {
        id: newId('ord'), listingId: offer.listingId, offerId: offer.id,
        buyerAddress: offer.buyerAddress, buyerWalletId: offer.buyerWalletId,
        sellerAddress: listing.sellerAddress, sellerWalletId: sellerWalletId || null,
        amount: offer.price, status: 'awaiting_payment',
        escrowTxId: null, releaseTxId: null,
        createdAt: Date.now(), updatedAt: Date.now(),
      };
      await kvSet(`nan:mkt:order:${order.id}`, order);
      return res.json({ success: true, offer, order });
    }

    // ── order-pay (buyer → escrow wallet, real onchain transfer) ────────────
    if (action === 'order-pay') {
      const { orderId, buyerWalletAddress } = req.body;
      const order = await kvGet(`nan:mkt:order:${orderId}`);
      if (!order) return res.json({ success: false, error: 'Order not found' });
      if (order.status !== 'awaiting_payment') return res.json({ success: false, error: `Order is ${order.status}, not awaiting payment` });
      if (!buyerWalletAddress) return res.json({ success: false, error: 'buyerWalletAddress required' });

      const escrowWallet = await getOrCreateEscrowWallet();
      const client = await getCircleClient();
      const txId = await transferUSDC(client, {
        fromWalletAddress: buyerWalletAddress,
        toAddress: escrowWallet.address,
        amount: order.amount,
        idempotencyKey: deterministicUUID('order-pay', order.id),
      });

      order.status = 'escrowed';
      order.escrowTxId = txId;
      order.updatedAt = Date.now();
      await kvSet(`nan:mkt:order:${order.id}`, order);
      return res.json({ success: true, order, escrowWalletAddress: escrowWallet.address });
    }

    // ── order-mark-shipped (seller) ──────────────────────────────────────────
    if (action === 'order-mark-shipped') {
      const { orderId } = req.body;
      const order = await kvGet(`nan:mkt:order:${orderId}`);
      if (!order) return res.json({ success: false, error: 'Order not found' });
      if (order.status !== 'escrowed') return res.json({ success: false, error: `Order is ${order.status}, cannot mark shipped` });
      order.status = 'shipped';
      order.updatedAt = Date.now();
      await kvSet(`nan:mkt:order:${order.id}`, order);
      return res.json({ success: true, order });
    }

    // ── order-confirm-received (buyer → releases escrow → seller) ──────────
    if (action === 'order-confirm-received') {
      const { orderId, sellerWalletAddress } = req.body;
      const order = await kvGet(`nan:mkt:order:${orderId}`);
      if (!order) return res.json({ success: false, error: 'Order not found' });
      if (order.status !== 'shipped') return res.json({ success: false, error: `Order is ${order.status}, cannot confirm receipt yet` });
      if (!sellerWalletAddress) return res.json({ success: false, error: 'sellerWalletAddress required' });

      const escrowWallet = await getOrCreateEscrowWallet();
      const client = await getCircleClient();
      const txId = await transferUSDC(client, {
        fromWalletAddress: escrowWallet.address,
        toAddress: sellerWalletAddress,
        amount: order.amount,
        idempotencyKey: deterministicUUID('order-release', order.id),
      });

      order.status = 'released';
      order.releaseTxId = txId;
      order.updatedAt = Date.now();
      await kvSet(`nan:mkt:order:${order.id}`, order);

      const listing = await kvGet(`nan:mkt:listing:${order.listingId}`);
      if (listing) { listing.status = 'sold'; await kvSet(`nan:mkt:listing:${listing.id}`, listing); }

      return res.json({ success: true, order });
    }

    // ── order-dispute (either party flags a problem — halts everything) ────
    if (action === 'order-dispute') {
      const { orderId, reason, raisedBy } = req.body;
      const order = await kvGet(`nan:mkt:order:${orderId}`);
      if (!order) return res.json({ success: false, error: 'Order not found' });
      if (order.status === 'released' || order.status === 'refunded') return res.json({ success: false, error: `Order already ${order.status}, cannot dispute` });
      order.status = 'disputed';
      order.dispute = { reason: String(reason || '').slice(0, 1000), raisedBy: raisedBy || null, at: Date.now() };
      order.updatedAt = Date.now();
      await kvSet(`nan:mkt:order:${order.id}`, order);
      return res.json({ success: true, order });
    }

    // ── admin-list-disputes ──────────────────────────────────────────────────
    if (action === 'admin-list-disputes') {
      const { secret } = req.body;
      if (secret !== process.env.ADMIN_PASSWORD) return res.json({ success: false, error: 'Unauthorized' });
      const disputed = (await listByPrefix('nan:mkt:order:')).filter(o => o.status === 'disputed');
      return res.json({ success: true, orders: disputed });
    }

    // ── admin-resolve (release to seller OR refund to buyer) ────────────────
    if (action === 'admin-resolve') {
      const { secret, orderId, resolution, buyerWalletAddress, sellerWalletAddress } = req.body; // resolution: 'release' | 'refund'
      if (secret !== process.env.ADMIN_PASSWORD) return res.json({ success: false, error: 'Unauthorized' });
      const order = await kvGet(`nan:mkt:order:${orderId}`);
      if (!order) return res.json({ success: false, error: 'Order not found' });
      if (order.status !== 'disputed') return res.json({ success: false, error: `Order is ${order.status}, not disputed` });

      const escrowWallet = await getOrCreateEscrowWallet();
      const client = await getCircleClient();

      if (resolution === 'release') {
        if (!sellerWalletAddress) return res.json({ success: false, error: 'sellerWalletAddress required' });
        const txId = await transferUSDC(client, { fromWalletAddress: escrowWallet.address, toAddress: sellerWalletAddress, amount: order.amount, idempotencyKey: deterministicUUID('order-admin-release', order.id) });
        order.status = 'released'; order.releaseTxId = txId;
      } else if (resolution === 'refund') {
        if (!buyerWalletAddress) return res.json({ success: false, error: 'buyerWalletAddress required' });
        const txId = await transferUSDC(client, { fromWalletAddress: escrowWallet.address, toAddress: buyerWalletAddress, amount: order.amount, idempotencyKey: deterministicUUID('order-admin-refund', order.id) });
        order.status = 'refunded'; order.refundTxId = txId;
      } else {
        return res.json({ success: false, error: 'resolution must be "release" or "refund"' });
      }
      order.updatedAt = Date.now();
      await kvSet(`nan:mkt:order:${order.id}`, order);
      return res.json({ success: true, order });
    }

    // ── listing-get ──────────────────────────────────────────────────────────
    if (action === 'listing-get') {
      const { listingId } = req.body;
      const listing = await kvGet(`nan:mkt:listing:${listingId}`);
      if (!listing) return res.json({ success: false, error: 'Listing not found' });
      return res.json({ success: true, listing });
    }

    // ── my-orders (as buyer or seller) ──────────────────────────────────────
    if (action === 'my-orders') {
      const { walletAddress } = req.body;
      if (!walletAddress) return res.json({ success: false, error: 'walletAddress required' });
      const addr = walletAddress.toLowerCase();
      const orders = (await listByPrefix('nan:mkt:order:')).filter(
        o => o.buyerAddress?.toLowerCase() === addr || o.sellerAddress?.toLowerCase() === addr
      );
      orders.sort((a, b) => b.updatedAt - a.updatedAt);
      return res.json({ success: true, orders });
    }

    // ── my-listings-offers (pending offers on my listings) ──────────────────
    if (action === 'my-listings-offers') {
      const { sellerAddress } = req.body;
      if (!sellerAddress) return res.json({ success: false, error: 'sellerAddress required' });
      const myListings = (await listByPrefix('nan:mkt:listing:')).filter(l => l.sellerAddress?.toLowerCase() === sellerAddress.toLowerCase());
      const myListingIds = new Set(myListings.map(l => l.id));
      const offers = (await listByPrefix('nan:mkt:offer:')).filter(o => myListingIds.has(o.listingId) && o.status === 'pending');
      return res.json({ success: true, offers, listings: myListings });
    }

    // ── review-create (buyer reviews a completed order, photos optional) ───
    if (action === 'review-create') {
      const { orderId, reviewerAddress, rating, comment, images } = req.body;
      const order = await kvGet(`nan:mkt:order:${orderId}`);
      if (!order) return res.json({ success: false, error: 'Order not found' });
      if (order.status !== 'released') return res.json({ success: false, error: 'You can only review a completed (released) order' });
      if (!reviewerAddress || reviewerAddress.toLowerCase() !== order.buyerAddress?.toLowerCase())
        return res.json({ success: false, error: 'Only the buyer on this order can leave a review' });
      const existing = await kvGet(`nan:mkt:review-by-order:${orderId}`);
      if (existing) return res.json({ success: false, error: 'This order has already been reviewed' });

      const parsedRating = parseInt(rating, 10);
      if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) return res.json({ success: false, error: 'Rating must be 1-5' });

      let safeImages = [];
      if (Array.isArray(images)) {
        if (images.length > 3) return res.json({ success: false, error: 'Max 3 images per review' });
        for (const img of images) {
          if (typeof img !== 'string' || !img.startsWith('data:image/')) return res.json({ success: false, error: 'Invalid image data' });
          if (img.length > 350_000) return res.json({ success: false, error: 'An image is too large — please use a smaller photo' });
        }
        safeImages = images;
      }

      const review = {
        id: newId('rev'), orderId, listingId: order.listingId,
        sellerAddress: order.sellerAddress, reviewerAddress,
        rating: parsedRating, comment: String(comment || '').slice(0, 1000),
        images: safeImages, createdAt: Date.now(),
      };
      await kvSet(`nan:mkt:review:${review.id}`, review);
      await kvSet(`nan:mkt:review-by-order:${orderId}`, review.id);
      return res.json({ success: true, review });
    }

    // ── review-list (for a listing, or a seller overall) ───────────────────
    if (action === 'review-list') {
      const { listingId, sellerAddress } = req.body;
      let reviews = await listByPrefix('nan:mkt:review:');
      if (listingId) reviews = reviews.filter(r => r.listingId === listingId);
      else if (sellerAddress) reviews = reviews.filter(r => r.sellerAddress?.toLowerCase() === sellerAddress.toLowerCase());
      reviews.sort((a, b) => b.createdAt - a.createdAt);
      const avgRating = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) : null;
      return res.json({ success: true, reviews, avgRating, count: reviews.length });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('[marketplace]', e.message);
    return res.status(500).json({ success: false, error: e.message.slice(0, 300) });
  }
}
