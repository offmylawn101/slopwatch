import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const app = new Hono();

// Data file path
const DATA_FILE = './data.json';

// In-memory store with persistence
interface Store {
  counts: Record<string, number>;
  voters: Record<string, string[]>;
  rateLimits: Record<string, { count: number; resetAt: number }>;
}

let store: Store = { counts: {}, voters: {}, rateLimits: {} };

// Load data from file
function loadData() {
  if (existsSync(DATA_FILE)) {
    try {
      const data = readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      store.counts = parsed.counts || {};
      store.voters = parsed.voters || {};
    } catch (e) {
      console.error('Failed to load data:', e);
    }
  }
}

// Save data to file
function saveData() {
  try {
    writeFileSync(DATA_FILE, JSON.stringify({ counts: store.counts, voters: store.voters }, null, 2));
  } catch (e) {
    console.error('Failed to save data:', e);
  }
}

// Rate limiting
const RATE_LIMIT = 30;
const RATE_WINDOW = 60 * 1000; // 1 minute

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const limit = store.rateLimits[userId];

  if (!limit || now > limit.resetAt) {
    store.rateLimits[userId] = { count: 1, resetAt: now + RATE_WINDOW };
    return true;
  }

  if (limit.count >= RATE_LIMIT) {
    return false;
  }

  limit.count++;
  return true;
}

// CORS
app.use('*', cors());

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

// Vote toggle
app.post('/vote', async (c) => {
  const body = await c.req.json<{ tweetId?: string; userId?: string }>();
  const { tweetId, userId } = body;

  if (!tweetId || !userId) {
    return c.json({ error: 'Missing tweetId or userId' }, 400);
  }

  // Validate inputs
  if (!/^\d+$/.test(tweetId) || tweetId.length > 25) {
    return c.json({ error: 'Invalid tweetId' }, 400);
  }
  if (!/^[a-f0-9]{32}$/.test(userId)) {
    return c.json({ error: 'Invalid userId' }, 400);
  }

  // Check rate limit
  if (!checkRateLimit(userId)) {
    return c.json({ error: 'Rate limit exceeded' }, 429);
  }

  // Get current state
  const voters = store.voters[tweetId] || [];
  const voterIndex = voters.indexOf(userId);
  const hasVoted = voterIndex !== -1;

  let newCount: number;

  if (hasVoted) {
    // Remove vote
    voters.splice(voterIndex, 1);
    newCount = Math.max(0, (store.counts[tweetId] || 0) - 1);
  } else {
    // Add vote
    voters.push(userId);
    newCount = (store.counts[tweetId] || 0) + 1;
  }

  // Update store
  store.counts[tweetId] = newCount;
  store.voters[tweetId] = voters;
  saveData();

  return c.json({ count: newCount, voted: !hasVoted });
});

// Batch fetch votes
app.get('/votes', (c) => {
  const idsParam = c.req.query('ids');
  const userId = c.req.query('userId');

  if (!idsParam) {
    return c.json({ error: 'Missing ids parameter' }, 400);
  }

  const tweetIds = idsParam.split(',').slice(0, 100);
  const results: Record<string, { count: number; voted: boolean }> = {};

  for (const tweetId of tweetIds) {
    if (!/^\d+$/.test(tweetId) || tweetId.length > 25) continue;

    const count = store.counts[tweetId] || 0;
    const voters = store.voters[tweetId] || [];
    const voted = userId ? voters.includes(userId) : false;

    results[tweetId] = { count, voted };
  }

  return c.json({ votes: results });
});

// Single tweet status
app.get('/status/:tweetId/:userId', (c) => {
  const { tweetId, userId } = c.req.param();

  if (!/^\d+$/.test(tweetId) || tweetId.length > 25) {
    return c.json({ error: 'Invalid tweetId' }, 400);
  }

  const count = store.counts[tweetId] || 0;
  const voters = store.voters[tweetId] || [];
  const voted = voters.includes(userId);

  return c.json({ count, voted });
});

// Load data on startup
loadData();

// Start server
const port = 5023;
console.log(`SlopWatch API running on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
