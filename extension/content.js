// SlopWatch Content Script
// Injects voting UI into X.com tweets

(function() {
  'use strict';

  const PROCESSED_ATTR = 'data-slopwatch-processed';
  let userId = null;
  let settings = { threshold: 0, autoHide: true };
  let voteCache = new Map(); // tweetId -> { count, voted }

  // Initialize
  async function init() {
    // Get user ID from background script
    const response = await chrome.runtime.sendMessage({ type: 'GET_USER_ID' });
    userId = response.userId;

    // Load settings
    const stored = await chrome.storage.sync.get(['threshold', 'autoHide']);
    settings.threshold = stored.threshold || 0;
    settings.autoHide = stored.autoHide !== false;

    // Listen for settings changes
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.threshold) settings.threshold = changes.threshold.newValue;
      if (changes.autoHide) settings.autoHide = changes.autoHide.newValue;
      // Re-evaluate hiding for all processed tweets
      reEvaluateAllTweets();
    });

    // Start observing for tweets
    observeTweets();

    // Process any tweets already on the page
    processAllTweets();
  }

  // Extract tweet ID from a tweet element
  function getTweetId(tweetElement) {
    // Method 1: Look for the tweet link with status ID
    const timeLink = tweetElement.querySelector('a[href*="/status/"] time')?.parentElement;
    if (timeLink) {
      const match = timeLink.href.match(/\/status\/(\d+)/);
      if (match) return match[1];
    }

    // Method 2: Look for any status link
    const statusLinks = tweetElement.querySelectorAll('a[href*="/status/"]');
    for (const link of statusLinks) {
      const match = link.href.match(/\/status\/(\d+)/);
      if (match) return match[1];
    }

    return null;
  }

  // Create the vote button element
  function createVoteButton(tweetId) {
    const container = document.createElement('div');
    container.className = 'slopwatch-container';
    container.dataset.tweetId = tweetId;

    const button = document.createElement('button');
    button.className = 'slopwatch-btn';
    button.innerHTML = `
      <svg viewBox="0 0 24 24" class="slopwatch-icon">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
      </svg>
      <span class="slopwatch-label">Slop</span>
    `;
    button.title = 'Mark as AI slop';

    const count = document.createElement('span');
    count.className = 'slopwatch-count';
    count.textContent = '';

    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleVote(tweetId, container);
    });

    container.appendChild(button);
    container.appendChild(count);

    return container;
  }

  // Disintegration animation
  function disintegrateTweet(tweetElement) {
    const wrapper = tweetElement.closest('[data-testid="cellInnerDiv"]') || tweetElement;
    const rect = wrapper.getBoundingClientRect();

    // Add disintegrating class for the blur/fade animation
    wrapper.classList.add('slopwatch-disintegrating');

    // Create particle container
    const particleContainer = document.createElement('div');
    particleContainer.className = 'slopwatch-particles';
    particleContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      overflow: visible;
    `;
    wrapper.style.position = 'relative';
    wrapper.appendChild(particleContainer);

    // Create particles
    const particleCount = 30;
    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.className = 'slopwatch-particle';

      // Random position within the element
      const startX = Math.random() * rect.width;
      const startY = Math.random() * rect.height;

      // Random direction (mostly upward and outward)
      const tx = (Math.random() - 0.5) * 200;
      const ty = -50 - Math.random() * 150;

      particle.style.cssText = `
        left: ${startX}px;
        top: ${startY}px;
        --tx: ${tx}px;
        --ty: ${ty}px;
        animation-delay: ${Math.random() * 0.3}s;
        opacity: ${0.6 + Math.random() * 0.4};
      `;

      particleContainer.appendChild(particle);
    }

    // After animation, hide the tweet and show notice
    setTimeout(() => {
      wrapper.classList.remove('slopwatch-disintegrating');
      wrapper.classList.add('slopwatch-hidden');
      particleContainer.remove();

      // Add the hidden notice
      const cached = voteCache.get(tweetElement.dataset.slopwatchTweetId);
      const count = cached ? cached.count : 1;

      if (!wrapper.querySelector('.slopwatch-hidden-notice')) {
        const notice = document.createElement('div');
        notice.className = 'slopwatch-hidden-notice';
        notice.innerHTML = `
          <span>Marked as slop (${count} vote${count !== 1 ? 's' : ''})</span>
          <button class="slopwatch-show-btn">Show anyway</button>
        `;
        notice.querySelector('.slopwatch-show-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          wrapper.classList.remove('slopwatch-hidden');
          notice.remove();
        });
        wrapper.insertBefore(notice, wrapper.firstChild);
      }
    }, 700);
  }

  // Handle vote button click
  async function handleVote(tweetId, container) {
    const button = container.querySelector('.slopwatch-btn');
    const countEl = container.querySelector('.slopwatch-count');

    // Optimistic update
    const cached = voteCache.get(tweetId) || { count: 0, voted: false };
    const newVoted = !cached.voted;
    const newCount = newVoted ? cached.count + 1 : cached.count - 1;

    updateButtonState(container, newVoted, newCount);
    voteCache.set(tweetId, { count: newCount, voted: newVoted });

    // If voting as slop, trigger disintegration
    const tweet = container.closest('article[data-testid="tweet"]');
    if (newVoted && tweet) {
      disintegrateTweet(tweet);
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'VOTE',
        tweetId,
        userId
      });

      if (response.error) {
        // Revert on error
        updateButtonState(container, cached.voted, cached.count);
        voteCache.set(tweetId, cached);
        console.error('SlopWatch: Vote failed', response.error);
      } else {
        // Update with server response
        voteCache.set(tweetId, { count: response.count, voted: response.voted });
        updateButtonState(container, response.voted, response.count);
      }
    } catch (err) {
      // Revert on error
      updateButtonState(container, cached.voted, cached.count);
      voteCache.set(tweetId, cached);
      console.error('SlopWatch: Vote failed', err);
    }
  }

  // Update button visual state
  function updateButtonState(container, voted, count) {
    const button = container.querySelector('.slopwatch-btn');
    const countEl = container.querySelector('.slopwatch-count');

    if (voted) {
      button.classList.add('voted');
      button.title = 'Remove slop vote';
    } else {
      button.classList.remove('voted');
      button.title = 'Mark as AI slop';
    }

    countEl.textContent = count > 0 ? count : '';
  }

  // Inject vote button into a tweet
  function injectVoteButton(tweetElement, tweetId) {
    // Find the action bar (reply, retweet, like, etc.)
    const actionBar = tweetElement.querySelector('[role="group"]');
    if (!actionBar) return;

    // Check if we already injected
    if (actionBar.querySelector('.slopwatch-container')) return;

    const voteButton = createVoteButton(tweetId);
    actionBar.appendChild(voteButton);
  }

  // Process a single tweet
  async function processTweet(tweetElement) {
    if (tweetElement.hasAttribute(PROCESSED_ATTR)) return;

    const tweetId = getTweetId(tweetElement);
    if (!tweetId) return;

    tweetElement.setAttribute(PROCESSED_ATTR, 'true');
    tweetElement.dataset.slopwatchTweetId = tweetId;

    injectVoteButton(tweetElement, tweetId);

    // Queue fetching vote status
    queueVoteFetch(tweetId);
  }

  // Batch fetch queue
  let fetchQueue = new Set();
  let fetchTimeout = null;

  function queueVoteFetch(tweetId) {
    fetchQueue.add(tweetId);

    if (fetchTimeout) clearTimeout(fetchTimeout);
    fetchTimeout = setTimeout(processFetchQueue, 100);
  }

  async function processFetchQueue() {
    if (fetchQueue.size === 0) return;

    const tweetIds = Array.from(fetchQueue);
    fetchQueue.clear();

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_VOTES',
        tweetIds,
        userId
      });

      if (response.votes) {
        for (const [tweetId, data] of Object.entries(response.votes)) {
          voteCache.set(tweetId, data);
          updateTweetUI(tweetId, data);
        }
      }
    } catch (err) {
      console.error('SlopWatch: Failed to fetch votes', err);
    }
  }

  // Update UI for a specific tweet
  function updateTweetUI(tweetId, data) {
    const containers = document.querySelectorAll(`.slopwatch-container[data-tweet-id="${tweetId}"]`);
    containers.forEach(container => {
      updateButtonState(container, data.voted, data.count);
    });

    // Evaluate hiding
    const tweets = document.querySelectorAll(`article[data-slopwatch-tweet-id="${tweetId}"]`);
    tweets.forEach(tweet => {
      evaluateHiding(tweet, tweetId, data.count);
    });
  }

  // Evaluate if a tweet should be hidden
  function evaluateHiding(tweetElement, tweetId, count) {
    const wrapper = tweetElement.closest('[data-testid="cellInnerDiv"]') || tweetElement;

    if (settings.autoHide && settings.threshold > 0 && count >= settings.threshold) {
      // Hide the tweet
      if (!wrapper.querySelector('.slopwatch-hidden-notice')) {
        wrapper.classList.add('slopwatch-hidden');

        const notice = document.createElement('div');
        notice.className = 'slopwatch-hidden-notice';
        notice.innerHTML = `
          <span>Hidden: ${count} slop vote${count !== 1 ? 's' : ''}</span>
          <button class="slopwatch-show-btn">Show anyway</button>
        `;
        notice.querySelector('.slopwatch-show-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          wrapper.classList.remove('slopwatch-hidden');
          notice.remove();
        });
        wrapper.insertBefore(notice, wrapper.firstChild);
      }
    } else {
      // Unhide if previously hidden
      wrapper.classList.remove('slopwatch-hidden');
      const notice = wrapper.querySelector('.slopwatch-hidden-notice');
      if (notice) notice.remove();
    }
  }

  // Re-evaluate all processed tweets (when settings change)
  function reEvaluateAllTweets() {
    const tweets = document.querySelectorAll(`article[${PROCESSED_ATTR}]`);
    tweets.forEach(tweet => {
      const tweetId = tweet.dataset.slopwatchTweetId;
      const cached = voteCache.get(tweetId);
      if (cached) {
        evaluateHiding(tweet, tweetId, cached.count);
      }
    });
  }

  // Process all tweets currently on the page
  function processAllTweets() {
    const tweets = document.querySelectorAll('article[data-testid="tweet"]');
    tweets.forEach(tweet => processTweet(tweet));
  }

  // Observe DOM for new tweets
  function observeTweets() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          // Check if the node itself is a tweet
          if (node.matches && node.matches('article[data-testid="tweet"]')) {
            processTweet(node);
          }

          // Check for tweets within the node
          const tweets = node.querySelectorAll?.('article[data-testid="tweet"]');
          if (tweets) {
            tweets.forEach(tweet => processTweet(tweet));
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Start the extension
  init();
})();
