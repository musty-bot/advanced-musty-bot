const logger = require('../utils/logger');
const config = require('../config');
const moment = require('moment');
const fs = require('fs-extra');
const path = require('path');

// Status tracking data structure
const statusData = {
    lastChecked: null,
    statusUpdates: new Map(),
    monitoredContacts: new Set(),
    statusHistory: new Map(),
    notifications: [],
    initialized: false
};

class StatusHandler {
    constructor() {
        this.statusDataPath = config.statusDataPath || './status-data';
        this.monitoredContactsFile = path.join(this.statusDataPath, 'monitored-contacts.json');
        this.statusHistoryFile = path.join(this.statusDataPath, 'status-history.json');
        this.initializeStorage();
    }

    async initializeStorage() {
        try {
            await fs.ensureDir(this.statusDataPath);
            logger.info(`📁 Status data directory: ${this.statusDataPath}`);
        } catch (error) {
            logger.error(`Failed to create status data directory: ${error.message}`);
        }
    }

    async initializeStatusMonitor(sock) {
        if (!config.features.statusMonitoring) {
            logger.info('📊 Status monitoring is disabled in config');
            return;
        }
        
        try {
            // Load saved data
            await this.loadMonitoredContacts();
            await this.loadStatusHistory();
            
            // Start status checking interval
            this.startStatusPolling(sock);
            
            // Setup status event handlers
            this.setupStatusEvents(sock);
            
            statusData.initialized = true;
            logger.success('✅ Status monitoring initialized');
            logger.info(`📊 Monitoring ${statusData.monitoredContacts.size} contacts`);
        } catch (error) {
            logger.error(`❌ Failed to initialize status monitor: ${error.message}`);
        }
    }

    async loadMonitoredContacts() {
        try {
            if (await fs.pathExists(this.monitoredContactsFile)) {
                const data = await fs.readJson(this.monitoredContactsFile);
                data.forEach(jid => statusData.monitoredContacts.add(jid));
                logger.info(`📋 Loaded ${data.length} monitored contacts`);
            }
        } catch (error) {
            logger.warn(`Could not load monitored contacts: ${error.message}`);
        }
    }

    async saveMonitoredContacts() {
        try {
            const contactsArray = Array.from(statusData.monitoredContacts);
            await fs.writeJson(this.monitoredContactsFile, contactsArray, { spaces: 2 });
        } catch (error) {
            logger.error(`Failed to save monitored contacts: ${error.message}`);
        }
    }

    async loadStatusHistory() {
        try {
            if (await fs.pathExists(this.statusHistoryFile)) {
                const data = await fs.readJson(this.statusHistoryFile);
                Object.entries(data).forEach(([jid, history]) => {
                    statusData.statusHistory.set(jid, history);
                });
                logger.info(`📋 Loaded status history for ${Object.keys(data).length} contacts`);
            }
        } catch (error) {
            logger.warn(`Could not load status history: ${error.message}`);
        }
    }

    async saveStatusHistory() {
        try {
            const historyObj = {};
            statusData.statusHistory.forEach((history, jid) => {
                historyObj[jid] = history;
            });
            await fs.writeJson(this.statusHistoryFile, historyObj, { spaces: 2 });
        } catch (error) {
            logger.error(`Failed to save status history: ${error.message}`);
        }
    }

    startStatusPolling(sock) {
        // Poll for status updates at configured interval
        const interval = config.statusMonitoring.checkInterval;
        
        setInterval(async () => {
            if (!config.features.statusMonitoring) return;
            
            try {
                await this.checkAllStatuses(sock);
                logger.status('🔄 Periodic status check completed');
            } catch (error) {
                logger.error(`Periodic status check failed: ${error.message}`);
            }
        }, interval);
        
        logger.info(`⏰ Status polling started (every ${interval / 60000} minutes)`);
    }

    setupStatusEvents(sock) {
        // Listen for presence updates
        sock.ev.on('presence.update', async (update) => {
            this.handlePresenceUpdate(update);
        });
        
        logger.info('📡 Status event handlers set up');
    }

    handlePresenceUpdate(update) {
        if (!config.features.statusMonitoring) return;
        
        const { id, presences } = update;
        
        if (statusData.monitoredContacts.has(id)) {
            Object.entries(presences).forEach(([jid, presence]) => {
                if (presence.lastKnownPresence || presence.lastSeen) {
                    this.updateContactStatus(jid, {
                        lastSeen: presence.lastSeen ? presence.lastSeen * 1000 : Date.now(),
                        isOnline: presence.lastKnownPresence === 'available',
                        presence: presence.lastKnownPresence,
                        timestamp: Date.now()
                    });
                }
            });
        }
    }

    async monitorContact(sock, contactJid) {
        try {
            if (!contactJid) {
                throw new Error('Contact JID is required');
            }
            
            // Clean JID format
            const cleanJid = contactJid.includes('@') ? contactJid : `${contactJid}@s.whatsapp.net`;
            
            // Check if already at max limit
            if (statusData.monitoredContacts.size >= config.statusMonitoring.maxMonitoredContacts) {
                throw new Error(`Maximum monitoring limit reached (${config.statusMonitoring.maxMonitoredContacts})`);
            }
            
            // Add to monitored contacts
            statusData.monitoredContacts.add(cleanJid);
            
            // Save to file
            await this.saveMonitoredContacts();
            
            // Check status immediately
            const result = await this.checkContactStatus(sock, cleanJid);
            
            logger.info(`✅ Now monitoring status for: ${cleanJid}`);
            return {
                success: true,
                message: `Now monitoring status updates for ${cleanJid}`,
                contact: cleanJid,
                initialCheck: result
            };
        } catch (error) {
            logger.error(`❌ Failed to monitor contact: ${error.message}`);
            return {
                success: false,
                message: error.message
            };
        }
    }

    async stopMonitoringContact(contactJid) {
        try {
            const cleanJid = contactJid.includes('@') ? contactJid : `${contactJid}@s.whatsapp.net`;
            
            if (statusData.monitoredContacts.has(cleanJid)) {
                statusData.monitoredContacts.delete(cleanJid);
                await this.saveMonitoredContacts();
                logger.info(`✅ Stopped monitoring status for: ${cleanJid}`);
                return {
                    success: true,
                    message: `Stopped monitoring ${cleanJid}`
                };
            }
            
            return {
                success: false,
                message: `Contact ${cleanJid} was not being monitored`
            };
        } catch (error) {
            logger.error(`❌ Failed to stop monitoring: ${error.message}`);
            return {
                success: false,
                message: error.message
            };
        }
    }

    getMonitoredContacts() {
        return Array.from(statusData.monitoredContacts);
    }

    async checkContactStatus(sock, contactJid) {
        try {
            // Try to get presence info
            await sock.presenceSubscribe(contactJid).catch(() => {});
            
            // Try to get profile status
            let profileStatus = 'Unknown';
            try {
                const status = await sock.fetchStatus(contactJid);
                if (status.status) {
                    profileStatus = status.status;
                }
            } catch (error) {
                // Status might not be available
            }
            
            // Get last seen from chat
            let lastSeen = null;
            try {
                const chat = await sock.chatModify({ chat: { archive: false } }, contactJid, []);
                if (chat?.t) {
                    lastSeen = chat.t * 1000;
                }
            } catch (error) {
                // Chat might not exist
            }
            
            const statusUpdate = {
                contactJid,
                lastChecked: Date.now(),
                lastSeen,
                profileStatus,
                isOnline: false, // Will be updated via presence events
                timestamp: Date.now()
            };
            
            this.updateContactStatus(contactJid, statusUpdate);
            this.addToStatusHistory(contactJid, statusUpdate);
            
            logger.status(`✅ Status checked for ${contactJid}: ${profileStatus}`);
            
            return {
                success: true,
                ...statusUpdate
            };
        } catch (error) {
            logger.error(`❌ Failed to check status for ${contactJid}: ${error.message}`);
            
            return {
                success: false,
                contactJid,
                error: error.message,
                lastChecked: Date.now()
            };
        }
    }

    updateContactStatus(jid, data) {
        if (!statusData.statusUpdates.has(jid)) {
            statusData.statusUpdates.set(jid, {
                contact: jid,
                lastStatus: null,
                lastSeen: null,
                profileStatus: null,
                isOnline: false,
                checks: []
            });
        }
        
        const existingData = statusData.statusUpdates.get(jid);
        
        // Update fields
        if (data.lastSeen) {
            existingData.lastSeen = data.lastSeen;
        }
        
        if (data.profileStatus) {
            existingData.profileStatus = data.profileStatus;
        }
        
        if (data.isOnline !== undefined) {
            existingData.isOnline = data.isOnline;
        }
        
        // Add check record
        existingData.checks.push({
            timestamp: data.timestamp || Date.now(),
            lastSeen: data.lastSeen,
            profileStatus: data.profileStatus,
            isOnline: data.isOnline || false
        });
        
        // Keep only last 50 checks
        if (existingData.checks.length > 50) {
            existingData.checks = existingData.checks.slice(-50);
        }
        
        // Update in map
        statusData.statusUpdates.set(jid, existingData);
        
        // Check for status changes and notify
        this.checkForStatusChange(jid, existingData);
    }

    addToStatusHistory(jid, data) {
        if (!statusData.statusHistory.has(jid)) {
            statusData.statusHistory.set(jid, []);
        }
        
        const history = statusData.statusHistory.get(jid);
        history.push({
            timestamp: data.timestamp || Date.now(),
            lastSeen: data.lastSeen,
            profileStatus: data.profileStatus,
            isOnline: data.isOnline || false
        });
        
        // Keep only last 7 days of history
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const filteredHistory = history.filter(entry => entry.timestamp > sevenDaysAgo);
        statusData.statusHistory.set(jid, filteredHistory);
        
        // Save periodically
        if (history.length % 10 === 0) {
            this.saveStatusHistory();
        }
    }

    checkForStatusChange(jid, data) {
        // Implement logic to detect status changes
        // and send notifications if needed
        // This is a placeholder for actual status change detection
    }

    async checkAllStatuses(sock) {
        try {
            const results = [];
            const monitoredContacts = this.getMonitoredContacts();
            
            for (const contactJid of monitoredContacts) {
                const result = await this.checkContactStatus(sock, contactJid);
                results.push(result);
                // Delay between checks to avoid rate limiting
                await require('../utils/helpers').sleep(1000);
            }
            
            statusData.lastChecked = Date.now();
            logger.status(`✅ Checked status for ${results.length} contacts`);
            
            return {
                success: true,
                checkedAt: statusData.lastChecked,
                results: results
            };
        } catch (error) {
            logger.error(`❌ Failed to check all statuses: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    getStatusHistory(contactJid) {
        const cleanJid = contactJid.includes('@') ? contactJid : `${contactJid}@s.whatsapp.net`;
        
        if (statusData.statusHistory.has(cleanJid)) {
            return statusData.statusHistory.get(cleanJid);
        }
        
        return [];
    }

    getStatusStats() {
        const totalMonitored = statusData.monitoredContacts.size;
        const statusUpdatesCount = statusData.statusUpdates.size;
        const lastCheck = statusData.lastChecked;
        
        // Calculate active statuses (within last 24 hours)
        let activeStatuses = 0;
        const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
        
        for (const [jid, data] of statusData.statusUpdates) {
            if (data.lastSeen && data.lastSeen > twentyFourHoursAgo) {
                activeStatuses++;
            }
        }
        
        return {
            totalMonitored,
            statusUpdatesCount,
            activeStatuses,
            lastCheck: lastCheck ? moment(lastCheck).format('LLLL') : 'Never',
            monitoringEnabled: config.features.statusMonitoring,
            initialized: statusData.initialized,
            dataPath: this.statusDataPath
        };
    }

    async exportStatusData() {
        try {
            const exportPath = path.join(this.statusDataPath, `status-export-${Date.now()}.json`);
            
            const exportData = {
                exportedAt: new Date().toISOString(),
                monitoredContacts: Array.from(statusData.monitoredContacts),
                statusUpdates: Array.from(statusData.statusUpdates.entries()).map(([jid, data]) => ({
                    jid,
                    ...data,
                    lastSeen: data.lastSeen ? new Date(data.lastSeen).toISOString() : null
                })),
                stats: this.getStatusStats()
            };
            
            await fs.writeJson(exportPath, exportData, { spaces: 2 });
            logger.info(`✅ Status data exported to: ${exportPath}`);
            
            return {
                success: true,
                path: exportPath,
                data: exportData
            };
        } catch (error) {
            logger.error(`❌ Failed to export status data: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Status commands for message handler
    statusCommands = {
        async statusmonitor({ sock, jid, args, sender }) {
            const helpers = require('../utils/helpers');
            
            if (!helpers.isAdmin(sender)) {
                await sock.sendMessage(jid, { text: '❌ This command is for admins only!' });
                return;
            }
            
            if (args.length === 0) {
                await sock.sendMessage(jid, { 
                    text: `Usage: ${config.prefix}statusmonitor <phone number>\nExample: ${config.prefix}statusmonitor 919876543210` 
                });
                return;
            }
            
            const result = await this.monitorContact(sock, args[0]);
            
            if (result.success) {
                await sock.sendMessage(jid, { 
                    text: `✅ Now monitoring status for: ${result.contact}\nI'll track their status updates and last seen times.` 
                });
            } else {
                await sock.sendMessage(jid, { 
                    text: `❌ Failed to monitor contact: ${result.message}` 
                });
            }
        },

        async statusstop({ sock, jid, args, sender }) {
            const helpers = require('../utils/helpers');
            
            if (!helpers.isAdmin(sender)) {
                await sock.sendMessage(jid, { text: '❌ This command is for admins only!' });
                return;
            }
            
            if (args.length === 0) {
                await sock.sendMessage(jid, { 
                    text: `Usage: ${config.prefix}statusstop <phone number>\nExample: ${config.prefix}statusstop 919876543210` 
                });
                return;
            }
            
            const result = await this.stopMonitoringContact(args[0]);
            
            if (result.success) {
                await sock.sendMessage(jid, { 
                    text: `✅ ${result.message}` 
                });
            } else {
                await sock.sendMessage(jid, { 
                    text: `❌ ${result.message}` 
                });
            }
        },

        async statuslist({ sock, jid, sender }) {
            const helpers = require('../utils/helpers');
            const moment = require('moment');
            
            if (!helpers.isAdmin(sender)) {
                await sock.sendMessage(jid, { text: '❌ This command is for admins only!' });
                return;
            }
            
            const contacts = this.getMonitoredContacts();
            
            if (contacts.length === 0) {
                await sock.sendMessage(jid, { 
                    text: '📋 No contacts are being monitored for status updates.' 
                });
                return;
            }
            
            let contactList = '📋 *Monitored Contacts for Status Updates*\n\n';
            
            contacts.forEach((contact, index) => {
                const contactData = statusData.statusUpdates.get(contact) || {};
                const lastSeen = contactData.lastSeen ? moment(contactData.lastSeen).fromNow() : 'Never';
                const isOnline = contactData.isOnline ? '🟢 Online' : '⚫ Offline';
                
                contactList += `${index + 1}. ${contact}\n   👁️ ${isOnline} | Last seen: ${lastSeen}\n\n`;
            });
            
            contactList += `\nTotal: ${contacts.length} contact(s) | Use ${config.prefix}statuscheck to update`;
            
            await sock.sendMessage(jid, { text: contactList });
        },

        async statuscheck({ sock, jid, args, sender }) {
            const helpers = require('../utils/helpers');
            const moment = require('moment');
            
            if (!helpers.isAdmin(sender)) {
                await sock.sendMessage(jid, { text: '❌ This command is for admins only!' });
                return;
            }
            
            if (args.length === 0) {
                // Check all if no specific contact
                await sock.sendMessage(jid, { 
                    text: '🔄 Checking status for all monitored contacts... This may take a moment.' 
                });
                
                const result = await this.checkAllStatuses(sock);
                
                if (result.success) {
                    const stats = this.getStatusStats();
                    
                    const statusReport = `
📊 *Status Check Report*

✅ Checked ${result.results.length} contacts
🕐 Last check: ${stats.lastCheck}
👁️ Active contacts: ${stats.activeStatuses}
📋 Total monitored: ${stats.totalMonitored}

*Recent Status Updates:*
${result.results.slice(-5).map(r => 
    `• ${r.contactJid}: ${r.success ? '✅ Success' : '❌ Failed'}`
).join('\n')}
                    `;
                    
                    await sock.sendMessage(jid, { text: statusReport });
                } else {
                    await sock.sendMessage(jid, { 
                        text: `❌ Failed to check statuses: ${result.error}` 
                    });
                }
                return;
            }
            
            // Check specific contact
            const result = await this.checkContactStatus(sock, args[0]);
            
            if (result.success) {
                const lastSeen = result.lastSeen ? moment(result.lastSeen).format('LLLL') : 'Unknown';
                const statusInfo = `
👤 *Status Information for ${result.contactJid}*

✅ Status check completed
👁️ Last seen: ${lastSeen}
📝 Profile status: ${result.profileStatus || 'Not set'}
🟢 Online status: ${result.isOnline ? 'Online' : 'Offline'}
📊 Monitored: ${statusData.monitoredContacts.has(result.contactJid) ? '✅ Yes' : '❌ No'}

*Details:*
• Check time: ${moment(result.lastChecked).format('HH:mm:ss')}
• Check successful: ✅ Yes
• JID: ${result.contactJid}
                `;
                
                await sock.sendMessage(jid, { text: statusInfo });
            } else {
                await sock.sendMessage(jid, { 
                    text: `❌ Failed to check status for ${args[0]}: ${result.error}` 
                });
            }
        },

        async statusstats({ sock, jid, sender }) {
            const helpers = require('../utils/helpers');
            const moment = require('moment');
            
            if (!helpers.isAdmin(sender)) {
                await sock.sendMessage(jid, { text: '❌ This command is for admins only!' });
                return;
            }
            
            const stats = this.getStatusStats();
            const history = Array.from(statusData.statusHistory.values()).flat();
            
            const statsInfo = `
📈 *Status Monitoring Statistics*

📊 *Monitoring Status:*
• Enabled: ${stats.monitoringEnabled ? '✅ Yes' : '❌ No'}
• Initialized: ${stats.initialized ? '✅ Yes' : '❌ No'}
• Total monitored: ${stats.totalMonitored}
• Active contacts (24h): ${stats.activeStatuses}
• Total status updates: ${stats.statusUpdatesCount}

🕐 *Timing:*
• Last check: ${stats.lastCheck}
• Next check: ${moment().add(config.statusMonitoring.checkInterval / 60000, 'minutes').format('LT')}
• History entries: ${history.length}

📁 *Data Storage:*
• Data path: ${stats.dataPath}
• Contacts file: ${this.monitoredContactsFile}
• History file: ${this.statusHistoryFile}

💡 *Commands:*
• ${config.prefix}statusmonitor <number> - Add contact
• ${config.prefix}statuslist - View all monitored
• ${config.prefix}statuscheck - Force status check
• ${config.prefix}statusexport - Export all data
            `;
        
            await sock.sendMessage(jid, { text: statsInfo });
        },

        async statusexport({ sock, jid, sender }) {
            const helpers = require('../utils/helpers');
            
            if (!helpers.isAdmin(sender)) {
                await sock.sendMessage(jid, { text: '❌ This command is for admins only!' });
                return;
            }
            
            await sock.sendMessage(jid, { 
                text: '📤 Exporting status data... This may take a moment.' 
            });
            
            const result = await this.exportStatusData();
            
            if (result.success) {
                await sock.sendMessage(jid, { 
                    text: `✅ Status data exported successfully!\n📁 File: ${result.path}\n📊 Records: ${result.data.monitoredContacts.length} contacts\n⏰ Exported: ${moment().format('LLLL')}` 
                });
            } else {
                await sock.sendMessage(jid, { 
                    text: `❌ Failed to export status data: ${result.error}` 
                });
            }
        }
    };
}

module.exports = new StatusHandler();