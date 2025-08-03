import axios from 'axios';
import fs from 'fs';
import path from 'path';

// Note: The 'iohook' import has been removed.

class AnimeCharacterBot {
    constructor() {
        this.animeAPIs = [
            'https://graphql.anilist.co/',
            'https://api.jikan.moe/v4/characters',
            'https://kitsu.io/api/edge/characters',
        ];
        this.tournamentMode = false;
        this.lastProcessedMessage = '';
        this.learnedCharacters = new Map();
        this.arabicCharacterNames = new Map();
        this.characterMappingsPath = path.join(process.cwd(), 'plugins', 'character-mappings.json');
        this.loadCharacterMappings();
        this.arabicKeyboardLayout = [
            ['ض', 'ص', 'ث', 'ق', 'ف', 'غ', 'ع', 'ه', 'خ', 'ح', 'ج'],
            ['ش', 'س', 'ي', 'ب', 'ل', 'ا', 'ت', 'ن', 'م', 'ك', 'ط'],
            ['ذ', 'ئ', 'ء', 'ؤ', 'ر', 'ى', 'ة', 'و', 'ز', 'ظ', 'د']
        ];
    }

    async loadCharacterMappings() {
        try {
            if (fs.existsSync(this.characterMappingsPath)) {
                const data = fs.readFileSync(this.characterMappingsPath, 'utf8');
                const mappings = JSON.parse(data);
                if (mappings.arabicCharacterNames) {
                    this.arabicCharacterNames = new Map(Object.entries(mappings.arabicCharacterNames));
                }
                if (mappings.learnedCharacters) {
                    this.learnedCharacters = new Map(Object.entries(mappings.learnedCharacters));
                }
            } else {
                await this.saveCharacterMappings();
            }
        } catch (error) {
            console.error(`❌ Error loading character mappings:`, error.message);
            this.arabicCharacterNames = new Map();
            this.learnedCharacters = new Map();
        }
    }

    async saveCharacterMappings() {
        try {
            const mappings = {
                arabicCharacterNames: Object.fromEntries(this.arabicCharacterNames),
                learnedCharacters: Object.fromEntries(this.learnedCharacters),
                lastUpdated: new Date().toISOString()
            };
            fs.writeFileSync(this.characterMappingsPath, JSON.stringify(mappings, null, 2), 'utf8');
        } catch (error) {
            console.error(`❌ Error saving character mappings:`, error.message);
        }
    }

    getAdaptiveDelay(characterCount = 1, isMistake = false, mistakeType = null) {
        // ULTRA FAST MODE - 180 WPM
        const baseDelay = 50; // Super fast base delay (was 650)
        const perCharacterDelay = 25; // Minimal delay per character (was 650)
        const randomVariation = Math.floor(Math.random() * 100); // Reduced random variation (was 500)
        let calculatedDelay = baseDelay + ((characterCount - 1) * perCharacterDelay) + randomVariation;
        
        // If it's a delay mistake, make it much longer
        if (isMistake && mistakeType === 'delay_mistake') {
            calculatedDelay *= 2; // Reduced from 3x to 2x
        }
        
        return calculatedDelay;
    }

    // 10% chance of making a mistake in processing (reduced from 30%)
    shouldMakeMistake() {
        return Math.random() < 0.1; // 10% chance
    }

    // 70% chance of correcting a mistake after a delay (increased from 50%)
    shouldCorrectMistake() {
        return Math.random() < 0.7; // 70% chance
    }

    // Generate correction message - simple and direct
    generateCorrectionMessage(originalCharacters) {
        return originalCharacters.join(' ');
    }

    findKeyCoordinates(char) {
        for (let r = 0; r < this.arabicKeyboardLayout.length; r++) {
            const row = this.arabicKeyboardLayout[r];
            const c = row.indexOf(char);
            if (c > -1) {
                return { r, c };
            }
        }
        return null;
    }

    getNearbyKeys(char) {
        const coords = this.findKeyCoordinates(char);
        if (!coords) return [];

        const { r, c } = coords;
        const neighbors = [];
        const rows = this.arabicKeyboardLayout.length;
        
        // Check adjacent keys (left, right, up, down)
        const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];

        for (const [dr, dc] of directions) {
            const nr = r + dr;
            const nc = c + dc;

            if (nr >= 0 && nr < rows && this.arabicKeyboardLayout[nr] && nc >= 0 && nc < this.arabicKeyboardLayout[nr].length) {
                neighbors.push(this.arabicKeyboardLayout[nr][nc]);
            }
        }
        return neighbors;
    }

    // Generate a mistake response - focus on typos
    generateMistakeResponse(originalCharacters) {
        const characters = [...originalCharacters];
        
        // 70% chance for typo, 30% chance for other mistakes
        const isTypo = Math.random() < 0.3;
        
        if (isTypo) {
            // Make a typo in one character based on keyboard proximity
            const typoIndex = Math.floor(Math.random() * characters.length);
            const originalWord = characters[typoIndex];
            
            if (originalWord.length > 1) {
                const typoPos = Math.floor(Math.random() * originalWord.length);
                const charToReplace = originalWord[typoPos];
                
                const nearbyKeys = this.getNearbyKeys(charToReplace);
                
                if (nearbyKeys.length > 0) {
                    const typoChar = nearbyKeys[Math.floor(Math.random() * nearbyKeys.length)];
                    characters[typoIndex] = originalWord.slice(0, typoPos) + typoChar + originalWord.slice(typoPos + 1);
                }
            }
        } else {
            // Other types of mistakes (less frequent)
            const mistakeTypes = ['partial_response', 'reorder', 'delay_mistake'];
            const mistakeType = mistakeTypes[Math.floor(Math.random() * mistakeTypes.length)];
            
            switch (mistakeType) {
                case 'partial_response':
                    // Only respond with some characters
                    const keepCount = Math.max(1, Math.floor(characters.length * 0.7));
                    const shuffled = [...characters].sort(() => Math.random() - 0.5);
                    characters.splice(0, characters.length, ...shuffled.slice(0, keepCount));
                    break;
                    
                case 'reorder':
                    // Reorder the characters
                    characters.sort(() => Math.random() - 0.5);
                    break;
                    
                case 'delay_mistake':
                    // This will be handled in the delay calculation
                    break;
            }
        }
        
        return {
            characters,
            mistakeType: isTypo ? 'typo' : 'other',
            isMistake: true
        };
    }

    async searchSingleAPI(apiUrl, characterName) {
        try {
            let searchUrl = '';
            if (apiUrl.includes('jikan.moe')) searchUrl = `${apiUrl}?q=${encodeURIComponent(characterName)}&limit=1`;
            else if (apiUrl.includes('kitsu.io')) searchUrl = `${apiUrl}?filter[name]=${encodeURIComponent(characterName)}&page[limit]=1`;
            else if (apiUrl.includes('anilist.co')) {
                const query = "query ($search: String) { Character(search: $search) { name { full native } id } }";
                const response = await axios.post(apiUrl, { query, variables: { search: characterName } }, { timeout: 3000 }); // Reduced timeout from 660
                if (response.data?.data?.Character) {
                    const char = response.data.data.Character;
                    return { name: char.name.full || char.name.native, confidence: 0.9, source: 'AniList' };
                }
                return null;
            }
            const response = await axios.get(searchUrl, { timeout: 3000, headers: { 'User-Agent': 'AnimeBot/1.0' } }); // Reduced timeout from 660
            if (response.data?.data?.[0]?.attributes) {
                const attrs = response.data.data[0].attributes;
                return { name: attrs.name || attrs.canonicalName, confidence: 0.8, source: apiUrl.split('/')[2] };
            }
        } catch (error) { 
            // Rate limit protection - exponential backoff
            if (error.response?.status === 429) {
                const retryAfter = parseInt(error.response.headers['retry-after']) || 30; // Reduced from 60
                await this.sleep(retryAfter * 1000);
            }
        }
        return null;
    }

    isTournamentMessage(text) {
        const content = this.extractContentBetweenAsterisks(text);
        if (!content.trim()) return false;
        const tournamentWords = /تورنير|مسابقة|بطولة|مباراة|tournament|match|ضد|vs|versus|\/|\|/i.test(content);
        const hasMultipleWords = content.trim().split(/[\s\/\-\|،,؛;:vsضد]+/).length >= 2;
        return tournamentWords || hasMultipleWords;
    }

    async processMessage(message) {
        const messageText = message.body || '';
        if (!messageText.trim() || messageText === this.lastProcessedMessage) return null;
        const learnedCharacters = await this.extractPotentialCharacters(messageText);
        if (learnedCharacters.length === 0) return null;
        this.lastProcessedMessage = messageText;
        this.tournamentMode = this.isTournamentMessage(messageText);
        return { learnedCharacters, tournamentMode: this.tournamentMode, originalText: messageText };
    }

    sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    formatResponse(result) {
        if (!result || result.learnedCharacters.length === 0) return null;
        const characterNames = result.learnedCharacters.map(char => char.input);
        
        // Check if we should make a mistake (30% chance)
        if (this.shouldMakeMistake()) {
            const mistakeResult = this.generateMistakeResponse(characterNames);
            return { 
                text: mistakeResult.characters.join(' '), 
                characterCount: mistakeResult.characters.length,
                isMistake: true,
                mistakeType: mistakeResult.mistakeType,
                originalCharacters: characterNames
            };
        }
        
        return { 
            text: characterNames.join(' '), 
            characterCount: characterNames.length,
            isMistake: false
        };
    }

    normalizeArabicText(text) {
        return text.replace(/[أإآا]/g, 'ا').replace(/[ىي]/g, 'ي').replace(/[ةه]/g, 'ه').replace(/[ؤو]/g, 'و').replace(/[ئء]/g, 'ء').replace(/[كک]/g, 'ك').toLowerCase();
    }

    extractContentBetweenAsterisks(text) {
        const matches = text.match(/\*([^*]+)\*/g);
        if (!matches) return '';
        
        // Extract content and remove emojis
        const content = matches.map(m => m.slice(1, -1)).join(' ');
        
        // Remove emojis and other symbols, keep only Arabic text, English letters, and spaces
        const cleanContent = content
            .replace(/[\u{1F600}-\u{1F64F}]/gu, ' ') // Emoticons -> space
            .replace(/[\u{1F300}-\u{1F5FF}]/gu, ' ') // Miscellaneous Symbols and Pictographs -> space
            .replace(/[\u{1F680}-\u{1F6FF}]/gu, ' ') // Transport and Map Symbols -> space
            .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, ' ') // Regional Indicator Symbols -> space
            .replace(/[\u{2600}-\u{26FF}]/gu, ' ') // Miscellaneous Symbols -> space
            .replace(/[\u{2700}-\u{27BF}]/gu, ' ') // Dingbats -> space
            .replace(/[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFFa-zA-Z\s]/g, ' ') // Keep only Arabic, English, and spaces
            .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
            .trim();
        
        return cleanContent;
    }

    async extractPotentialCharacters(text) {
        const content = this.extractContentBetweenAsterisks(text);
        if (!content.trim()) return [];
        
        // Simply split by spaces and return all words as characters
        const separators = /[\s\/\-\|،,؛;:]+/g;
        const words = content.split(separators).filter(Boolean);
        
        // Return all words as potential characters (no filtering)
        const potentialCharacters = words.map((word, index) => ({
            input: word,
            indices: [index],
            confidence: 1.0,
            isCharacter: true
        }));
        
        if (potentialCharacters.length > 0) this.saveCharacterMappings().catch(console.error);
        return potentialCharacters;
    }

    isCommonWord(word) {
        const commonWords = [
            'في', 'من', 'الى', 'على', 'عن', 'كيف', 'متى', 'اين', 'ماذا', 'هذا', 'هذه', 'ذلك', 'تلك', 'التي', 'الذي',
            'عند', 'مع', 'حول', 'بين', 'خلف', 'امام', 'فوق', 'تحت', 'داخل', 'خارج', 'قبل', 'بعد', 'خلال', 'اثناء',
            'the', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'into', 'through', 'during',
            'هنا', 'هناك', 'حيث', 'متى', 'كيف', 'لماذا', 'اين', 'من', 'الى', 'على', 'في', 'مع', 'من', 'الى', 'على',
            'هذا', 'هذه', 'ذلك', 'تلك', 'التي', 'الذي', 'عند', 'مع', 'حول', 'بين', 'خلف', 'امام', 'فوق', 'تحت'
        ];
        return commonWords.includes(word.toLowerCase());
    }

    classifyWord(normalizedWord) {
        // Reject words with special characters, numbers, or symbols
        if (/[^ا-ي]/.test(normalizedWord) || /^[0-9]+$/.test(normalizedWord) || this.isCommonWord(normalizedWord)) {
            return { isCharacter: false, confidence: 0 };
        }
        
        // Reject single letters and very short words
        if (normalizedWord.length < 4 || normalizedWord.length > 10) {
            return { isCharacter: false, confidence: 0 };
        }
        
        // Reject common Arabic words that are definitely not anime characters
        const nonAnimeWords = [
            'اسم', 'هذا', 'هذه', 'ذلك', 'تلك', 'التي', 'الذي', 'عند', 'مع', 'في', 'من', 'الى', 'على', 
            'كيف', 'متى', 'اين', 'ماذا', 'هنا', 'هناك', 'حيث', 'لماذا', 'كذا', 'كذلك', 'ايضا', 'ايضا',
            'س', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'ه', 'و', 'ي'
        ];
        
        if (nonAnimeWords.includes(normalizedWord)) {
            return { isCharacter: false, confidence: 0 };
        }
        
        // More strict anime character patterns
        let score = 0;
        
        // Common anime character name endings (Japanese-style names)
        if (/كو$|كي$|تو$|رو$|مي$|ري$|سا|نا|يو|شي|كو$|كي$|تو$|رو$|مي$|ري$/.test(normalizedWord)) score += 0.7;
        
        // Common anime character name patterns (pure Arabic letters only)
        if (/^[ا-ي]{4,8}$/.test(normalizedWord)) score += 0.5;
        
        // Specific anime character name endings
        if (/ه$|ة$|ي$|و$|ا$/.test(normalizedWord)) score += 0.6;
        
        // Length check for typical anime names
        if (normalizedWord.length >= 4 && normalizedWord.length <= 8) score += 0.5;
        
        // Consonant-vowel ratio typical of anime names
        const consonantRatio = (normalizedWord.length - (normalizedWord.match(/[اوي]/g) || []).length) / normalizedWord.length;
        if (consonantRatio >= 0.4 && consonantRatio <= 0.7) score += 0.4;
        
        // Penalize repetitive characters
        if (/([ا-ي])\1\1/.test(normalizedWord)) score -= 0.5;
        
        // Penalize common non-anime words
        if (/هذا|هذه|ذلك|تلك|التي|الذي|عند|مع|في|من|الى|على|كيف|متى|اين|ماذا|اسم/.test(normalizedWord)) score -= 0.8;
        
        // Bonus for known anime character patterns
        if (/^[ا-ي]{4,6}$/.test(normalizedWord) && !this.isCommonWord(normalizedWord)) score += 0.3;
        
        const finalScore = Math.max(0, Math.min(score, 1.0));
        return { isCharacter: finalScore > 0.6, confidence: finalScore };
    }

    async searchCharacterInDatabases(characterName) {
        const normalizedName = this.normalizeArabicText(characterName);
        if (this.arabicCharacterNames.has(normalizedName)) return { name: this.arabicCharacterNames.get(normalizedName), confidence: 1.0, source: 'Local Mapping' };
        if (this.learnedCharacters.has(normalizedName)) return { ...this.learnedCharacters.get(normalizedName), source: 'Learned Characters' };
        const apiPromises = this.animeAPIs.map(api => this.searchSingleAPI(api, characterName));
        const results = await Promise.all(apiPromises);
        const validResults = results.filter(Boolean);
        if (validResults.length > 0) return validResults.reduce((best, current) => current.confidence > best.confidence ? current : best);
        return null;
    }
}

// WhatsApp Bot Integration for Baileys
class WhatsAppAnimeBot {
    constructor(sock, config = null) {
        this.sock = sock;
        this.animeBot = new AnimeCharacterBot();
        this.isActive = false; // Bot starts as inactive by default
        this.selectedGroup = null; // Selected group to work in
        this.activationTimestamp = null; // Timestamp for when the bot is activated
        this.ownerNumbers = config?.bot?.ownerNumbers || ['96176337375','966584646464','967771654273','967739279014'];
        this.messageHandler = null;
        this.processedMessages = new Set();
        this.messageProcessingQueue = new Map(); // Track processing messages
        this.lastMessageTime = 0;
        this.minMessageInterval = 100; // ULTRA FAST - 100ms between messages (was 1000ms)
        this.messageTimeout = 5000; // Reduced timeout (was 15000)
        this.maxProcessedMessages = 50; // Reduced from 100
        this.queueTimeout = 5000; // Reduced from 10000
        this.maxMessageAge = 60; // Increased from 30 to handle more messages
        this.setupMessageHandler();
    }

    isOwner(senderNumber) {
        // Remove @s.whatsapp.net suffix if present
        const cleanNumber = senderNumber.replace('@s.whatsapp.net', '');
        const isOwner = this.ownerNumbers.includes(cleanNumber);
        return isOwner;
    }

    async getGroupsList() {
        try {
            const groups = await this.sock.groupFetchAllParticipating();
            return Object.entries(groups).map(([id, group]) => ({
                id: id,
                name: group.subject || 'Unknown Group',
                participants: group.participants?.length || 0
            }));
        } catch (error) {
            console.error('Error fetching groups:', error);
            return [];
        }
    }

    async clearGroupChat(groupId) {
        try {
            // Use chatModify to clear all messages in the group
            await this.sock.chatModify({ clear: 'all' }, groupId);
        } catch (error) {
            console.error('Error clearing group chat:', error.message);
        }
    }

    setupMessageHandler() {
        if (this.messageHandler) this.sock.ev.off('messages.upsert', this.messageHandler);
        
        this.messageHandler = async (messageUpdate) => {
            const sortedMessages = messageUpdate.messages?.sort((a, b) => (b.messageTimestamp || 0) - (a.messageTimestamp || 0)) || [];

            for (const message of sortedMessages) {
                try {
                    const msgContent = message.message?.conversation || message.message?.extendedTextMessage?.text;
                    if (message.key.fromMe || !msgContent) continue;

                    const chatId = message.key.remoteJid;
                    const senderNumber = message.key.participant || message.key.remoteJid?.split('@')[0];
                    const messageTimestamp = message.messageTimestamp || 0;
                    const messageId = message.key.id;

                    // ULTRA FAST RATE LIMITING - Minimal delay
                    const currentTime = Date.now();
                    if (currentTime - this.lastMessageTime < this.minMessageInterval) {
                        continue;
                    }

                    // If bot is active, ignore messages older than the activation timestamp
                    if (this.isActive && this.activationTimestamp && messageTimestamp < this.activationTimestamp) {
                        continue;
                    }

                    // Enhanced message deduplication
                    const messageKey = `${chatId}-${messageId}-${messageTimestamp}`;
                    if (this.processedMessages.has(messageKey)) continue;
                    
                    // Check if message is too old
                    const currentTimeSeconds = Math.floor(Date.now() / 1000);
                    if (currentTimeSeconds - messageTimestamp > this.maxMessageAge) {
                        console.log(`[SKIP] Message too old: ${messageId}`);
                        continue;
                    }

                    // Check if message is already being processed
                    if (this.messageProcessingQueue.has(messageId)) {
                        console.log(`[SKIP] Message already being processed: ${messageId}`);
                        continue;
                    }

                    this.processedMessages.add(messageKey);
                    this.messageProcessingQueue.set(messageId, Date.now());
                    
                    // Clean up old processed messages
                    if (this.processedMessages.size > this.maxProcessedMessages) {
                        const firstKey = this.processedMessages.values().next().value;
                        this.processedMessages.delete(firstKey);
                    }

                    // Clean up old processing queue entries
                    for (const [id, timestamp] of this.messageProcessingQueue.entries()) {
                        if (Date.now() - timestamp > this.queueTimeout) {
                            this.messageProcessingQueue.delete(id);
                        }
                    }

                    this.lastMessageTime = currentTime;

                    console.log(`[MSG] Processing: ${senderNumber} in ${chatId} | Content: ${msgContent.substring(0, 50)}...`);
                    
                    // Process message with timeout
                    const processingPromise = this.handleCommand(msgContent, senderNumber, chatId);
                    const timeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Message processing timeout')), this.messageTimeout)
                    );
                    
                    try {
                        await Promise.race([processingPromise, timeoutPromise]);
                    } catch (error) {
                        console.error(`❌ Error processing message ${messageId}:`, error.message);
                    } finally {
                        // Remove from processing queue
                        this.messageProcessingQueue.delete(messageId);
                    }
                    
                } catch (error) {
                    console.error(`❌ Error in message handler:`, error);
                }
            }
        };
        
        this.sock.ev.on('messages.upsert', this.messageHandler);
    }

    async handleCommand(msgContent, senderNumber, chatId) {
        const command = msgContent.trim();

        // Owner-only commands
        if (this.isOwner(senderNumber)) {
            if (command === '.a' || command === '.ابدا') {
                const groups = await this.getGroupsList();
                if (groups.length === 0) {
                    await this.sock.sendMessage(chatId, { text: '❌ No groups found!' });
                    return;
                }
                let groupsList = '📋 **Available Groups:**\n';
                groups.forEach((group, index) => {
                    const isSelected = this.selectedGroup === group.id;
                    const status = isSelected ? '✅ (Selected)' : '';
                    groupsList += `${index + 1}. ${group.name} (${group.participants} members) ${status}\n`;
                });
                groupsList += '\n📝 **Commands:**';
                groupsList += '\n• Reply with a number to activate bot in that group';
                groupsList += '\n• `.clear` or `.مسح` - Clear the selected group chat';
                groupsList += '\n• `.x` or `.وقف` - Deactivate the bot';
                groupsList += '\n• `.status` or `.حالة` - Check bot status';
                
                if (this.isActive) {
                    groupsList += `\n\n🤖 **Bot Status:** Active in selected group`;
                } else {
                    groupsList += `\n\n🤖 **Bot Status:** Inactive - Select a group to activate`;
                }
                
                await this.sock.sendMessage(chatId, { text: groupsList });
                return;
            }

            if (command === '.x' || command === '.وقف') {
                this.isActive = false;
                this.selectedGroup = null;
                this.activationTimestamp = null; // Reset timestamp on deactivation
                await this.sock.sendMessage(chatId, { text: '🔴 Bot deactivated successfully!' });
                return;
            }

            if (command === '.clear' || command === '.مسح') {
                if (this.selectedGroup) {
                    await this.sock.sendMessage(chatId, { text: '🧹 Clearing group chat...' });
                    await this.clearGroupChat(this.selectedGroup);
                    await this.sock.sendMessage(chatId, { text: '✅ Group chat cleared successfully!' });
                } else {
                    await this.sock.sendMessage(chatId, { text: '❌ No group selected. Use .ابدا first to select a group.' });
                }
                return;
            }

            if (/^\d+$/.test(command) && !this.isActive) {
                const groups = await this.getGroupsList();
                const selectedIndex = parseInt(command) - 1;
                if (selectedIndex >= 0 && selectedIndex < groups.length) {
                    const selectedGroup = groups[selectedIndex];
                    
                    // Send initial activation message
                    await this.sock.sendMessage(chatId, {
                        text: `🔄 Activating bot in: **${selectedGroup.name}**\n\nClearing chat and setting up bot session...`
                    });
                    
                    try {
                        // Clear the group chat first
                        await this.clearGroupChat(selectedGroup.id);
                        
                        // Set bot as active
                        this.selectedGroup = selectedGroup.id;
                        this.isActive = true;
                        this.activationTimestamp = Math.floor(Date.now() / 1000);
                        
                        // Send success message
                        await this.sock.sendMessage(chatId, {
                            text: `✅ Bot successfully activated in: **${selectedGroup.name}**\n\n🧹 Chat has been cleared\n🤖 Bot is now active and ready to detect anime characters!`
                        });
                        
                        // Send a message to the group to announce bot activation
                
                    } catch (error) {
                        console.error('❌ Error during bot activation:', error);
                        await this.sock.sendMessage(chatId, {
                            text: `❌ Failed to activate bot in ${selectedGroup.name}: ${error.message}`
                        });
                        // Reset state on error
                        this.selectedGroup = null;
                        this.isActive = false;
                        this.activationTimestamp = null;
                    }
                } else {
                    await this.sock.sendMessage(chatId, { text: '❌ Invalid group number!' });
                }
                return;
            }
        }

        // Public commands
        if (command === '.status' || command === '.حالة') {
            const status = this.getStatus();
            await this.sock.sendMessage(chatId, { text: `🤖 Bot Status: ${status.status}` });
            return;
        }

        // Character detection logic with improved error handling
        if (this.isActive && (!this.selectedGroup || chatId === this.selectedGroup)) {
            try {
                const result = await this.animeBot.processMessage({ body: msgContent });
                if (result?.learnedCharacters?.length > 0) {
                    const responseData = this.animeBot.formatResponse(result);
                    if (responseData?.text) {
                        const delay = this.animeBot.getAdaptiveDelay(responseData.characterCount, responseData.isMistake, responseData.mistakeType);
                        
                        // ULTRA FAST - Minimal random delay
                        const randomDelay = Math.random() * 50; // Reduced from 500
                        await this.animeBot.sleep(delay + randomDelay);
                        
                        // Send message with retry logic
                        let retryCount = 0;
                        const maxRetries = 1; // Reduced from 2
                        
                        while (retryCount < maxRetries) {
                            try {
                                await this.sock.sendMessage(chatId, { text: responseData.text });
                                break; // Success, exit retry loop
                            } catch (error) {
                                retryCount++;
                                console.error(`❌ Failed to send message (attempt ${retryCount}/${maxRetries}):`, error.message);
                                
                                if (retryCount >= maxRetries) {
                                    console.error('❌ Max retries reached for sending message');
                                    break;
                                }
                                
                                // Wait before retry
                                await this.animeBot.sleep(500 * retryCount); // Reduced from 1000
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('❌ Error in character detection:', error.message);
            }
        }
    }

    cleanup() {
        if (this.messageHandler) this.sock.ev.off('messages.upsert', this.messageHandler);
    }

    getStatus() {
        const groupInfo = this.selectedGroup ? ` in selected group` : '';
        return {
            active: this.isActive,
            selectedGroup: this.selectedGroup,
            charactersLearned: this.animeBot.learnedCharacters.size,
            status: this.isActive ? `Active${groupInfo} - Detecting anime characters` : 'Inactive - Send .ابدا to activate'
        };
    }
}

export { AnimeCharacterBot, WhatsAppAnimeBot };