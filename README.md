# Anime Character Detector Bot

A WhatsApp bot that detects and responds to anime character names in Arabic text, built with Baileys.

## Features

- **Anime Character Detection**: Automatically detects anime character names in Arabic text
- **Smart Response System**: Generates realistic responses with occasional "mistakes" for authenticity
- **Group Management**: Can be activated in specific WhatsApp groups
- **Owner Controls**: Special commands for bot owners
- **Connection Stability**: Improved connection handling to prevent retry loops

## Installation

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start the Bot**:
   ```bash
   npm start
   ```

3. **Scan QR Code**: Visit `http://your-server:3000/qr` to scan the QR code with WhatsApp

## Configuration

The bot uses a centralized configuration file (`config.js`) that controls:

- **Connection Settings**: Timeouts, retry limits, and connection cooldowns
- **Message Processing**: Rate limiting, timeouts, and deduplication
- **Bot Behavior**: Owner numbers, delays, and mistake probabilities
- **Logging**: Log levels and file output

### Key Configuration Options

```javascript
// Connection stability settings
connection: {
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
    retryRequestDelayMs: 1000,
    maxRetries: 2,
    connectionCooldown: 10000, // 10 seconds between connection attempts
    maxRetryAttempts: 5
}

// Message processing to prevent retry loops
messageProcessing: {
    minMessageInterval: 1000, // Minimum 1 second between messages
    messageTimeout: 15000, // 15 seconds timeout for message processing
    maxProcessedMessages: 100, // Keep only last 100 processed messages
    queueTimeout: 10000, // 10 seconds timeout for processing queue
    maxMessageAge: 30 // Ignore messages older than 30 seconds
}
```

## Usage

### Owner Commands

- `.a` or `.ابدا` - Show available groups and activate bot
- `.x` or `.وقف` - Deactivate the bot
- `.clear` or `.مسح` - Clear the selected group chat manually
- `[number]` - Select a group by number (when bot is inactive)

### Public Commands

- `.status` or `.حالة` - Check bot status

### Character Detection

The bot automatically detects anime character names in messages wrapped with asterisks:
```
*ناروتو* *ساكورا* *ساسكي*
```

## Troubleshooting Retry Loop Issues

### Problem: "recv retry request, but message not available"

This error occurs when the client tries to re-fetch a message that the server no longer has. The improvements in this version address this by:

1. **Better Message Deduplication**: Prevents processing the same message multiple times
2. **Rate Limiting**: Ensures minimum intervals between message processing
3. **Message Age Filtering**: Ignores messages older than 30 seconds
4. **Processing Queue**: Tracks messages being processed to prevent duplicates

### Problem: "forced new session for retry recp"

This happens when message decryption fails. The improvements include:

1. **Reduced Retry Attempts**: Lower maxRetries (1-2 instead of default 3)
2. **Increased Retry Delays**: Longer delays between retry attempts
3. **Connection Stability**: Better connection state management
4. **Error Handling**: Improved error recovery without forcing new sessions

### Problem: "Closing stale open session"

This is a consequence of forced session renewals. The solution includes:

1. **Stable Connection Settings**: Optimized timeouts and keep-alive intervals
2. **Preventive Measures**: Better message handling to avoid decryption failures
3. **Graceful Recovery**: Proper cleanup and reconnection logic

## Monitoring

### Health Check Endpoint

Visit `http://your-server:3000/health` to check:
- Connection state
- Retry count
- Uptime
- Overall status

### Status Endpoint

Visit `http://your-server:3000/` to see:
- Bot status
- Connection state
- Retry count
- Timestamp

### Logs

Logs are written to `./logs/baileys.log` when logging is enabled in the configuration.

## Performance Optimizations

1. **Message Processing**:
   - Rate limiting prevents spam
   - Deduplication prevents duplicate processing
   - Timeout handling prevents hanging processes

2. **Connection Management**:
   - Cooldown periods between connection attempts
   - Exponential backoff for retries
   - Proper cleanup on disconnection

3. **Memory Management**:
   - Limited message history (100 messages)
   - Automatic cleanup of old processing queues
   - Proper event listener cleanup

## Error Recovery

The bot includes several recovery mechanisms:

1. **Automatic Reconnection**: Handles connection drops gracefully
2. **Session Recovery**: Maintains session state across reconnections
3. **Error Logging**: Comprehensive error tracking
4. **Graceful Shutdown**: Proper cleanup on exit

## Security Considerations

- Owner numbers are configurable in `config.js`
- Session files are stored in `./AnimeSession/`
- No sensitive data is logged
- Proper error handling prevents information leakage

## Support

If you continue to experience retry loop issues:

1. **Check Logs**: Review `./logs/baileys.log` for detailed error information
2. **Monitor Health**: Use the health check endpoint to track connection state
3. **Adjust Configuration**: Modify settings in `config.js` based on your environment
4. **Clear Session**: Delete `./AnimeSession/` folder to start fresh (requires re-scanning QR)

## Version History

### v1.1.0 (Current)
- Improved connection stability
- Better retry loop prevention
- Enhanced message processing
- Centralized configuration
- Comprehensive error handling

### v1.0.0
- Initial release
- Basic anime character detection
- WhatsApp integration
