// Configuration file for WhatsApp Bot
export const config = {
    // Connection settings
    connection: {
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        retryRequestDelayMs: 1000,
        maxRetries: 2,
        connectionCooldown: 10000, // 10 seconds between connection attempts
        maxRetryAttempts: 5
    },
    
    // Message processing settings
    messageProcessing: {
        minMessageInterval: 1000, // Minimum 1 second between messages
        messageTimeout: 15000, // 15 seconds timeout for message processing
        maxProcessedMessages: 100, // Keep only last 100 processed messages
        queueTimeout: 10000, // 10 seconds timeout for processing queue
        maxMessageAge: 30 // Ignore messages older than 30 seconds
    },
    
    // Bot settings
    bot: {
        ownerNumbers: ['96176337375', '966584646464', '967771654273', '967739279014'],
        defaultDelay: 650,
        randomDelayRange: 500,
        mistakeProbability: 0.3,
        correctionProbability: 0.5
    },
    
    // Logging settings
    logging: {
        level: 'silent', // 'silent', 'error', 'warn', 'info', 'debug'
        logToFile: true,
        logFile: './logs/baileys.log'
    },
    
    // Server settings
    server: {
        port: process.env.PORT || 3000,
        host: '0.0.0.0'
    }
}; 