// SlopWatch Background Service Worker
// Handles API communication and user ID management

const API_BASE = 'https://slopwatch.offmylawn.xyz';

// Generate a random user ID
function generateUserId() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

// Get or create user ID
async function getUserId() {
  const stored = await chrome.storage.local.get('userId');
  if (stored.userId) {
    return stored.userId;
  }

  const userId = generateUserId();
  await chrome.storage.local.set({ userId });
  return userId;
}

// Make API request
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    console.error('SlopWatch API error:', err);
    throw err;
  }
}

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch(err => {
    sendResponse({ error: err.message });
  });
  return true; // Keep channel open for async response
});

async function handleMessage(message) {
  switch (message.type) {
    case 'GET_USER_ID':
      return { userId: await getUserId() };

    case 'VOTE': {
      const { tweetId, userId } = message;
      return await apiRequest('/vote', {
        method: 'POST',
        body: JSON.stringify({ tweetId, userId })
      });
    }

    case 'GET_VOTES': {
      const { tweetIds, userId } = message;
      const params = new URLSearchParams();
      params.set('ids', tweetIds.join(','));
      params.set('userId', userId);
      return await apiRequest(`/votes?${params.toString()}`);
    }

    case 'GET_STATUS': {
      const { tweetId, userId } = message;
      return await apiRequest(`/status/${tweetId}/${userId}`);
    }

    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}

// Initialize user ID on install
chrome.runtime.onInstalled.addListener(async () => {
  await getUserId();
  console.log('SlopWatch installed');
});
