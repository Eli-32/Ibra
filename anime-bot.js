import { makeWASocket, DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { watch } from 'fs';
import { pathToFileURL } from 'url';
import express from 'express';

// Global variable to store the current bot instance
let currentAnimeBot = null;
let retryCount = 0;
const maxRetries = 2; // Reduced from 3
let lastRetryTime = 0;
const minRetryInterval = 5000; // 5 seconds minimum between retries

// Create Express server
const app = express();
const PORT = process.env.PORT || 3000;

// Add uptime endpoint
app.get('/', (req, res) => {
  const status = currentAnimeBot ? currentAnimeBot.getStatus() : { status: 'initializing' };
  res.json({
    status: 'online',
    botStatus: status,
    retryCount: retryCount,
    timestamp: new Date().toISOString()
  });
});

// Start Express server
app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
  console.log(`📡 Uptime URL: http://localhost:${PORT}/`);
});

console.log('🚀 Starting Anime Character Detector Bot...');

// Clean session function
async function cleanupSession() {
  try {
    const fs = await import('fs');
    const sessionDir = './AnimeSession';
    if (fs.existsSync(sessionDir)) {
      const files = fs.readdirSync(sessionDir);
      files.forEach(file => {
        if (file.endsWith('.json')) {
          const filePath = `${sessionDir}/${file}`;
          const stats = fs.statSync(filePath);
          // Remove files older than 24 hours
          if (Date.now() - stats.mtimeMs > 24 * 60 * 60 * 1000) {
            fs.unlinkSync(filePath);
            console.log(`🗑️ Cleaned up old session file: ${file}`);
          }
        }
      });
    }
  } catch (error) {
    console.log('⚠️ Error cleaning session files:', error.message);
  }
}

// Function to load the anime bot plugin
async function loadAnimeBot() {
  try {
    // Use timestamp to bypass module cache
    const timestamp = Date.now();
    const { AnimeCharacterBot, WhatsAppAnimeBot } = await import(`./plugins/anime-detector.js?v=${timestamp}`);
    return { AnimeCharacterBot, WhatsAppAnimeBot };
  } catch (error) {
    console.error('❌ Error loading anime bot plugin:', error.message);
    return null;
  }
}

// Debounce mechanism for hot-reload
let reloadTimeout = null;

// Function to setup hot-reload for plugins
function setupHotReload(sock) {
  console.log('🔥 Hot-reload enabled for plugins');
  
  watch('./plugins', { recursive: true }, async (eventType, filename) => {
    if (filename && filename.endsWith('.js')) {
      // Clear existing timeout to debounce multiple file changes
      if (reloadTimeout) {
        clearTimeout(reloadTimeout);
      }
      
      // Set a new timeout to reload after 500ms of no changes
      reloadTimeout = setTimeout(async () => {
        console.log(`🔄 Plugin file changed: ${filename}`);
        console.log('♻️  Reloading anime bot...');
        
        try {
          // Load the updated plugin
          const pluginModule = await loadAnimeBot();
          if (pluginModule && currentAnimeBot) {
            // Get current state
            const currentState = currentAnimeBot.getStatus();
            
            // Remove old event listeners to prevent memory leaks
            currentAnimeBot.cleanup();
            
            // Create new bot instance with updated code
            const { WhatsAppAnimeBot } = pluginModule;
            const newAnimeBot = new WhatsAppAnimeBot(sock);
            
            // Restore previous state
            if (currentState.active) {
              newAnimeBot.isActive = true;
            }
            
            // Replace the current bot
            currentAnimeBot = newAnimeBot;
            
            console.log('✅ Anime bot reloaded successfully!');
          }
        } catch (error) {
          console.error('❌ Failed to reload anime bot:', error.message);
        }
        
        reloadTimeout = null;
      }, 500); // 500ms debounce
    }
  });
}

async function startBot() {
  // Check if we should retry based on time and count
  const now = Date.now();
  if (retryCount > 0) {
    if (now - lastRetryTime < minRetryInterval) {
      const remainingTime = Math.ceil((minRetryInterval - (now - lastRetryTime)) / 1000 / 60);
      console.log(`⏳ Too soon to retry. Waiting ${remainingTime} more minutes...`);
      setTimeout(startBot, minRetryInterval - (now - lastRetryTime));
      return;
    }
    
    if (retryCount >= maxRetries) {
      console.log('❌ Max retries reached. Please check your connection and try again later.');
      console.log('💡 Try clearing session with: rm -rf ./AnimeSession && npm start');
      console.log('💡 Or wait several hours before trying again.');
      process.exit(1);
    }
  }
  
  lastRetryTime = now;
  retryCount++;
  
  // Clean up old session files
  await cleanupSession();
  
  try {
    // Use multi-file auth state
    const { state, saveCreds } = await useMultiFileAuthState('./AnimeSession');
    
    // Create WhatsApp socket with VERY conservative configuration
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'error' }),
      browser: ['Anime Detector Bot', 'Chrome', '1.0.0'],
      defaultQueryTimeoutMs: 120000, // Increased to 2 minutes
      connectTimeoutMs: 120000, // Increased to 2 minutes
      keepAliveIntervalMs: 60000, // Increased to 1 minute
      markOnlineOnConnect: false, // Keep offline to avoid suspicion
      retryRequestDelayMs: 5000, // Increased delay between retries
      maxRetries: 0, // NO automatic retries
      // Very conservative settings
      shouldIgnoreJid: jid => jid.includes('@broadcast'),
      fireInitQueries: false,
      emitOwnEvents: false,
      // Additional conservative settings
      connectTimeoutMs: 180000, // 3 minutes
      keepAliveIntervalMs: 90000, // 1.5 minutes
      markOnlineOnConnect: false,
      // Disable aggressive features
      retryRequestDelayMs: 10000, // 10 seconds between retries
      maxRetries: 0, // No automatic retries
      // Connection stability
      shouldIgnoreJid: jid => jid.includes('@broadcast'),
      fireInitQueries: false,
      emitOwnEvents: false
    });

    // Handle QR code
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        console.log('📱 Scan this QR code with your WhatsApp:');
        qrcode.generate(qr, { small: true });
      }
      
      if (connection === 'close') {
        const reason = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = reason !== DisconnectReason.loggedOut;
        
        console.log(`❌ Connection closed due to: ${reason}`);
        
        if (reason === 403 || reason === 503) {
          console.log('🚫 Rate limited or blocked by WhatsApp. Waiting much longer before retry...');
          const waitTime = Math.min(900000 * retryCount, 3600000); // 15-60 minutes
          const waitMinutes = Math.ceil(waitTime / 1000 / 60);
          console.log(`⏳ Waiting ${waitMinutes} minutes before retry...`);
          console.log('💡 This is to avoid triggering another ban.');
          setTimeout(startBot, waitTime);
        } else if (reason === 515 || reason === 408) {
          // Fast reconnect for connection timeouts (not rate limits)
          const waitTime = 3000; // 3 seconds for connection errors
          console.log(`🔄 Connection timeout, reconnecting in 3 seconds...`);
          setTimeout(startBot, waitTime);
        } else if (shouldReconnect) {
          const waitTime = 10000; // 10 seconds for other errors
          console.log(`🔄 Reconnecting in 10 seconds...`);
          setTimeout(startBot, waitTime);
        } else {
          console.log('🚫 Logged out. Please restart and scan QR code again.');
          process.exit(1);
        }
      } else if (connection === 'open') {
        retryCount = 0; // Reset retry count on successful connection
        console.log('✅ Connected to WhatsApp successfully!');
        console.log(`👤 Logged in as: ${sock.user?.name || 'Unknown'}`);
        console.log(`📱 Phone: ${sock.user?.id?.split(':')[0] || 'Unknown'}`);
        
        // Load and initialize the anime bot
        const pluginModule = await loadAnimeBot();
        if (pluginModule) {
          const { WhatsAppAnimeBot } = pluginModule;
          currentAnimeBot = new WhatsAppAnimeBot(sock);
          
          console.log('🤖 Anime Character Detector initialized!');
          console.log('📝 Commands:');
          console.log('   .a - Activate anime detection');
          console.log('   .x - Deactivate anime detection');
          console.log('💡 Usage: Send text between *asterisks* to detect characters');
          console.log('   Example: *غوكو ضد فيجيتا*');
          
          // Setup hot-reload
          setupHotReload(sock);
          
          // Log learning stats periodically
          setInterval(() => {
            if (currentAnimeBot) {
              const status = currentAnimeBot.getStatus();
              console.log(`📊 Status: ${status.status} | Characters learned: ${status.charactersLearned}`);
            }
          }, 300000); // Every 5 minutes

          // Add a heartbeat log to confirm the bot is running
          setInterval(() => {
            console.log(`❤️ Bot heartbeat at ${new Date().toISOString()}`);
          }, 60000); // Every 1 minute
        } else {
          console.error('❌ Failed to load anime bot plugin');
        }
      }
    });

    // Save credentials when updated
    sock.ev.on('creds.update', saveCreds);
    
  } catch (error) {
    console.error('❌ Error in startBot:', error);
    const waitTime = Math.min(600000 * retryCount, 3600000); // 10-60 minutes
    const waitMinutes = Math.ceil(waitTime / 1000 / 60);
    console.log(`🔄 Retrying in ${waitMinutes} minutes...`);
    setTimeout(startBot, waitTime);
  }
}

// Anti-shutdown protection and graceful handling
let isShuttingDown = false;

process.on('SIGINT', () => {
  if (!isShuttingDown) {
    isShuttingDown = true;
    console.log(`\n⚠️ Received SIGINT at ${new Date().toISOString()}, shutting down gracefully...`);
    if (currentAnimeBot) {
      currentAnimeBot.cleanup();
    }
    setTimeout(() => process.exit(0), 1000);
  }
});

process.on('SIGTERM', () => {
  if (!isShuttingDown) {
    isShuttingDown = true;
    console.log(`\n⚠️ Received SIGTERM at ${new Date().toISOString()}, shutting down gracefully...`);
    if (currentAnimeBot) {
      currentAnimeBot.cleanup();
    }
    setTimeout(() => process.exit(0), 1000);
  }
});

process.on('uncaughtException', (err) => {
  console.error(`❌ Uncaught Exception at ${new Date().toISOString()}:`, err);
  // Don't exit immediately, try to recover
  if (currentAnimeBot) {
    currentAnimeBot.cleanup();
  }
  setTimeout(() => {
    console.log('🔄 Attempting to restart bot after uncaught exception...');
    startBot().catch(console.error);
  }, 5000);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`❌ Unhandled Rejection at ${new Date().toISOString()} - Promise:`, promise, 'Reason:', reason);
  // Don't exit, just log the error
});

// Start the bot
startBot().catch(console.error);