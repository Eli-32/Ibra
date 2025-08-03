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
let connectionState = 'disconnected';
let lastConnectionAttempt = 0;
const connectionCooldown = 10000; // 10 seconds cooldown between connection attempts

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
    connectionState: connectionState,
    retryCount: retryCount,
    timestamp: new Date().toISOString()
  });
});

// Add health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
      status: 'ok',
      connectionState: connectionState,
      retryCount: retryCount,
      uptime: process.uptime()
    });
});

// Start Express server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Web server running on port ${PORT}`);
  console.log(`📡 Access the QR code at your public URL + /qr`);
});

console.log('🚀 Starting Anime Character Detector Bot...');

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

// Function to check if session is valid
function isSessionValid() {
  const sessionDir = './AnimeSession';
  if (!fs.existsSync(sessionDir)) {
    return false;
  }
  
  // Check for essential session files
  const requiredFiles = ['creds.json'];
  const hasRequiredFiles = requiredFiles.every(file => 
    fs.existsSync(`${sessionDir}/${file}`)
  );
  
  if (!hasRequiredFiles) {
    return false;
  }
  
  // Check if creds.json is not empty
  try {
    const credsPath = `${sessionDir}/creds.json`;
    const credsContent = fs.readFileSync(credsPath, 'utf8');
    const creds = JSON.parse(credsContent);
    
    // Check if we have valid credentials
    return creds && creds.me && creds.signedIdentityKey;
  } catch (error) {
    console.log('⚠️ Invalid session credentials:', error.message);
    return false;
  }
}

// Function to clear invalid session
function clearInvalidSession() {
  const sessionDir = './AnimeSession';
  if (fs.existsSync(sessionDir)) {
    console.log('🧹 Clearing invalid session...');
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      console.log('✅ Session cleared successfully');
    } catch (error) {
      console.error('❌ Error clearing session:', error.message);
    }
  }
}

// Improved connection management with better error handling
async function startBot() {
    const now = Date.now();
    
    // Prevent rapid reconnection attempts
    if (now - lastConnectionAttempt < connectionCooldown) {
        console.log(`⏳ Connection attempt too soon, waiting...`);
        setTimeout(startBot, connectionCooldown - (now - lastConnectionAttempt));
        return;
    }
    
    lastConnectionAttempt = now;
    connectionState = 'connecting';
    
    try {
        // Check session validity before attempting connection
        if (!isSessionValid()) {
            console.log('⚠️ Invalid session detected, clearing and starting fresh...');
            clearInvalidSession();
        }
        
        const { state, saveCreds } = await useMultiFileAuthState('./AnimeSession');
        
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ 
                level: 'silent',
                transport: {
                    target: 'pino/file',
                    options: { destination: './logs/baileys.log' }
                }
            }),
            browser: ['Chrome', 'Linux', '10.0'],
            // Use configuration for connection settings
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 25000,
            retryRequestDelayMs: 1000,
            maxRetries: 2,
            // Disable aggressive retry behavior
            shouldIgnoreJid: jid => jid.includes('@broadcast'),
            // Better message handling
            markOnlineOnConnect: false,
            // Reduce unnecessary reconnections
            fireInitQueries: false,
            // Additional stability settings
            emitOwnEvents: false,
            defaultQueryTimeoutMs: 60000,
            // Prevent message retry loops
            retryRequestDelayMs: 2000,
            maxRetries: 1
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                connectionState = 'qr_ready';
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
                connectionState = 'disconnected';
                const reason = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = lastDisconnect?.error?.output?.payload?.message;
                
                console.log(`❌ Connection closed, reason: ${reason}`);
                console.log(`📝 Disconnect message: ${shouldReconnect}`);

                if (reason === DisconnectReason.loggedOut) {
                    console.log('🚫 Logged out. Deleting session and exiting.');
                    clearInvalidSession();
                    process.exit(1);
                } else if (reason === 401) {
                    console.log('🚫 Unauthorized (401). Session may be invalid. Clearing session and retrying...');
                    clearInvalidSession();
                    retryCount++;
                    if (retryCount <= maxRetry) {
                        setTimeout(() => {
                            console.log(`🔄 Retry attempt ${retryCount}/${maxRetry} after 401 error`);
                            startBot().catch(console.error);
                        }, 5000 * retryCount);
                    } else {
                        console.log('❌ Max retry attempts reached after 401 errors. Please check your connection.');
                        process.exit(1);
                    }
                } else if (reason === DisconnectReason.connectionClosed) {
                    console.log('🔄 Connection closed, attempting to reconnect...');
                    retryCount++;
                    if (retryCount <= maxRetry) {
                        setTimeout(() => {
                            console.log(`🔄 Retry attempt ${retryCount}/${maxRetry}`);
                            startBot().catch(console.error);
                        }, 5000 * retryCount); // Exponential backoff
                    } else {
                        console.log('❌ Max retry attempts reached. Please check your connection.');
                        process.exit(1);
                    }
                } else if (reason === DisconnectReason.connectionLost) {
                    console.log('🔄 Connection lost, attempting to reconnect...');
                    setTimeout(() => {
                        retryCount = 0; // Reset retry count for connection lost
                        startBot().catch(console.error);
                    }, 3000);
                } else {
                    console.log('🔄 Unknown disconnect reason, attempting to reconnect...');
                    setTimeout(() => {
                        startBot().catch(console.error);
                    }, 5000);
                }
            } else if (connection === 'open') {
                connectionState = 'connected';
                retryCount = 0; // Reset retry count on successful connection
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

        // Add error handling for socket events
        sock.ev.on('error', (error) => {
            console.error('❌ Socket error:', error);
        });

        // Handle message processing errors with better error handling
        sock.ev.on('messages.upsert', (messageUpdate) => {
            try {
                // Let the plugin handle messages
                if (currentAnimeBot && currentAnimeBot.messageHandler) {
                    currentAnimeBot.messageHandler(messageUpdate);
                }
            } catch (error) {
                console.error('❌ Error in message processing:', error);
            }
        });

    } catch (error) {
        console.error('❌ Error in startBot:', error);
        connectionState = 'error';
        retryCount++;
        
        if (retryCount <= maxRetry) {
            console.log(`🔄 Retry attempt ${retryCount}/${maxRetry} after error`);
            setTimeout(() => {
                startBot().catch(console.error);
            }, 5000 * retryCount);
        } else {
            console.log('❌ Max retry attempts reached after errors.');
            process.exit(1);
        }
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
    retryCount = 0; // Reset retry count
    startBot().catch(console.error);
  }, 5000);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`❌ Unhandled Rejection at ${new Date().toISOString()} - Promise:`, promise, 'Reason:', reason);
  // Don't exit, just log the error
});

// Start the bot
startBot().catch(console.error);