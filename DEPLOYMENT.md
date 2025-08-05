# Deployment Guide for Anime Detector Bot

## Issues Fixed

The main issue you were experiencing was **decryption failures** on Render, specifically:
- `"No SenderKeyRecord found for decryption"`
- Session state corruption on cloud platforms
- Message queue problems during deployment

## Solutions Implemented

### 1. Enhanced Session Management
- **Session Backup**: Automatic backup every 5 minutes
- **Session Recovery**: Better error handling for decryption issues
- **Cloud-Optimized Cleanup**: Reduced cleanup intervals for cloud deployment

### 2. Cloud-Optimized Configuration
- **Reduced Timeouts**: Faster connection times for cloud environments
- **Better Error Handling**: Graceful recovery from decryption errors
- **Session Persistence**: Enhanced session saving and loading

### 3. Render-Specific Optimizations
- **Health Check Endpoint**: `/health` for monitoring
- **Uptime Monitoring**: `/` endpoint for status
- **Persistent Storage**: Session files stored in persistent disk

## Deployment Steps

### 1. Update Your Render Service
1. Go to your Render dashboard
2. Update your service with the new code
3. Make sure to set environment variables:
   - `NODE_ENV=production`
   - `PORT=3000`

### 2. Configure Persistent Storage (Important!)
1. In your Render service settings, add a **Disk**:
   - Name: `session-storage`
   - Mount Path: `/opt/render/project/src/AnimeSession`
   - Size: 1GB

### 3. Health Check Configuration
- Set health check path to: `/health`
- This will help Render monitor your bot's status

## What Changed

### Before (Causing Issues)
```javascript
// Very conservative settings that caused problems on cloud
connectTimeoutMs: 180000, // 3 minutes
keepAliveIntervalMs: 90000, // 1.5 minutes
maxRetries: 0, // No retries
```

### After (Cloud-Optimized)
```javascript
// Cloud-optimized settings
connectTimeoutMs: 60000, // 1 minute
keepAliveIntervalMs: 30000, // 30 seconds
maxRetries: 1, // Allow 1 retry for stability
```

## Monitoring Your Bot

### Health Check
- Visit: `https://your-app-name.onrender.com/health`
- Should return: `{"status":"healthy","timestamp":"..."}`

### Status Check
- Visit: `https://your-app-name.onrender.com/`
- Shows bot status, retry count, and connection info

## Troubleshooting

### If Decryption Errors Persist
1. **Clear Session**: Delete the `AnimeSession` folder and restart
2. **Check Logs**: Monitor the Render logs for specific error patterns
3. **Restart Service**: Sometimes a fresh restart helps

### If Bot Won't Connect
1. **Check QR Code**: Make sure you scan the QR code when it appears
2. **Wait for Connection**: Cloud deployments take longer to establish connection
3. **Check Environment**: Ensure all environment variables are set correctly

## Expected Behavior

After deployment, you should see:
- ✅ Connection established successfully
- 💾 Regular session backups
- ❤️ Heartbeat logs every minute
- 📊 Status updates every 5 minutes

The bot should now handle decryption errors gracefully and maintain stable connections on Render. 