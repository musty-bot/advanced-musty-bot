const makeWASocket = require('@whiskeysockets/baileys').default;
const { 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion, 
    makeCacheableSignalKeyStore,
    downloadMediaMessage,
    getContentType
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const fs = require('fs-extra');
const path = require('path');
const Pino = require('pino');

// Import config and utilities
const config = require('./config');
const logger = require('./utils/logger');
const messageHandler = require('./handlers/messageHandler');
const statusHandler = require('./handlers/statusHandler');
const WebDashboard = require('./server'); // Import web dashboard

// Ensure directories exist
fs.ensureDirSync(config.sessionPath);
fs.ensureDirSync(config.mediaPath);
fs.ensureDirSync(config.statusDataPath || './status-data');

class WhatsAppBot {
    constructor() {
        this.sock = null;
        this.isReady = false;
        this.authState = null;
        this.webDashboard = new WebDashboard(); // Initialize web dashboard
        this.statsInterval = null;
        this.startBot();
    }

    async startBot() {
        try {
            logger.info('🚀 Starting WhatsApp Bot with Baileys...');
            
            // Send initial status to web dashboard
            this.webDashboard.setBotStatus('starting');
            
            // Create auth state
            const { state, saveCreds } = await useMultiFileAuthState(config.sessionPath);
            this.authState = state;
            
            // Fetch latest version
            const { version, isLatest } = await fetchLatestBaileysVersion();
            logger.info(`📱 Using WA version: ${version.join('.')}, isLatest: ${isLatest}`);
            
            // Create socket connection
            this.sock = makeWASocket({
                version,
                logger: Pino({ level: 'silent' }),
                printQRInTerminal: false,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, Pino({ level: 'error' }))
                },
                browser: ['Ubuntu', 'Chrome', '120.0.0.0'],
                generateHighQualityLinkPreview: true,
                markOnlineOnConnect: true,
                syncFullHistory: false,
                defaultQueryTimeoutMs: 60000,
                emitOwnEvents: true,
                retryRequestDelayMs: 1000,
                fireInitQueries: true,
                shouldIgnoreJid: (jid) => false,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
            });
            
            // Setup event handlers
            this.setupEventHandlers(saveCreds);
            
        } catch (error) {
            logger.error(`❌ Failed to start bot: ${error.message}`);
            this.webDashboard.setBotStatus('error');
            console.error('\n❌ Critical error starting bot. Please check logs.\n');
            console.error('Error details:', error.stack);
            process.exit(1);
        }
    }

    setupEventHandlers(saveCreds) {
        // Handle connection updates
        this.sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                logger.info('QR Code received');
                
                // Send QR to web dashboard
                this.webDashboard.setQrCode(qr);
                this.webDashboard.setBotStatus('qr_pending');
                
                // Also show in terminal
                console.log('\n══════════════════════════════════════════════════');
                console.log('📱 QR Code available in web dashboard');
                console.log(`🌐 Open: http://localhost:${process.env.PORT || 3000}`);
                console.log('══════════════════════════════════════════════════\n');
                
                // Show QR in terminal for convenience
                qrcode.generate(qr, { small: true });
            }
            
            if (connection === 'open') {
                this.isReady = true;
                logger.success('✅ WhatsApp Client is ready!');
                this.webDashboard.setBotStatus('connected');
                this.showWelcomeMessage();
                
                // Start stats updates for dashboard
                this.startStatsUpdates();
                
                // Initialize status monitoring
                if (config.features.statusMonitoring) {
                    setTimeout(() => {
                        statusHandler.initializeStatusMonitor(this.sock);
                    }, 5000);
                }
            }
            
            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                logger.warn(`🔌 Connection closed: ${lastDisconnect.error?.message || 'Unknown error'}, Reconnecting: ${shouldReconnect}`);
                this.webDashboard.setBotStatus('disconnected');
                
                if (shouldReconnect) {
                    console.log('\n🔄 Reconnecting in 5 seconds...\n');
                    setTimeout(() => {
                        this.startBot();
                    }, 5000);
                }
            }
        });
        
        // Save credentials whenever they update
        this.sock.ev.on('creds.update', saveCreds);
        
        // Handle incoming messages
        this.sock.ev.on('messages.upsert', async (m) => {
            const message = m.messages[0];
            if (!message.message || message.key.fromMe) return;
            
            try {
                await messageHandler.handleMessage(this.sock, message);
            } catch (error) {
                logger.error(`💥 Error handling message: ${error.message}`);
            }
        });
        
        // Handle group updates
        this.sock.ev.on('group-participants.update', async (update) => {
            logger.info(`👥 Group update: ${JSON.stringify(update)}`);
            
            // Send update to web dashboard
            this.webDashboard.sendLog(`👥 Group update: ${JSON.stringify(update)}`);
            
            // Auto welcome message
            if (update.action === 'add' && config.features.groupManagement) {
                try {
                    const welcomeMessage = `👋 Welcome @${update.participants[0].split('@')[0]} to the group!`;
                    await this.sendMessage(update.id, { 
                        text: welcomeMessage, 
                        mentions: update.participants 
                    });
                } catch (error) {
                    logger.error(`Failed to send welcome message: ${error.message}`);
                }
            }
        });
        
        // Handle presence updates for status monitoring
        this.sock.ev.on('presence.update', (update) => {
            if (config.features.statusMonitoring) {
                statusHandler.handlePresenceUpdate(update);
            }
        });
        
        // Forward logs to web dashboard
        const originalLog = logger.log;
        logger.log = (level, message) => {
            originalLog.call(logger, level, message);
            this.webDashboard.sendLog(`[${level.toUpperCase()}] ${message}`);
        };
    }

    async showWelcomeMessage() {
        try {
            console.log('\n══════════════════════════════════════════════════');
            console.log('🤖 WHATSAPP BOT IS NOW RUNNING');
            console.log('══════════════════════════════════════════════════');
            console.log(`📛 Bot Name: ${config.botName}`);
            console.log(`⚡ Prefix: ${config.prefix}`);
            console.log(`🖥️  Node.js: ${process.version}`);
            console.log(`📦 Platform: ${process.platform} ${process.arch}`);
            console.log(`💾 Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`);
            console.log(`⏰ Uptime: ${process.uptime().toFixed(2)}s`);
            
            // Features status
            console.log('\n⚙️  Features:');
            console.log(`• Status Monitoring: ${config.features.statusMonitoring ? '✅ Enabled' : '❌ Disabled'}`);
            console.log(`• Auto Reply: ${config.features.autoReply ? '✅ Enabled' : '❌ Disabled'}`);
            console.log(`• Group Management: ${config.features.groupManagement ? '✅ Enabled' : '❌ Disabled'}`);
            console.log(`• Broadcast: ${config.features.broadcast ? '✅ Enabled' : '❌ Disabled'}`);
            
            console.log('\n🌐 Web Dashboard:');
            console.log(`• URL: http://localhost:${process.env.PORT || 3000}`);
            console.log(`• Status: ✅ Running`);
            
            console.log('══════════════════════════════════════════════════\n');
            console.log('📝 Type "' + config.prefix + 'help" in any chat to see commands');
            console.log('🛑 Press Ctrl+C to stop the bot\n');
            
        } catch (error) {
            logger.error(`Error showing welcome: ${error.message}`);
        }
    }

    startStatsUpdates() {
        // Clear any existing interval
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
        }
        
        // Update stats every 5 seconds
        this.statsInterval = setInterval(() => {
            if (this.isReady) {
                this.updateDashboardStats();
            }
        }, 5000);
    }

    async updateDashboardStats() {
        try {
            let chatCount = 0;
            let groupCount = 0;
            
            // Try to get chat counts
            try {
                const chats = await this.sock.fetchBlocklist().catch(() => []);
                const groups = await this.sock.groupFetchAllParticipating().catch(() => ({}));
                
                chatCount = chats.length;
                groupCount = Object.keys(groups).length;
            } catch (error) {
                // Silently fail if can't get counts
            }
            
            const stats = {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                connected: this.isReady,
                chats: chatCount,
                groups: groupCount,
                commands: logger.commandCount || 0,
                errors: logger.errorCount || 0,
                autoReplies: logger.autoReplyCount || 0,
                timestamp: new Date().toISOString(),
                features: {
                    statusMonitoring: config.features.statusMonitoring,
                    autoReply: config.features.autoReply,
                    groupManagement: config.features.groupManagement,
                    broadcast: config.features.broadcast
                }
            };
            
            this.webDashboard.updateStats(stats);
        } catch (error) {
            logger.error(`Failed to update dashboard stats: ${error.message}`);
        }
    }

    // Send message helper
    async sendMessage(jid, content) {
        try {
            await this.sock.sendMessage(jid, content);
            logger.debug(`📤 Message sent to ${jid}`);
            return { success: true, jid: jid };
        } catch (error) {
            logger.error(`❌ Failed to send message to ${jid}: ${error.message}`);
            return { success: false, error: error.message, jid: jid };
        }
    }

    // Download media
    async downloadMediaMessage(message, filename = null) {
        try {
            if (!message.message) {
                return null;
            }
            
            const mimeMap = {
                'imageMessage': 'jpg',
                'videoMessage': 'mp4',
                'audioMessage': 'mp3',
                'documentMessage': 'pdf'
            };
            
            const messageType = getContentType(message.message);
            const ext = mimeMap[messageType] || 'bin';
            const finalFilename = filename || `${Date.now()}.${ext}`;
            const filePath = path.join(config.mediaPath, finalFilename);
            
            const buffer = await downloadMediaMessage(
                message,
                'buffer',
                {},
                { 
                    logger: Pino({ level: 'error' }),
                    reuploadRequest: this.sock.updateMediaMessage
                }
            );
            
            if (buffer) {
                await fs.writeFile(filePath, buffer);
                logger.info(`💾 Media downloaded: ${filePath}`);
                return filePath;
            }
            
            return null;
        } catch (error) {
            logger.error(`❌ Failed to download media: ${error.message}`);
            return null;
        }
    }

    // Handle command from web dashboard
    async handleWebCommand(command) {
        try {
            logger.info(`🖥️ Web command received: ${command}`);
            
            if (command.startsWith('broadcast ')) {
                const message = command.replace('broadcast ', '');
                await this.handleBroadcast(message);
            } else if (command === 'restart') {
                await this.shutdown();
                setTimeout(() => {
                    this.startBot();
                }, 3000);
            } else if (command.startsWith('statusmonitor ')) {
                const number = command.replace('statusmonitor ', '');
                await statusHandler.monitorContact(this.sock, number);
            } else if (command.startsWith('statusstop ')) {
                const number = command.replace('statusstop ', '');
                await statusHandler.stopMonitoringContact(number);
            }
            
        } catch (error) {
            logger.error(`Failed to execute web command: ${error.message}`);
        }
    }

    async handleBroadcast(message) {
        // Implement broadcast logic here
        logger.info(`📢 Broadcast requested: ${message}`);
        // You can implement actual broadcast logic
    }

    // Graceful shutdown
    async shutdown() {
        logger.info('🛑 Shutting down bot gracefully...');
        
        // Clear intervals
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
        }
        
        // Update web dashboard
        this.webDashboard.setBotStatus('shutting_down');
        
        // Disconnect socket
        if (this.sock) {
            await this.sock.end();
        }
        
        logger.info('✅ Bot shutdown complete');
    }
}

// Create and start bot
const bot = new WhatsAppBot();

// Handle process signals
process.on('SIGINT', async () => {
    console.log('\n\n🛑 Received SIGINT signal');
    await bot.shutdown();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n\n🛑 Received SIGTERM signal');
    await bot.shutdown();
    process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    logger.error(`💥 Uncaught Exception: ${error.message}`);
    console.error('\n⚠️  Uncaught exception:', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error(`💥 Unhandled Rejection at: ${promise}, reason: ${reason}`);
    console.error('\n⚠️  Unhandled rejection:', reason);
});

// Handle exit
process.on('exit', (code) => {
    logger.info(`Process exiting with code: ${code}`);
    console.log(`\n👋 Bot process exited with code: ${code}`);
});

// Export for web dashboard access
module.exports = { WhatsAppBot, bot };