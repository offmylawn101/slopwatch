import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const app = new Hono();

// Data file path
const DATA_FILE = './data.json';

// Accuracy threshold - posts with this many votes count as "confirmed slop"
const ACCURACY_THRESHOLD = 3;

// User stats interface
interface UserStats {
  totalVotes: number;
  accurateVotes: number; // votes on posts that reached threshold
  currentStreak: number;
  longestStreak: number;
  lastVoteDate: string; // YYYY-MM-DD
}

// In-memory store with persistence
interface Store {
  counts: Record<string, number>;
  voters: Record<string, string[]>;
  userStats: Record<string, UserStats>;
  globalStats: {
    totalVotes: number;
    totalPosts: number;
    confirmedSlop: number; // posts that reached threshold
  };
  rateLimits: Record<string, { count: number; resetAt: number }>;
}

let store: Store = {
  counts: {},
  voters: {},
  userStats: {},
  globalStats: { totalVotes: 0, totalPosts: 0, confirmedSlop: 0 },
  rateLimits: {}
};

// Load data from file
function loadData() {
  if (existsSync(DATA_FILE)) {
    try {
      const data = readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      store.counts = parsed.counts || {};
      store.voters = parsed.voters || {};
      store.userStats = parsed.userStats || {};
      store.globalStats = parsed.globalStats || { totalVotes: 0, totalPosts: 0, confirmedSlop: 0 };

      // Migrate: Calculate stats from existing data if not present
      if (Object.keys(store.userStats).length === 0 && Object.keys(store.voters).length > 0) {
        console.log('Migrating existing data to new stats format...');

        // Calculate global stats
        store.globalStats.totalPosts = Object.keys(store.counts).length;
        store.globalStats.totalVotes = Object.values(store.counts).reduce((a, b) => a + b, 0);
        store.globalStats.confirmedSlop = Object.values(store.counts).filter(c => c >= ACCURACY_THRESHOLD).length;

        // Calculate user stats from voters
        for (const [tweetId, voters] of Object.entries(store.voters)) {
          const count = store.counts[tweetId] || 0;
          const isConfirmed = count >= ACCURACY_THRESHOLD;

          for (const voterId of voters) {
            if (!store.userStats[voterId]) {
              store.userStats[voterId] = {
                totalVotes: 0,
                accurateVotes: 0,
                currentStreak: 1,
                longestStreak: 1,
                lastVoteDate: getToday()
              };
            }
            store.userStats[voterId].totalVotes++;
            if (isConfirmed) {
              store.userStats[voterId].accurateVotes++;
            }
          }
        }

        saveData();
        console.log('Migration complete.');
      }
    } catch (e) {
      console.error('Failed to load data:', e);
    }
  }
}

// Save data to file
function saveData() {
  try {
    writeFileSync(DATA_FILE, JSON.stringify({
      counts: store.counts,
      voters: store.voters,
      userStats: store.userStats,
      globalStats: store.globalStats
    }, null, 2));
  } catch (e) {
    console.error('Failed to save data:', e);
  }
}

// Get today's date as YYYY-MM-DD
function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

// Update user streak
function updateStreak(userId: string): void {
  const stats = store.userStats[userId];
  if (!stats) return;

  const today = getToday();
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  if (stats.lastVoteDate === today) {
    // Already voted today, no change
    return;
  } else if (stats.lastVoteDate === yesterday) {
    // Consecutive day, increment streak
    stats.currentStreak++;
  } else {
    // Streak broken, reset to 1
    stats.currentStreak = 1;
  }

  stats.lastVoteDate = today;
  if (stats.currentStreak > stats.longestStreak) {
    stats.longestStreak = stats.currentStreak;
  }
}

// Check and update accuracy for all voters when a post reaches threshold
function checkAccuracyThreshold(tweetId: string): void {
  const count = store.counts[tweetId] || 0;
  const voters = store.voters[tweetId] || [];

  // If this post just reached the threshold, credit all voters
  if (count === ACCURACY_THRESHOLD) {
    store.globalStats.confirmedSlop++;
    for (const voterId of voters) {
      if (store.userStats[voterId]) {
        store.userStats[voterId].accurateVotes++;
      }
    }
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

// Privacy Policy
app.get('/privacy-policy', (c) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy - SlopWatch</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #15202b;
      color: #e7e9ea;
      line-height: 1.6;
      padding: 40px 20px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    h1 {
      color: #ef4444;
      margin-bottom: 8px;
    }
    .updated {
      color: #8b98a5;
      font-size: 14px;
      margin-bottom: 32px;
    }
    h2 {
      color: #e7e9ea;
      margin-top: 32px;
      margin-bottom: 16px;
      font-size: 20px;
    }
    p, li {
      color: #8b98a5;
      margin-bottom: 16px;
    }
    ul {
      padding-left: 24px;
    }
    li {
      margin-bottom: 8px;
    }
    a {
      color: #ef4444;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>SlopWatch Privacy Policy</h1>
    <p class="updated">Last updated: January 12, 2026</p>

    <h2>Overview</h2>
    <p>SlopWatch is a browser extension that allows users to collectively identify AI-generated content ("slop") on X.com (Twitter). We are committed to protecting your privacy and being transparent about our data practices.</p>

    <h2>Data We Collect</h2>
    <ul>
      <li><strong>Anonymous User ID:</strong> When you install the extension, a random 32-character identifier is generated and stored locally in your browser. This ID is not linked to your identity, email, or any personal information.</li>
      <li><strong>Vote Data:</strong> When you vote on a post, we store the post's ID (a public Twitter/X identifier) and your anonymous user ID to prevent duplicate voting.</li>
    </ul>

    <h2>Data We Do NOT Collect</h2>
    <ul>
      <li>Your name, email, or any personal information</li>
      <li>Your Twitter/X username or account information</li>
      <li>Your browsing history</li>
      <li>The content of posts you view</li>
      <li>Any data from sites other than X.com/Twitter.com</li>
    </ul>

    <h2>How We Use Your Data</h2>
    <p>Vote data is used solely to:</p>
    <ul>
      <li>Display aggregate vote counts to all users</li>
      <li>Prevent the same user from voting multiple times on the same post</li>
      <li>Enable the auto-hide feature based on vote thresholds</li>
    </ul>

    <h2>Data Storage</h2>
    <p>Vote data is stored on our servers. Your anonymous user ID is stored locally in your browser using Chrome's storage API.</p>

    <h2>Data Sharing</h2>
    <p>We do not sell, trade, or share your data with third parties. Aggregate vote counts are visible to all extension users.</p>

    <h2>Data Retention</h2>
    <p>Vote data is retained indefinitely to maintain accurate community vote counts. You can reset your anonymous user ID by reinstalling the extension.</p>

    <h2>Your Rights</h2>
    <p>Since we only collect anonymous data, there is no personal data to access, modify, or delete. Uninstalling the extension removes your local user ID.</p>

    <h2>Changes to This Policy</h2>
    <p>We may update this privacy policy from time to time. Changes will be reflected on this page with an updated date.</p>

    <h2>Contact</h2>
    <p>For questions about this privacy policy, please open an issue on our <a href="https://github.com/offmylawn101/slopwatch">GitHub repository</a>.</p>
  </div>
</body>
</html>`;
  return c.html(html);
});

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
  const isNewPost = !store.counts[tweetId];

  // Initialize user stats if needed
  if (!store.userStats[userId]) {
    store.userStats[userId] = {
      totalVotes: 0,
      accurateVotes: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastVoteDate: ''
    };
  }

  let newCount: number;

  if (hasVoted) {
    // Remove vote
    voters.splice(voterIndex, 1);
    newCount = Math.max(0, (store.counts[tweetId] || 0) - 1);
    store.userStats[userId].totalVotes--;
    store.globalStats.totalVotes--;
  } else {
    // Add vote
    voters.push(userId);
    newCount = (store.counts[tweetId] || 0) + 1;
    store.userStats[userId].totalVotes++;
    store.globalStats.totalVotes++;

    // Update streak
    updateStreak(userId);

    // Track new posts
    if (isNewPost) {
      store.globalStats.totalPosts++;
    }
  }

  // Update store
  store.counts[tweetId] = newCount;
  store.voters[tweetId] = voters;

  // Check if this vote pushed the post over the accuracy threshold
  checkAccuracyThreshold(tweetId);

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

// Get user stats
app.get('/stats/user/:userId', (c) => {
  const { userId } = c.req.param();

  const stats = store.userStats[userId] || {
    totalVotes: 0,
    accurateVotes: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastVoteDate: ''
  };

  // Calculate accuracy percentage
  const accuracy = stats.totalVotes > 0
    ? Math.round((stats.accurateVotes / stats.totalVotes) * 100)
    : 0;

  // Check if streak is still active (voted today or yesterday)
  const today = getToday();
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const streakActive = stats.lastVoteDate === today || stats.lastVoteDate === yesterday;

  return c.json({
    totalVotes: stats.totalVotes,
    accurateVotes: stats.accurateVotes,
    accuracy,
    currentStreak: streakActive ? stats.currentStreak : 0,
    longestStreak: stats.longestStreak,
    lastVoteDate: stats.lastVoteDate
  });
});

// Get global stats
app.get('/stats/global', (c) => {
  return c.json({
    totalVotes: store.globalStats.totalVotes,
    totalPosts: store.globalStats.totalPosts,
    confirmedSlop: store.globalStats.confirmedSlop,
    totalUsers: Object.keys(store.userStats).length
  });
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
