#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

console.log('🔍 Environment Check');
console.log('===================');

function checkEnvironment() {
    const checks = [
        {
            name: 'Node.js Version',
            check: () => {
                const version = process.version;
                console.log(`✅ Node.js: ${version}`);
                return version.startsWith('v18') || version.startsWith('v20');
            }
        },
        {
            name: 'Required Directories',
            check: () => {
                const dirs = ['./logs', './AnimeSession'];
                let allGood = true;
                
                for (const dir of dirs) {
                    if (!fs.existsSync(dir)) {
                        console.log(`⚠️ Missing directory: ${dir}`);
                        allGood = false;
                    } else {
                        console.log(`✅ Directory exists: ${dir}`);
                    }
                }
                
                return allGood;
            }
        },
        {
            name: 'File Permissions',
            check: () => {
                try {
                    const testFile = './logs/test.txt';
                    fs.writeFileSync(testFile, 'test');
                    fs.unlinkSync(testFile);
                    console.log('✅ File write permissions: OK');
                    return true;
                } catch (error) {
                    console.log('❌ File write permissions: FAILED');
                    return false;
                }
            }
        },
        {
            name: 'Session Status',
            check: () => {
                const sessionDir = './AnimeSession';
                if (!fs.existsSync(sessionDir)) {
                    console.log('ℹ️ No session directory found (normal for first run)');
                    return true;
                }
                
                const files = fs.readdirSync(sessionDir);
                console.log(`📁 Session files: ${files.length} files`);
                
                if (files.includes('creds.json')) {
                    try {
                        const creds = JSON.parse(fs.readFileSync('./AnimeSession/creds.json', 'utf8'));
                        if (creds.me) {
                            console.log('✅ Valid session credentials found');
                            return true;
                        } else {
                            console.log('⚠️ Session credentials incomplete');
                            return false;
                        }
                    } catch (error) {
                        console.log('❌ Invalid session credentials');
                        return false;
                    }
                } else {
                    console.log('ℹ️ No credentials file found (normal for first run)');
                    return true;
                }
            }
        },
        {
            name: 'Port Availability',
            check: () => {
                const port = process.env.PORT || 3000;
                console.log(`🌐 Port: ${port}`);
                return true; // We'll let the bot handle port conflicts
            }
        }
    ];
    
    let allPassed = true;
    
    for (const check of checks) {
        console.log(`\n🔍 Checking: ${check.name}`);
        if (!check.check()) {
            allPassed = false;
        }
    }
    
    return allPassed;
}

function main() {
    const passed = checkEnvironment();
    
    console.log('\n📊 Summary:');
    if (passed) {
        console.log('✅ Environment check passed!');
        console.log('🚀 Ready to start the bot.');
    } else {
        console.log('❌ Environment check failed!');
        console.log('🔧 Please fix the issues above before starting the bot.');
    }
    
    return passed;
}

// Run the check
const success = main();
process.exit(success ? 0 : 1); 