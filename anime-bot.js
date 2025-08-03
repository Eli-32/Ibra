import { makeWASocket, DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import qrcode from 'qrcode';
import pino from 'pino';
import express from 'express';
import fs from 'fs';

// Global variable to store the current bot instance
let currentAnimeBot = null;
let qrCodeDataUrl = null;
let retryCount = 0;
const maxRetry = 5;

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

// Add health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
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
    const { state, saveCreds } = await useMultiFileAuthState('./AnimeSession');
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Chrome', 'Linux', '10.0'],
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrcode.toDataURL(qr, (err, url) => {
                if (err) {
                    console.error('❌ Error generating QR code:', err);
                    return;
                }
                qrCodeDataUrl = url;
                console.log(`📱 QR code is ready. Scan at: ${PORT}/qr`);
            });
        }

        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            console.log(`❌ Connection closed, reason: ${reason}`);

            if (reason === DisconnectReason.loggedOut) {
                console.log('🚫 Logged out. Deleting session and exiting.');
                const sessionDir = './AnimeSession';
                if (fs.existsSync(sessionDir)) {
                    fs.rmSync(sessionDir, { recursive: true, force: true });
                }
                process.exit(1);
            } else {
                console.log('🔄 Reconnecting...');
                setTimeout(startBot, 5000);
            }
        } else if (connection === 'open') {
            console.log('✅ Connection opened!');
            qrCodeDataUrl = null;
            if (!currentAnimeBot) {
                loadAnimeBot().then(pluginModule => {
                    if (pluginModule) {
                        const { WhatsAppAnimeBot } = pluginModule;
                        currentAnimeBot = new WhatsAppAnimeBot(sock);
                        console.log('✅ Plugin initialized!');
                    } else {
                        console.error('❌ Failed to load plugin.');
                    }
                }).catch(err => console.error('❌ Error initializing plugin:', err));
            }
        }
    });
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