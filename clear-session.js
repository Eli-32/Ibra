#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

console.log('🧹 Session Clearing Tool');
console.log('========================');

const sessionDir = './AnimeSession';

function clearSession() {
    if (fs.existsSync(sessionDir)) {
        console.log('📁 Found session directory:', sessionDir);
        
        try {
            // List files before deletion
            const files = fs.readdirSync(sessionDir);
            console.log('📄 Files to be deleted:');
            files.forEach(file => {
                console.log(`   - ${file}`);
            });
            
            // Delete the session directory
            fs.rmSync(sessionDir, { recursive: true, force: true });
            console.log('✅ Session cleared successfully!');
            console.log('🔄 You can now restart the bot and scan a new QR code.');
            
        } catch (error) {
            console.error('❌ Error clearing session:', error.message);
        }
    } else {
        console.log('ℹ️ No session directory found.');
        console.log('✅ Session is already clear.');
    }
}

// Check if user wants to proceed
console.log('\n⚠️ This will delete all session files and require re-scanning the QR code.');
console.log('Are you sure you want to continue? (y/N)');

// For automated environments, proceed immediately
if (process.argv.includes('--force')) {
    console.log('🔄 Force flag detected, proceeding with session clear...');
    clearSession();
    process.exit(0);
}

// For interactive use, wait for input
process.stdin.once('data', (data) => {
    const input = data.toString().trim().toLowerCase();
    
    if (input === 'y' || input === 'yes') {
        clearSession();
    } else {
        console.log('❌ Session clear cancelled.');
    }
    
    process.exit(0);
});

// Set a timeout in case no input is provided
setTimeout(() => {
    console.log('\n⏰ No input received, cancelling session clear.');
    process.exit(0);
}, 10000); 