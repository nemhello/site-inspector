# 📸 Site Inspector

Professional field site documentation app with photo annotations, work order tracking, and hybrid cloud storage.

## Features

✅ **Photo Documentation** - Capture unlimited photos from camera or upload  
✅ **Hybrid Storage** - Primary: Immich (your server), Backup: Cloudinary  
✅ **Work Order Tracking** - Link inspections to work orders  
✅ **Auto-Sync** - Photos automatically sync to Immich when available  
✅ **Offline Support** - Works without internet, syncs when online  
✅ **Professional UI** - iOS 18 glassmorphism design  
✅ **PWA** - Install as app on phone  

## Storage System

### How It Works:

1. **Take Photo** → App tries to upload to Immich (your home server)
2. **Immich Available?** ✅ Photo stored on Immich → Done!
3. **Immich Offline?** → Photo uploads to Cloudinary (backup)
4. **Later:** Auto-syncs from Cloudinary back to Immich

### Storage Locations:

- **Primary:** Immich at `https://immich.wilkerson-labs.com`
- **Backup:** Cloudinary (free tier, 25GB)
- **Fallback:** Local storage (until online)

## Installation

### 1. Create GitHub Repository

```bash
# Create new repo called "site-inspector"
# Set to Public
# Enable GitHub Pages (Settings → Pages → main branch)
```

### 2. Upload Files

Upload these files to your repo:
- `index.html`
- `app.js`
- `styles.css`
- `manifest.json`
- `service-worker.js`
- `icon-192.png`
- `icon-512.png`
- `README.md`

### 3. GitHub Pages Setup

1. Go to repo **Settings**
2. Click **Pages** (left sidebar)
3. **Source:** Deploy from a branch
4. **Branch:** main
5. **Folder:** / (root)
6. **Save**

### 4. Access Your App

After 2-3 minutes:
```
https://nemhello.github.io/site-inspector/
```

### 5. Install as PWA on Phone

#### iPhone:
1. Open Safari
2. Go to your app URL
3. Tap **Share** button
4. Tap **"Add to Home Screen"**
5. Tap **"Add"**

#### Android:
1. Open Chrome
2. Go to your app URL
3. Tap **menu** (3 dots)
4. Tap **"Install app"** or **"Add to Home Screen"**

## Configuration

Your credentials are already configured in `app.js`:

```javascript
const CONFIG = {
    immich: {
        url: 'https://immich.wilkerson-labs.com',
        apiKey: 'h8t6TNFpxrIgsQj5r8DWbSDgWEPkVFDJ7gCBbOC7KyA'
    },
    cloudinary: {
        cloudName: 'dybes2vsp',
        apiKey: '883195784837585',
        apiSecret: 'fTPVqcw-WJUbJFHtNLLuhjzHMUY'
    }
};
```

⚠️ **Security Note:** These credentials are in the code. For production use, consider:
- Using GitHub Secrets
- Implementing a backend proxy
- Or keeping the repo private

## Usage

### Creating an Inspection

1. Open app
2. Tap **"+ New Inspection"**
3. Enter:
   - Location name (required)
   - Work Order # (optional)
   - Notes (optional)
4. Tap **"Create & Add Photos"**

### Adding Photos

1. Tap **"📷 Take Photo"** - opens camera
2. Or **"📁 Upload Photo"** - choose from gallery
3. Photos auto-upload to Immich/Cloudinary
4. Add captions by tapping photo

### Managing Inspections

- **Search:** Type in search box at top
- **View:** Tap any inspection card
- **Delete:** Open inspection → "🗑️ Delete Inspection"
- **Export:** Settings → "💾 Export All Data"

### Syncing

Photos automatically sync to Immich when your server is reachable.

**Manual Sync:**
1. Tap **"⚙️ Settings"**
2. Tap **"🔄 Sync Now"**
3. Wait for sync to complete

## Storage Badges

Photos show badges indicating where they're stored:

- 🏠 = Stored on Immich (your server)
- ☁️ = Stored on Cloudinary (backup)
- 📱 = Stored locally (offline)
- ⏳ = Needs sync to Immich

## Data Management

### Export Data

Settings → "💾 Export All Data"
- Creates JSON backup file
- Includes all inspections & photo metadata
- Photo URLs preserved

### Import Data

Settings → "📂 Import Data"
- Select exported JSON file
- Merges with existing data

## Roadmap

**Phase 1 (Complete):** ✅
- Photo capture & upload
- Hybrid storage system
- Work order tracking
- Basic organization

**Phase 2 (Next):**
- Photo annotations (draw, text, arrows)
- Color tools
- Undo/redo

**Phase 3 (Future):**
- PDF report generation
- Email reports
- Professional formatting

**Phase 4 (Polish):**
- Gallery view improvements
- Advanced search
- Statistics

## Technical Details

### Stack

- **Frontend:** Vanilla JavaScript (no frameworks)
- **Storage:** Immich API + Cloudinary API
- **Offline:** Service Worker + localStorage
- **UI:** CSS Glassmorphism (iOS 18 style)

### Browser Support

- ✅ Safari iOS 14+
- ✅ Chrome 76+
- ✅ Edge 79+
- ✅ Firefox 80+

### Storage Limits

- **Immich:** Unlimited (your hardware)
- **Cloudinary:** 25GB free tier
- **localStorage:** ~10MB (metadata only)

### Photo Compression

Photos are compressed automatically:
- Original: 2-5MB
- Compressed: 200-500KB
- Quality: 85% (visually lossless)

## Troubleshooting

### Photos not uploading?

1. Check Immich is online:
   - Settings → Should show "Connected"
2. Check internet connection
3. Try manual sync after connection restored

### App not installing on phone?

1. Make sure using correct browser:
   - iPhone: Safari (not Chrome)
   - Android: Chrome
2. Clear browser cache
3. Try accessing via HTTPS

### Cloudinary errors?

The app uses Cloudinary's default upload preset. If you get errors:
1. Login to Cloudinary dashboard
2. Settings → Upload
3. Enable unsigned uploads
4. Or create custom preset named "site-inspector"

## Security

**API Keys in Code:**
- Keys are visible in source code
- Fine for personal use
- For team use, consider private repo

**Photo Privacy:**
- Immich photos: Private on your server
- Cloudinary photos: Private by default
- No public access without URLs

## Support

Having issues?
1. Check browser console for errors (F12)
2. Verify Immich is accessible
3. Test Cloudinary connection
4. Check GitHub Pages is enabled

## Credits

Built for professional field technicians who need reliable photo documentation with offline support.

**Version:** 1.0  
**Created:** December 2024  
**License:** Personal Use  

---

**Need help?** Check the code comments in `app.js` for detailed implementation notes.
