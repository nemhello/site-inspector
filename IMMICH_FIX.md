# 🔧 IMMICH CONNECTIVITY FIX

## Problem Found

**Two Issues:**
1. ❌ Immich container not running
2. ❌ App using old API endpoints

## Fix #1: Restart Immich Container

### In Unraid:
1. Go to **Docker** tab
2. Find **"immich"** container
3. Click **"Start"** (if stopped)
4. Wait 30 seconds
5. Click **"Logs"** to verify it's running

### Or via SSH:
```bash
docker ps | grep immich
# If not listed, start it:
docker start immich

# Check it's running:
docker logs immich --tail 20
```

**You should see:**
```
Server started, listening on port 8080
```

## Fix #2: Update App with New API Endpoints

**I just fixed the app!** Updated file above (app.js)

**Changes made:**
- `/api/server-info/ping` → `/api/server/ping` ✅
- `/api/asset/upload` → `/api/assets` ✅
- `/api/asset/thumbnail` → `/api/assets/{id}/thumbnail` ✅
- `/api/asset/file` → `/api/assets/{id}/original` ✅

## Deploy the Fix

### 1. Replace app.js in GitHub:
```
1. Go to site-inspector repo
2. Click "app.js"
3. Edit (pencil icon)
4. Delete all content
5. Paste NEW app.js (from above)
6. Commit: "Fix Immich API endpoints"
```

### 2. Wait 2-3 minutes for deployment

### 3. Clear app cache:
**iPhone:**
- Delete Site Inspector app
- Visit site again
- Add to Home Screen

**Android:**
- Clear Chrome data
- Or reinstall app

## Test After Fix

### 1. Check Immich is running:
```bash
docker ps | grep immich
```

**Should show:**
```
immich   Up XX minutes   0.0.0.0:8080->8080/tcp
```

### 2. Test API in browser:
```
https://immich.wilkerson-labs.com/api/server/ping
```

**Should return:**
```json
{"res":"pong"}
```

### 3. Test in Site Inspector:
1. Open app
2. Tap "⚙️ Settings"
3. Should show: 🟢 **Immich: Connected**

## If Still Not Working

### Check Immich port:
```bash
docker inspect immich | grep -A 5 "Ports"
```

**Should show port 8080**

### If different port (e.g., 2283):
Update Cloudflare tunnel config:
```bash
cd /mnt/user-data/appdata/cloudflared
nano docker-compose.yml
```

Change:
```yaml
service: http://localhost:2283  # or whatever port
```

Then:
```bash
docker-compose restart
```

## Success Checklist

✅ Immich container running  
✅ Port 8080 accessible  
✅ API returns {"res":"pong"}  
✅ App shows "Connected"  
✅ Photos upload successfully  

## What Happens Until Fixed

**Good news:** Your photos still work!

- ❌ Immich: Offline
- ✅ Cloudinary: Working

**Photos will:**
1. Upload to Cloudinary (backup)
2. Sync to Immich when you fix it
3. No data lost!

**This is exactly why we built the hybrid system!** 🎉

## After Both Fixes

Your app will show:
- 🟢 Immich: Connected
- 🟢 Cloudinary: Available

Photos will upload to Immich first, with Cloudinary as backup!

---

**Questions? Let me know!**
