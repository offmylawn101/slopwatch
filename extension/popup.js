// SlopWatch Popup Script

document.addEventListener('DOMContentLoaded', async () => {
  const autoHideCheckbox = document.getElementById('autoHide');
  const thresholdSlider = document.getElementById('threshold');
  const thresholdValue = document.getElementById('thresholdValue');

  // User stats elements
  const userVotesEl = document.getElementById('userVotes');
  const userStreakEl = document.getElementById('userStreak');
  const userAccuracyEl = document.getElementById('userAccuracy');
  const accuracyFillEl = document.getElementById('accuracyFill');

  // Global stats elements
  const globalPostsEl = document.getElementById('globalPosts');
  const globalConfirmedEl = document.getElementById('globalConfirmed');
  const globalVotesEl = document.getElementById('globalVotes');
  const globalUsersEl = document.getElementById('globalUsers');

  // Load current settings
  const settings = await chrome.storage.sync.get(['threshold', 'autoHide']);
  autoHideCheckbox.checked = settings.autoHide !== false;
  thresholdSlider.value = settings.threshold || 5;
  thresholdValue.textContent = `${thresholdSlider.value} vote${thresholdSlider.value !== '1' ? 's' : ''}`;

  // Handle auto-hide toggle
  autoHideCheckbox.addEventListener('change', async () => {
    await chrome.storage.sync.set({ autoHide: autoHideCheckbox.checked });
  });

  // Handle threshold slider
  thresholdSlider.addEventListener('input', () => {
    thresholdValue.textContent = `${thresholdSlider.value} vote${thresholdSlider.value !== '1' ? 's' : ''}`;
  });

  thresholdSlider.addEventListener('change', async () => {
    await chrome.storage.sync.set({ threshold: parseInt(thresholdSlider.value, 10) });
  });

  // Fetch and display stats
  try {
    // Get user ID
    const { userId } = await chrome.runtime.sendMessage({ type: 'GET_USER_ID' });

    // Fetch user and global stats in parallel
    const [userStats, globalStats] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'GET_USER_STATS', userId }),
      chrome.runtime.sendMessage({ type: 'GET_GLOBAL_STATS' })
    ]);

    // Update user stats
    if (userStats && !userStats.error) {
      userVotesEl.textContent = userStats.totalVotes || 0;
      userStreakEl.textContent = userStats.currentStreak || 0;
      userAccuracyEl.textContent = `${userStats.accuracy || 0}%`;
      accuracyFillEl.style.width = `${userStats.accuracy || 0}%`;
    }

    // Update global stats
    if (globalStats && !globalStats.error) {
      globalPostsEl.textContent = formatNumber(globalStats.totalPosts || 0);
      globalConfirmedEl.textContent = formatNumber(globalStats.confirmedSlop || 0);
      globalVotesEl.textContent = formatNumber(globalStats.totalVotes || 0);
      globalUsersEl.textContent = formatNumber(globalStats.totalUsers || 0);
    }
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
});

// Format large numbers with commas
function formatNumber(num) {
  return num.toLocaleString();
}
