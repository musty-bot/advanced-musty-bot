const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const config = require('../config');
const moment = require('moment');
const os = require('os');
const fs = require('fs-extra');
const path = require('path');

module.exports = {
    // !ping command
    async ping({ sock, jid, message }) {
        try {
            const start = Date.now();
            await sock.sendMessage(jid, { text: '🏓 Pong!' });
            const latency = Date.now() - start;
            await sock.sendMessage(jid, { text: `🏓 Pong! Latency: ${latency}ms\n📱 Bot is alive and working!` });
            logger.info(`✅ Ping command executed by ${jid}, latency: ${latency}ms`);
        } catch (error) {
            logger.error(`Failed to execute ping: ${error.message}`);
        }
    },

    // !help command
    async help({ sock, jid }) {
        try {
            const helpText = helpers.getHelpText();
            await sock.sendMessage(jid, { text: helpText });
            logger.info(`✅ Help command executed by ${jid}`);
        } catch (error) {
            logger.error(`Failed to execute help: ${error.message}`);
            await sock.sendMessage(jid, { text: '❌ Failed to send help message.' });
        }
    },

    // !info command
    async info({ sock, jid }) {
        try {
            const systemInfo = {
                nodeVersion: process.version,
                platform: os.platform(),
                arch: os.arch(),
                cpus: os.cpus().length,
                totalMem: helpers.formatBytes(os.totalmem()),
                freeMem: helpers.formatBytes(os.freemem()),
                uptime: moment.duration(process.uptime(), 'seconds').humanize(),
                botName: config.botName,
                prefix: config.prefix,
                sessionPath: config.sessionPath,
                mediaPath: config.mediaPath,
                statusDataPath: config.statusDataPath || './status-data'
            };
            
            const botInfo = `
🤖 *${config.botName} - Bot Information*

*System Information:*
• Node.js: ${systemInfo.nodeVersion}
• Platform: ${systemInfo.platform} ${systemInfo.arch}
• CPU Cores: ${systemInfo.cpus}
• Total Memory: ${systemInfo.totalMem}
• Free Memory: ${systemInfo.freeMem}
• System Uptime: ${systemInfo.uptime}

*Bot Configuration:*
• Command Prefix: ${systemInfo.prefix}
• Session Path: ${systemInfo.sessionPath}
• Media Path: ${systemInfo.mediaPath}
• Status Data Path: ${systemInfo.statusDataPath}

*Features:*
• Auto Reply: ${config.features.autoReply ? '✅ Enabled' : '❌ Disabled'}
• Group Management: ${config.features.groupManagement ? '✅ Enabled' : '❌ Disabled'}
• Status Monitoring: ${config.features.statusMonitoring ? '✅ Enabled' : '❌ Disabled'}
• Broadcast: ${config.features.broadcast ? '✅ Enabled' : '❌ Disabled'}

*Bot Uptime:* ${moment.duration(process.uptime(), 'seconds').humanize()}
*Memory Usage:* ${helpers.formatBytes(process.memoryUsage().heapUsed)}

Made with ❤️ using Baileys WhatsApp API
            `;
            
            await sock.sendMessage(jid, { text: botInfo });
            logger.info(`✅ Info command executed by ${jid}`);
        } catch (error) {
            logger.error(`Failed to execute info: ${error.message}`);
        }
    },

    // !time command
    async time({ sock, jid }) {
        try {
            const now = moment();
            const timeInfo = `
⏰ *Current Time Information*

*Local Time:* ${now.format('LLLL')}
*UTC Time:* ${now.utc().format('LLLL')}
*Unix Timestamp:* ${now.unix()}
*Timezone:* ${Intl.DateTimeFormat().resolvedOptions().timeZone}

*Useful Formats:*
• ISO: ${now.toISOString()}
• Date Only: ${now.format('YYYY-MM-DD')}
• Time Only: ${now.format('HH:mm:ss')}

*Date Calculations:*
• Tomorrow: ${now.add(1, 'days').format('LLLL')}
• Next Week: ${now.add(1, 'week').format('LLLL')}
            `;
            
            await sock.sendMessage(jid, { text: timeInfo });
            logger.info(`✅ Time command executed by ${jid}`);
        } catch (error) {
            logger.error(`Failed to execute time: ${error.message}`);
        }
    },

    // !status command (admin only) - Bot status
    async status({ sock, jid, sender }) {
        try {
            if (!helpers.isAdmin(sender)) {
                await sock.sendMessage(jid, { text: '❌ This command is for admins only!' });
                return;
            }

            // Get session files
            const sessionFiles = await fs.readdir(config.sessionPath).catch(() => []);
            const mediaFiles = await fs.readdir(config.mediaPath).catch(() => []);
            
            // Get bot stats
            const botStats = logger.getStats();
            
            const statusInfo = `
📊 *Bot Status Report - Admin Only*

*Connection Status:* ✅ Connected
*Bot Uptime:* ${moment.duration(process.uptime(), 'seconds').humanize()}
*Session Files:* ${sessionFiles.length} files
*Media Files:* ${mediaFiles.length} files
*Log File Size:* ${botStats.logSize}

*Statistics:*
• Commands Processed: ${botStats.commandCount}
• Auto Replies Sent: ${botStats.autoReplyCount}
• Errors Encountered: ${botStats.errorCount}
• Status Checks: ${botStats.statusChecks}

*System Resources:*
• CPU Usage: ${(process.cpuUsage().user / 1000000).toFixed(2)}%
• Memory Usage: ${helpers.formatBytes(process.memoryUsage().heapUsed)}
• Memory Total: ${helpers.formatBytes(process.memoryUsage().heapTotal)}
• RSS: ${helpers.formatBytes(process.memoryUsage().rss)}

*Features Status:*
• Auto Reply: ${config.features.autoReply ? '✅ Enabled' : '❌ Disabled'}
• Status Monitoring: ${config.features.statusMonitoring ? '✅ Enabled' : '❌ Disabled'}
• Group Management: ${config.features.groupManagement ? '✅ Enabled' : '❌ Disabled'}
• Broadcast: ${config.features.broadcast ? '✅ Enabled' : '❌ Disabled'}

*Recent Activity:*
• Last Restart: ${moment().subtract(process.uptime(), 'seconds').fromNow()}
• Log Level: ${config.logLevel}
            `;
            
            await sock.sendMessage(jid, { text: statusInfo });
            logger.info(`✅ Status command executed by admin ${sender}`);
        } catch (error) {
            logger.error(`Failed to execute status: ${error.message}`);
            await sock.sendMessage(jid, { text: `❌ Error getting status: ${error.message}` });
        }
    }
};