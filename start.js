#!/usr/bin/env node

import fs from 'fs';
import { spawn } from 'child_process';

console.log('🚀 Bot Startup Script');
console.log('=====================');

// Ensure required directories exist
const requiredDirs = ['./logs', './AnimeSession'];

function ensureDirectories() {
    console.log('📁 Creating required directories...');
    
    for (const dir of requiredDirs) {
        if (!fs.existsSync(dir)) {
            try {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`✅ Created directory: ${dir}`);
            } catch (error) {
                console.log(`⚠️ Could not create ${dir}:`, error.message);
            }
        } else {
            console.log(`ℹ️ Directory exists: ${dir}`);
        }
    }
}

function startBot() {
    console.log('🤖 Starting anime bot...');
    
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
    // Create directories first
    ensureDirectories();
    
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
}

// Run the startup
main(); 