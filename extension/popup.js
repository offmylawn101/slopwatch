// SlopWatch Popup Script

document.addEventListener('DOMContentLoaded', async () => {
  const autoHideCheckbox = document.getElementById('autoHide');
  const thresholdSlider = document.getElementById('threshold');
  const thresholdValue = document.getElementById('thresholdValue');
  const voteCountEl = document.getElementById('voteCount');

  // Load current settings
  const settings = await chrome.storage.sync.get(['threshold', 'autoHide', 'voteCount']);

  autoHideCheckbox.checked = settings.autoHide !== false;
  thresholdSlider.value = settings.threshold || 5;
  thresholdValue.textContent = `${thresholdSlider.value} vote${thresholdSlider.value !== '1' ? 's' : ''}`;
  voteCountEl.textContent = settings.voteCount || 0;

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
});
