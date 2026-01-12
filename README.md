# SlopWatch

Community-powered AI slop detector for X.com (Twitter). Mark posts as AI-generated slop, see community vote counts, and auto-hide posts above your threshold.

## Setup

### 1. Deploy the Cloudflare Worker

```bash
cd worker
npm install

# Create KV namespaces
wrangler kv:namespace create VOTES
wrangler kv:namespace create VOTERS

# Update wrangler.toml with the namespace IDs from the output above

# Deploy
npm run deploy
```

After deployment, note your worker URL (e.g., `https://slopwatch-api.YOUR_SUBDOMAIN.workers.dev`).

### 2. Configure the Extension

Update `extension/background.js` line 4 with your worker URL:

```javascript
const API_BASE = 'https://slopwatch-api.YOUR_SUBDOMAIN.workers.dev';
```

### 3. Create Icons

Convert the SVG in `extension/icons/icon.svg` to PNG at three sizes:
- `icon16.png` (16x16)
- `icon48.png` (48x48)
- `icon128.png` (128x128)

You can use any image editor or online SVG-to-PNG converter.

### 4. Load the Extension

1. Open Chrome and go to `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `extension` folder

### 5. Test

1. Go to x.com
2. You should see "Slop" buttons on tweets
3. Click to vote, check that counts update
4. Adjust threshold in the extension popup

## Architecture

```
slopwatch/
├── extension/           # Chrome Extension (Manifest V3)
│   ├── manifest.json   # Extension config
│   ├── content.js      # Tweet detection, voting UI
│   ├── background.js   # API communication
│   ├── popup.html/js   # Settings UI
│   └── styles.css      # Injected styles
└── worker/             # Cloudflare Worker API
    ├── src/index.ts    # API endpoints
    └── wrangler.toml   # Worker config
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/vote` | POST | Toggle vote. Body: `{ tweetId, userId }` |
| `/votes` | GET | Batch fetch. Query: `?ids=1,2,3&userId=...` |
| `/status/:tweetId/:userId` | GET | Single tweet status |
| `/health` | GET | Health check |

## Privacy

- Users get an anonymous random ID on extension install
- No personal data is collected
- Vote data is stored in Cloudflare KV
