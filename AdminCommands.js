const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const config = require('../config');
const fs = require('fs-extra');
const path = require('path');
const moment = require('moment');

module.exports = {
    // !broadcast command (admin only)
    async broadcast({ sock, jid, sender, args }) {
        try {
            if (!helpers.isAdmin(sender)) {
                await sock.sendMessage(jid, { text: '❌ This command is for admins only!' });
                return;
            }

            if (!config.features.broadcast) {
                await sock.sendMessage(jid, { text: '❌ Broadcast feature is disabled.' });
                return;
            }

            if (args.length === 0) {
                await sock.sendMessage(jid, { text: `Usage: ${config.prefix}broadcast <message>` });
                return;
            }

            const broadcastMessage = args.join(' ');
            
            // Get all chats
            const chats = await sock.fetchBlocklist().catch(() => []);
            
            if (chats.length === 0) {
                await sock.sendMessage(jid, { text: '❌ No contacts found to broadcast to.' });
                return;
            }

            await sock.sendMessage(jid, { 
                text: `📢 Starting broadcast to ${chats.length} contacts...\nMessage: ${broadcastMessage.substring(0, 50)}...` 
            });
            
            let success = 0;
            let failed = 0;
            let progress = 0;
            
            for (const chat of chats) {
                try {
                    await sock.sendMessage(chat, { text: broadcastMessage });
                    success++;
                    
                    // Update progress every 10 messages
                    progress++;
                    if (progress % 10 === 0) {
                        await sock.sendMessage(jid, { 
                            text: `📊 Broadcast progress: ${progress}/${chats.length}` 
                        });
                    }
                    
                    // Delay to avoid rate limiting
                    await helpers.sleep(1000);
                } catch (error) {
                    failed++;
                    logger.error(`Failed to send to ${chat}: ${error.message}`);
                }
            }
            
            const resultMessage = `
📊 *Broadcast Complete*

✅ Success: ${success}
❌ Failed: ${failed}
📨 Total: ${chats.length}

📝 Message sent: ${broadcastMessage.substring(0, 100)}...
⏰ Time: ${moment().format('LLLL')}
            `;
            
            await sock.sendMessage(jid, { text: resultMessage });
            logger.info(`✅ Broadcast sent to ${success}/${chats.length} contacts`);
        } catch (error) {
            logger.error(`Failed to execute broadcast: ${error.message}`);
            await sock.sendMessage(jid, { text: `❌ Broadcast failed: ${error.message}` });
        }
    },

    // !logs command
    async logs({ sock, jid, sender, args }) {
        try {
            if (!helpers.isAdmin(sender)) {
                await sock.sendMessage(jid, { text: '❌ This command is for admins only!' });
                return;
            }

            const lines = parseInt(args[0]) || 20;
            const logPath = path.join(__dirname, '..', config.logFile);
            
            if (!await fs.pathExists(logPath)) {
                await sock.sendMessage(jid, { text: '❌ Log file does not exist yet.' });
                return;
            }

            const logContent = await fs.readFile(logPath, 'utf8');
            const logLines = logContent.split('\n').filter(line => line.trim()).slice(-lines).join('\n');
            
            if (!logLines.trim()) {
                await sock.sendMessage(jid, { text: '📋 No logs available yet.' });
                return;
            }

            const logMessage = `📋 *Last ${lines} Log Entries*\n\n\`\`\`\n${logLines}\n\`\`\``;
            
            // Split if too long
            if (logMessage.length > 4000) {
                const chunks = [];
                let currentChunk = '';
                const linesArray = logLines.split('\n');
                
                for (const line of linesArray) {
                    if ((currentChunk + line + '\n').length > 4000) {
                        chunks.push(currentChunk);
                        currentChunk = line + '\n';
                    } else {
                        currentChunk += line + '\n';
                    }
                }
                
                if (currentChunk) chunks.push(currentChunk);
                
                await sock.sendMessage(jid, { text: `📋 *Last ${lines} Log Entries (Part 1/${chunks.length})*\n\n\`\`\`\n${chunks[0]}\n\`\`\`` });
                for (let i = 1; i < chunks.length; i++) {
                    await sock.sendMessage(jid, { text: `📋 *Part ${i + 1}/${chunks.length}*\n\n\`\`\`\n${chunks[i]}\n\`\`\`` });
                    await helpers.sleep(500);
                }
            } else {
                await sock.sendMessage(jid, { text: logMessage });
            }
            
            logger.info(`✅ Logs command executed by admin ${sender}`);
        } catch (error) {
            logger.error(`Failed to execute logs: ${error.message}`);
            await sock.sendMessage(jid, { text: `❌ Error reading logs: ${error.message}` });
        }
    },

    // !restart command
    async restart({ sock, jid, sender }) {
        try {
            if (!helpers.isAdmin(sender)) {
                await sock.sendMessage(jid, { text: '❌ This command is for admins only!' });
                return;
            }

            await sock.sendMessage(jid, { text: '🔄 Restarting bot in 3 seconds...' });
            logger.info(`🔄 Bot restart initiated by admin ${sender}`);
            
            setTimeout(() => {
                process.exit(0);
            }, 3000);
        } catch (error) {
            logger.error(`Failed to execute restart: ${error.message}`);
        }
    },

    // !stats command
    async stats({ sock, jid, sender }) {
        try {
            if (!helpers.isAdmin(sender)) {
                await sock.sendMessage(jid, { text: '❌ This command is for admins only!' });
                return;
            }

            // Get directory sizes
            const getDirSize = async (dirPath) => {
                try {
                    const files = await fs.readdir(dirPath);
                    let totalSize = 0;
                    
                    for (const file of files) {
                        const filePath = path.join(dirPath, file);
                        const stats = await fs.stat(filePath);
                        totalSize += stats.size;
                    }
                    
                    return helpers.formatBytes(totalSize);
                } catch (error) {
                    return '0 Bytes';
                }
            };
            
            const sessionSize = await getDirSize(config.sessionPath);
            const mediaSize = await getDirSize(config.mediaPath);
            const statusSize = await getDirSize(config.statusDataPath || './status-data');
            
            // Get bot stats
            const botStats = logger.getStats();
            
            const statsInfo = `
📈 *Bot Statistics - Admin Only*

*Storage Usage:*
• Sessions: ${sessionSize}
• Media: ${mediaSize}
• Status Data: ${statusSize}
• Logs: ${botStats.logSize}

*System Information:*
• Node.js: ${process.version}
• Platform: ${process.platform} ${process.arch}
• Uptime: ${moment.duration(process.uptime(), 'seconds').humanize()}
• Memory: ${helpers.formatBytes(process.memoryUsage().heapUsed)} / ${helpers.formatBytes(process.memoryUsage().heapTotal)}

*Bot Performance:*
• Commands Processed: ${botStats.commandCount}
• Auto Replies Sent: ${botStats.autoReplyCount}
• Errors Encountered: ${botStats.errorCount}
• Status Checks: ${botStats.statusChecks}

*Features Status:*
• Command Prefix: ${config.prefix}
• Auto Reply: ${config.features.autoReply ? '✅ Enabled' : '❌ Disabled'}
• Status Monitoring: ${config.features.statusMonitoring ? '✅ Enabled' : '❌ Disabled'}
• Group Management: ${config.features.groupManagement ? '✅ Enabled' : '❌ Disabled'}
• Broadcast: ${config.features.broadcast ? '✅ Enabled' : '❌ Disabled'}

*Session Information:*
• Session Path: ${config.sessionPath}
• Media Path: ${config.mediaPath}
• Status Data Path: ${config.statusDataPath || './status-data'}
• Log File: ${config.logFile}
            `;
            
            await sock.sendMessage(jid, { text: statsInfo });
            logger.info(`✅ Stats command executed by admin ${sender}`);
        } catch (error) {
            logger.error(`Failed to execute stats: ${error.message}`);
            await sock.sendMessage(jid, { text: `❌ Error getting stats: ${error.message}` });
        }
    }
};