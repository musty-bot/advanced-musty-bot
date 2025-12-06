const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const config = require('../config');
const path = require('path');
const fs = require('fs-extra');

// Import command modules
const basicCommands = require('../commands/basicCommands');
const groupCommands = require('../commands/groupCommands');
const adminCommands = require('../commands/adminCommands');
const statusHandler = require('./statusHandler');

// Cooldown tracking
const cooldowns = new Map();

module.exports = {
    handleMessage: async (sock, message) => {
        try {
            // Extract message content based on type
            let messageBody = '';
            let messageType = '';
            
            // Check message type
            if (message.message?.conversation) {
                messageBody = message.message.conversation;
                messageType = 'conversation';
            } else if (message.message?.extendedTextMessage?.text) {
                messageBody = message.message.extendedTextMessage.text;
                messageType = 'extendedTextMessage';
            } else if (message.message?.imageMessage?.caption) {
                messageBody = message.message.imageMessage.caption;
                messageType = 'imageMessage';
            } else if (message.message?.videoMessage?.caption) {
                messageBody = message.message.videoMessage.caption;
                messageType = 'videoMessage';
            } else if (message.message?.documentMessage?.caption) {
                messageBody = message.message.documentMessage.caption;
                messageType = 'documentMessage';
            } else {
                // Handle media without text
                await handleMediaMessage(sock, message);
                return;
            }
            
            // Get sender info
            const jid = message.key.remoteJid;
            const sender = message.key.participant || jid;
            const isGroup = jid.endsWith('@g.us');
            
            // Ignore status broadcasts
            if (jid === 'status@broadcast') return;
            
            // Log the message
            logger.debug(`📩 Message from ${sender}: ${messageBody.substring(0, 100)}${messageBody.length > 100 ? '...' : ''}`);
            
            // Prepare message object for handlers
            const messageObj = {
                body: messageBody,
                from: jid,
                sender: sender,
                isGroup: isGroup,
                type: messageType,
                raw: message,
                key: message.key,
                sock: sock,
                timestamp: new Date(message.messageTimestamp * 1000 || Date.now())
            };
            
            // Auto-reply feature
            if (config.features.autoReply && !messageBody.startsWith(config.prefix)) {
                await handleAutoReply(sock, messageObj);
            }
            
            // Check if message is a command
            const parsed = helpers.parseCommand(messageBody);
            if (!parsed) return;
            
            // Increment command count
            logger.incrementCommandCount();
            
            // Check cooldown
            const now = Date.now();
            const cooldownAmount = config.commands.cooldown;
            const cooldownKey = `${sender}-${parsed.command}`;
            
            if (cooldowns.has(cooldownKey)) {
                const expirationTime = cooldowns.get(cooldownKey) + cooldownAmount;
                if (now < expirationTime) {
                    const timeLeft = (expirationTime - now) / 1000;
                    await sock.sendMessage(jid, { 
                        text: `⏳ Please wait ${timeLeft.toFixed(1)} seconds before using this command again.` 
                    });
                    return;
                }
            }
            
            // Set cooldown
            cooldowns.set(cooldownKey, now);
            setTimeout(() => cooldowns.delete(cooldownKey), cooldownAmount);
            
            // Route command to appropriate handler
            await routeCommand(sock, messageObj, parsed);
            
        } catch (error) {
            logger.error(`💥 Error handling message: ${error.message}`);
        }
    }
};

async function handleAutoReply(sock, message) {
    const messageBody = message.body?.toLowerCase() || '';
    
    // Check if any keyword matches
    const shouldReply = config.autoReply.keywords.some(keyword => 
        messageBody.includes(keyword)
    );
    
    if (shouldReply && config.autoReply.greeting) {
        try {
            await sock.sendMessage(message.from, { 
                text: config.autoReplies.greeting 
            });
            logger.incrementAutoReplyCount();
            logger.info(`🤖 Auto-reply sent to ${message.from}`);
        } catch (error) {
            logger.error(`Failed to send auto-reply: ${error.message}`);
        }
    }
}

async function handleMediaMessage(sock, message) {
    const jid = message.key.remoteJid;
    const sender = message.key.participant || jid;
    
    // Check for media types
    if (message.message?.imageMessage || message.message?.videoMessage) {
        logger.debug(`🖼️ Media received from ${sender}`);
        
        // Check caption for commands
        const caption = message.message?.imageMessage?.caption || 
                       message.message?.videoMessage?.caption || 
                       message.message?.documentMessage?.caption || '';
        
        if (caption.startsWith(config.prefix + 'sticker')) {
            await createSticker(sock, message);
        } else if (caption.startsWith(config.prefix + 'download')) {
            await downloadMedia(sock, message);
        }
    }
}

async function createSticker(sock, message) {
    try {
        const jid = message.key.remoteJid;
        await sock.sendMessage(jid, { 
            text: '🔄 Creating sticker... (This feature requires additional setup with sharp library)' 
        });
        logger.info(`Sticker creation requested by ${jid}`);
    } catch (error) {
        logger.error(`Failed to create sticker: ${error.message}`);
    }
}

async function downloadMedia(sock, message) {
    try {
        const jid = message.key.remoteJid;
        const filePath = await helpers.downloadMedia(sock, message);
        
        if (filePath) {
            await sock.sendMessage(jid, { 
                text: `✅ Media downloaded successfully!\n📁 Path: ${filePath}` 
            });
        } else {
            await sock.sendMessage(jid, { 
                text: '❌ Failed to download media.' 
            });
        }
    } catch (error) {
        logger.error(`Failed to download media: ${error.message}`);
    }
}

async function routeCommand(sock, message, parsed) {
    const { command, args } = parsed;
    const jid = message.from;
    
    logger.info(`🛠️ Command "${command}" from ${message.sender}`);
    
    // Prepare arguments for command functions
    const commandArgs = {
        sock: sock,
        message: message,
        args: args,
        jid: jid,
        sender: message.sender,
        isGroup: message.isGroup
    };
    
    // Basic commands
    const basicCommandMap = {
        'ping': basicCommands.ping,
        'help': basicCommands.help,
        'info': basicCommands.info,
        'time': basicCommands.time,
        'status': basicCommands.status
    };
    
    // Group commands
    const groupCommandMap = {
        'groupinfo': groupCommands.groupinfo,
        'admins': groupCommands.admins,
        'link': groupCommands.link,
        'tagall': groupCommands.tagall,
        'add': groupCommands.add
    };
    
    // Admin commands
    const adminCommandMap = {
        'broadcast': adminCommands.broadcast,
        'logs': adminCommands.logs,
        'restart': adminCommands.restart,
        'stats': adminCommands.stats
    };
    
    // Status commands
    const statusCommandMap = {
        'statusmonitor': statusHandler.statusCommands.statusmonitor,
        'statusstop': statusHandler.statusCommands.statusstop,
        'statuslist': statusHandler.statusCommands.statuslist,
        'statuscheck': statusHandler.statusCommands.statuscheck,
        'statusstats': statusHandler.statusCommands.statusstats,
        'statusexport': statusHandler.statusCommands.statusexport
    };
    
    // Check command maps in order
    if (basicCommandMap[command]) {
        await basicCommandMap[command](commandArgs);
    } else if (groupCommandMap[command]) {
        if (!message.isGroup) {
            await sock.sendMessage(jid, { text: '❌ This command only works in groups!' });
            return;
        }
        await groupCommandMap[command](commandArgs);
    } else if (adminCommandMap[command]) {
        if (!helpers.isAdmin(message.sender)) {
            await sock.sendMessage(jid, { text: '❌ This command is for admins only!' });
            return;
        }
        await adminCommandMap[command](commandArgs);
    } else if (statusCommandMap[command]) {
        if (!helpers.isAdmin(message.sender)) {
            await sock.sendMessage(jid, { text: '❌ Status commands are for admins only!' });
            return;
        }
        await statusCommandMap[command](commandArgs);
    } else {
        await sock.sendMessage(jid, { 
            text: `❌ Unknown command: ${command}\nUse ${config.prefix}help for available commands.` 
        });
    }
}