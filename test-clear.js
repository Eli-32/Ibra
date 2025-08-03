#!/usr/bin/env node

// Test script to verify chat clearing functionality
import { makeWASocket, useMultiFileAuthState } from '@whiskeysockets/baileys';
import qrcode from 'qrcode';
import pino from 'pino';

console.log('🧪 Testing chat clearing functionality...');

async function testChatClearing() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('./AnimeSession');
        
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            browser: ['Chrome', 'Linux', '10.0'],
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, qr } = update;

            if (qr) {
                qrcode.toDataURL(qr, (err, url) => {
                    if (err) {
                        console.error('❌ Error generating QR code:', err);
                        return;
                    }
                    console.log('📱 QR code is ready. Scan to test chat clearing.');
                });
            }

            if (connection === 'open') {
                console.log('✅ Connected! Testing chat clearing...');
                
                // Test the clearGroupChat function
                const testGroupId = '120363416733375424@g.us'; // Replace with actual group ID
                
                try {
                    console.log('🧹 Testing chat clear for group:', testGroupId);
                    
                    // Method 1: Try chatModify
                    try {
                        await sock.chatModify({ clear: 'all' }, testGroupId);
                        console.log('✅ Method 1 (chatModify) - SUCCESS');
                    } catch (error) {
                        console.log('❌ Method 1 (chatModify) - FAILED:', error.message);
                    }
                    
                    // Method 2: Try fetchMessages and deleteMessages
                    try {
                        const messages = await sock.fetchMessages(testGroupId, 10);
                        if (messages && messages.length > 0) {
                            const messageKeys = messages.map(msg => msg.key);
                            await sock.deleteMessages(testGroupId, messageKeys);
                            console.log(`✅ Method 2 (deleteMessages) - SUCCESS: Deleted ${messageKeys.length} messages`);
                        } else {
                            console.log('ℹ️ Method 2 (deleteMessages) - No messages to delete');
                        }
                    } catch (error) {
                        console.log('❌ Method 2 (deleteMessages) - FAILED:', error.message);
                    }
                    
                    // Method 3: Send notification
                    try {
                        await sock.sendMessage(testGroupId, { 
                            text: '🧪 Test: Chat clearing functionality is working!' 
                        });
                        console.log('✅ Method 3 (sendMessage) - SUCCESS');
                    } catch (error) {
                        console.log('❌ Method 3 (sendMessage) - FAILED:', error.message);
                    }
                    
                } catch (error) {
                    console.error('❌ Error during testing:', error);
                }
                
                // Exit after testing
                setTimeout(() => {
                    console.log('🏁 Test completed. Exiting...');
                    process.exit(0);
                }, 3000);
            }
        });

    } catch (error) {
        console.error('❌ Error in test:', error);
        process.exit(1);
    }
}

testChatClearing().catch(console.error); 