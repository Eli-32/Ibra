#!/usr/bin/env node

import fetch from 'node-fetch';

const BOT_URL = process.env.BOT_URL || 'http://localhost:3000';

async function checkBotHealth() {
    try {
        console.log('🔍 Checking bot health...');
        
        // Check health endpoint
        const healthResponse = await fetch(`${BOT_URL}/health`);
        const healthData = await healthResponse.json();
        
        console.log('📊 Health Status:');
        console.log(`   Status: ${healthData.status}`);
        console.log(`   Connection State: ${healthData.connectionState}`);
        console.log(`   Retry Count: ${healthData.retryCount}`);
        console.log(`   Uptime: ${Math.floor(healthData.uptime / 60)} minutes`);
        
        // Check main status endpoint
        const statusResponse = await fetch(BOT_URL);
        const statusData = await statusResponse.json();
        
        console.log('\n🤖 Bot Status:');
        console.log(`   Overall Status: ${statusData.status}`);
        console.log(`   Bot Status: ${statusData.botStatus?.status || 'Unknown'}`);
        console.log(`   Timestamp: ${statusData.timestamp}`);
        
        // Analyze connection state
        if (healthData.connectionState === 'connected') {
            console.log('\n✅ Bot is connected and healthy!');
        } else if (healthData.connectionState === 'connecting') {
            console.log('\n⏳ Bot is connecting...');
        } else if (healthData.connectionState === 'qr_ready') {
            console.log('\n📱 QR code is ready for scanning!');
        } else if (healthData.connectionState === 'disconnected') {
            console.log('\n❌ Bot is disconnected!');
        } else {
            console.log(`\n⚠️ Bot is in ${healthData.connectionState} state`);
        }
        
        // Check for retry issues
        if (healthData.retryCount > 0) {
            console.log(`\n⚠️ Warning: ${healthData.retryCount} retry attempts detected`);
            if (healthData.retryCount > 3) {
                console.log('🚨 High retry count detected - check logs for issues');
            }
        }
        
    } catch (error) {
        console.error('❌ Error checking bot health:', error.message);
        console.log('\n💡 Make sure the bot is running and accessible at:', BOT_URL);
    }
}

// Run health check
checkBotHealth();

// If run with --watch flag, check every 30 seconds
if (process.argv.includes('--watch')) {
    console.log('\n👀 Starting continuous monitoring (Ctrl+C to stop)...');
    setInterval(checkBotHealth, 30000);
} 