#!/usr/bin/env node

import fs from 'fs';
import { spawn } from 'child_process';

console.log('🔧 401 Error Fix Tool');
console.log('======================');

const sessionDir = './AnimeSession';

function clearSession() {
    if (fs.existsSync(sessionDir)) {
        console.log('🧹 Clearing invalid session...');
        try {
            fs.rmSync(sessionDir, { recursive: true, force: true });
            console.log('✅ Session cleared successfully');
            return true;
        } catch (error) {
            console.error('❌ Error clearing session:', error.message);
            return false;
        }
    } else {
        console.log('ℹ️ No session directory found');
        return true;
    }
}

function startBot() {
    console.log('🚀 Starting bot with fresh session...');
    
    const botProcess = spawn('node', ['anime-bot.js'], {
        stdio: 'inherit',
        cwd: process.cwd()
    });
    
    botProcess.on('error', (error) => {
        console.error('❌ Failed to start bot:', error.message);
    });
    
    botProcess.on('exit', (code) => {
        if (code !== 0) {
            console.log(`⚠️ Bot exited with code ${code}`);
        }
    });
    
    return botProcess;
}

function main() {
    console.log('🔍 Detecting 401 error pattern...');
    
    // Clear the session first
    if (clearSession()) {
        console.log('✅ Session cleared, starting fresh bot...');
        
        // Start the bot
        const botProcess = startBot();
        
        // Handle process termination
        process.on('SIGINT', () => {
            console.log('\n🛑 Stopping bot...');
            botProcess.kill('SIGINT');
            process.exit(0);
        });
        
        process.on('SIGTERM', () => {
            console.log('\n🛑 Stopping bot...');
            botProcess.kill('SIGTERM');
            process.exit(0);
        });
        
    } else {
        console.error('❌ Failed to clear session');
        process.exit(1);
    }
}

// Run the fix
main(); 