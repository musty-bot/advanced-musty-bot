const logger = require('./logger');
const config = require('../config');
const fs = require('fs-extra');
const path = require('path');

module.exports = {
    // Extract command and arguments from message
    parseCommand(message) {
        if (!message || typeof message !== 'string') return null;
        if (!message.startsWith(config.prefix)) return null;
        
        const args = message.slice(config.prefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        
        return {
            command,
            args,
            original: message
        };
    },

    // Check if number is admin
    isAdmin(number) {
        if (!number || !config.adminNumber) return false;
        
        // Clean both numbers for comparison
        const cleanNumber = this.cleanJid(number);
        const cleanAdmin = this.cleanJid(config.adminNumber);
        
        return cleanNumber === cleanAdmin;
    },

    // Clean JID for comparison
    cleanJid(jid) {
        if (!jid) return '';
        // Remove all suffixes and keep only numbers
        return jid.replace(/@[^@]+$/, '').replace(/\D/g, '');
    },

    // Format phone number to JID
    formatNumber(number) {
        if (!number) return null;
        // Remove non-digits
        const cleaned = number.replace(/\D/g, '');
        // Add @s.whatsapp.net suffix
        return `${cleaned}@s.whatsapp.net`;
    },

    // Format group JID
    formatGroupJid(groupId) {
        if (!groupId) return null;
        const cleaned = groupId.replace(/\D/g, '');
        return `${cleaned}@g.us`;
    },

    // Download media helper
    async downloadMedia(sock, message, filename) {
        try {
            if (!message.message) return null;
            
            const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage'];
            const messageType = Object.keys(message.message).find(key => mediaTypes.includes(key));
            
            if (!messageType) return null;
            
            // Map message types to file extensions
            const extMap = {
                'imageMessage': 'jpg',
                'videoMessage': 'mp4',
                'audioMessage': 'mp3',
                'documentMessage': message.message.documentMessage?.fileName?.split('.').pop() || 'bin'
            };
            
            const ext = extMap[messageType] || 'bin';
            const finalFilename = filename || `${Date.now()}.${ext}`;
            const filePath = path.join(config.mediaPath, finalFilename);
            
            // Download media
            const buffer = await require('@whiskeysockets/baileys').downloadMediaMessage(
                message,
                'buffer',
                {},
                { 
                    logger: require('pino')({ level: 'error' }),
                    reuploadRequest: sock.updateMediaMessage
                }
            );
            
            if (buffer) {
                await fs.writeFile(filePath, buffer);
                logger.info(`Media downloaded: ${filePath}`);
                return filePath;
            }
            
            return null;
        } catch (error) {
            logger.error(`Failed to download media: ${error.message}`);
            return null;
        }
    },

    // Generate help text
    getHelpText() {
        return `
🤖 *${config.botName} Commands*

*Basic Commands:*
${config.prefix}help - Show this help message
${config.prefix}ping - Check if bot is alive
${config.prefix}info - Get bot information
${config.prefix}time - Get current time

*Group Commands:*
${config.prefix}groupinfo - Get group information
${config.prefix}admins - List group admins
${config.prefix}link - Get group invite link
${config.prefix}tagall - Mention all group members
${config.prefix}add <number> - Add user to group

*Admin Commands:*
${config.prefix}status - Check bot status
${config.prefix}broadcast <message> - Send to all saved contacts
${config.prefix}logs [lines] - View bot logs
${config.prefix}stats - View bot statistics
${config.prefix}restart - Restart the bot

*Status Monitoring Commands:*
${config.prefix}statusmonitor <number> - Monitor contact's status
${config.prefix}statusstop <number> - Stop monitoring contact
${config.prefix}statuslist - List monitored contacts
${config.prefix}statuscheck [number] - Check status
${config.prefix}statusstats - Status monitoring statistics
${config.prefix}statusexport - Export status data

*Media Commands:*
Send any image/video with caption "${config.prefix}sticker" to create sticker
Send media with caption "${config.prefix}download" to save it

Use ${config.prefix} before each command!
        `;
    },

    // Extract JID info
    extractJidInfo(jid) {
        if (!jid) return { user: null, server: null, isGroup: false };
        
        const isGroup = jid.endsWith('@g.us');
        const [user, server] = jid.split('@');
        
        return {
            user,
            server,
            isGroup,
            fullJid: jid
        };
    },

    // Validate phone number
    isValidPhoneNumber(number) {
        const phoneRegex = /^[0-9]{10,15}$/;
        return phoneRegex.test(number.replace(/\D/g, ''));
    },

    // Create mention text
    createMentionText(userId, displayName = 'User') {
        const jidInfo = this.extractJidInfo(userId);
        return `@${jidInfo.user}`;
    },

    // Format bytes to human readable
    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    },

    // Sleep/delay function
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    // Generate random ID
    generateId(length = 10) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
};