import { makeWASocket, DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import qrcode from 'qrcode';
import pino from 'pino';
import express from 'express';
import fs from 'fs';

// Global variable to store the current bot instance
let currentAnimeBot = null;
let qrCodeDataUrl = null;

// Create Express server
const app = express();
const PORT = process.env.PORT || 3000;

// Add QR code endpoint
app.get('/qr', (req, res) => {
  if (qrCodeDataUrl) {
    res.send(`
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #f0f0f0;">
        <h1 style="font-family: sans-serif;">Scan QR Code</h1>
        <img src="${qrCodeDataUrl}" alt="QR Code" style="width: 300px; height: 300px;"/>
        <p style="font-family: sans-serif; margin-top: 20px;">Scan this with your WhatsApp to connect the bot.</p>
      </div>
    `);
  } else {
    res.send(`
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #f0f0f0;">
        <h1 style="font-family: sans-serif;">Waiting for QR Code...</h1>
        <p style="font-family: sans-serif;">Please wait a moment, the QR code is being generated. Refresh this page in a few seconds.</p>
      </div>
    `);
  }
});

// Add uptime endpoint
app.get('/', (req, res) => {
  const status = currentAnimeBot ? currentAnimeBot.getStatus() : { status: 'initializing' };
  res.json({
    status: 'online',
    botStatus: status,
    timestamp: new Date().toISOString()
  });
});

// Start Express server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Web server running on port ${PORT}`);
  console.log(`📡 Access the QR code at your public URL + /qr`);
});

console.log('🚀 Starting Anime Character Detector Bot...');

// Clean session function

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

async function startBot() {
  // --- Force a clean session on every start ---
  const sessionDir = './AnimeSession';
  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true, force: true });
    console.log('🗑️ Previous session cleared successfully.');
  }
  // --- End of clean session logic ---

  // Use multi-file auth state
  const { state, saveCreds } = await useMultiFileAuthState('./AnimeSession');
  
  // Create WhatsApp socket with better configuration
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'debug' }),
    browser: ['Anime Detector Bot', 'Chrome', '1.0.0'],
    defaultQueryTimeoutMs: 120000,
    connectTimeoutMs: 120000,
    keepAliveIntervalMs: 20000,
    markOnlineOnConnect: true,
    syncFullHistory: false,
  });

  // Handle QR code
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      qrcode.toDataURL(qr, (err, url) => {
        if (err) {
          console.error('❌ Error generating QR code:', err);
          return;
        }
        qrCodeDataUrl = url;
        console.log(`📱 QR code is ready. Open your public URL and add "/qr" to the end to scan the code.`);
      });
    }
    
    if (connection === 'close') {
      qrCodeDataUrl = null; // Clear QR code on close
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log('❌ Connection closed due to:', statusCode || 'Unknown');

      if (statusCode === DisconnectReason.loggedOut) {
        console.log('🚫 Logged out. Please delete the session and scan the QR code again.');
        process.exit(1); // Exit so the container can restart
      } else {
        console.log('🔄 Reconnecting...');
        startBot().catch(console.error);
      }
    } else if (connection === 'open') {
      qrCodeDataUrl = null; // Clear QR code on successful connection
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