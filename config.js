require('dotenv').config();

module.exports = {
    // Bot Configuration
    botName: process.env.BOT_NAME || "WhatsApp Bot",
    prefix: process.env.BOT_PREFIX || "!",
    adminNumber: process.env.ADMIN_NUMBER || "",
    
    // Paths
    sessionPath: process.env.SESSION_PATH || "./sessions",
    mediaPath: process.env.MEDIA_PATH || "./media",
    statusDataPath: process.env.STATUS_DATA_PATH || "./status-data",
    
    // Features
    features: {
        statusMonitoring: process.env.ENABLE_STATUS_MONITORING === 'true',
        autoReply: process.env.ENABLE_AUTO_REPLY === 'true',
        groupManagement: process.env.ENABLE_GROUP_MANAGEMENT === 'true',
        broadcast: process.env.ENABLE_BROADCAST === 'true'
    },
    
    // Status Monitoring Settings
    statusMonitoring: {
        checkInterval: parseInt(process.env.STATUS_CHECK_INTERVAL) || 300000, // 5 minutes
        historyDays: parseInt(process.env.STATUS_HISTORY_DAYS) || 7,
        maxMonitoredContacts: 50
    },
    
    // Auto Reply Settings
    autoReply: {
        greeting: process.env.AUTO_REPLY_GREETING === 'true',
        keywords: (process.env.AUTO_REPLY_KEYWORDS || "hello,hi,hey").split(',').map(k => k.trim().toLowerCase())
    },
    
    // Logging
    logLevel: process.env.LOG_LEVEL || "info",
    logFile: process.env.LOG_FILE || "bot.log",
    
    // Auto-reply messages
    autoReplies: {
        greeting: "👋 Hello! I'm a WhatsApp bot. Use " + (process.env.BOT_PREFIX || "!") + "help for commands.",
        busy: "⏳ The bot is currently busy. Please try again later.",
        default: "📩 I received your message. Use " + (process.env.BOT_PREFIX || "!") + "help for available commands."
    },
    
    // Commands configuration
    commands: {
        cooldown: parseInt(process.env.COMMAND_COOLDOWN) || 2000,
        maxLength: parseInt(process.env.MAX_MESSAGE_LENGTH) || 1000
    },
    
    // Baileys settings
    baileys: {
        version: "6.5.0",
        browser: ['Ubuntu', 'Chrome', '120.0.0.0']
    }
};