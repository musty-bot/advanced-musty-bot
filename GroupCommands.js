const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const config = require('../config');
const moment = require('moment');

module.exports = {
    // !groupinfo command
    async groupinfo({ sock, jid, isGroup }) {
        try {
            if (!isGroup) {
                await sock.sendMessage(jid, { text: '❌ This command only works in groups!' });
                return;
            }

            // Get group metadata
            const groupMetadata = await sock.groupMetadata(jid).catch(() => null);
            if (!groupMetadata) {
                await sock.sendMessage(jid, { text: '❌ Failed to fetch group information.' });
                return;
            }

            const participants = groupMetadata.participants || [];
            const admins = participants.filter(p => p.admin).length;
            const creator = groupMetadata.owner || 'Unknown';
            const creationDate = groupMetadata.creation ? moment.unix(groupMetadata.creation).format('LLL') : 'Unknown';
            
            const groupInfo = `
👥 *Group Information: ${groupMetadata.subject}*

*Group ID:* ${jid}
*Description:* ${groupMetadata.desc || 'No description'}
*Created:* ${creationDate}
*Creator:* @${creator.split('@')[0]}
*Total Members:* ${participants.length}
*Admins:* ${admins}
*Restricted:* ${groupMetadata.restrict ? '✅ Yes' : '❌ No'}
*Announcement:* ${groupMetadata.announce ? '✅ Yes' : '❌ No'}

*Member Stats:*
• Online: Checking...
• Active: ${participants.length}
• New Today: 0

*Group Settings:*
• Messages: ${groupMetadata.restrict ? 'Admins only' : 'Everyone'}
• Group Changes: ${groupMetadata.announce ? 'Admins only' : 'Everyone'}
• Member Add: ${groupMetadata.memberAddMode || 'Everyone can add'}
            `;
            
            await sock.sendMessage(jid, { text: groupInfo });
            logger.info(`✅ Groupinfo command executed for ${jid}`);
        } catch (error) {
            logger.error(`Failed to execute groupinfo: ${error.message}`);
            await sock.sendMessage(jid, { text: `❌ Error: ${error.message}` });
        }
    },

    // !admins command
    async admins({ sock, jid, isGroup }) {
        try {
            if (!isGroup) {
                await sock.sendMessage(jid, { text: '❌ This command only works in groups!' });
                return;
            }

            const groupMetadata = await sock.groupMetadata(jid).catch(() => null);
            if (!groupMetadata) {
                await sock.sendMessage(jid, { text: '❌ Failed to fetch group information.' });
                return;
            }

            const admins = (groupMetadata.participants || []).filter(p => p.admin);
            
            if (admins.length === 0) {
                await sock.sendMessage(jid, { text: '👑 No admins found in this group!' });
                return;
            }

            let adminList = '👑 *Group Admins*\n\n';
            const mentions = [];
            
            admins.forEach((admin, index) => {
                const adminNumber = admin.id.split('@')[0];
                adminList += `${index + 1}. @${adminNumber}\n`;
                mentions.push(admin.id);
            });
            
            await sock.sendMessage(jid, { 
                text: adminList,
                mentions: mentions
            });
            
            logger.info(`✅ Admins command executed for ${jid}, found ${admins.length} admins`);
        } catch (error) {
            logger.error(`Failed to execute admins: ${error.message}`);
        }
    },

    // !link command
    async link({ sock, jid, isGroup, sender }) {
        try {
            if (!isGroup) {
                await sock.sendMessage(jid, { text: '❌ This command only works in groups!' });
                return;
            }

            // Check if user is admin
            const groupMetadata = await sock.groupMetadata(jid).catch(() => null);
            if (!groupMetadata) {
                await sock.sendMessage(jid, { text: '❌ Failed to fetch group information.' });
                return;
            }

            const isUserAdmin = groupMetadata.participants.some(p => 
                p.id === sender && p.admin
            );
            
            if (!isUserAdmin && !helpers.isAdmin(sender)) {
                await sock.sendMessage(jid, { text: '❌ Only admins can get group invite link!' });
                return;
            }

            const inviteCode = await sock.groupInviteCode(jid).catch(() => null);
            if (!inviteCode) {
                await sock.sendMessage(jid, { text: '❌ Failed to generate invite link.' });
                return;
            }

            const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
            
            await sock.sendMessage(jid, { 
                text: `🔗 *Group Invite Link*\n\n${inviteLink}\n\n⚠️ *Note:* This link expires in 7 days. Share responsibly!` 
            });
            
            logger.info(`✅ Group link generated for ${jid}`);
        } catch (error) {
            logger.error(`Failed to execute link: ${error.message}`);
            await sock.sendMessage(jid, { text: `❌ Error: ${error.message}` });
        }
    },

    // !tagall command
    async tagall({ sock, jid, isGroup, sender }) {
        try {
            if (!isGroup) {
                await sock.sendMessage(jid, { text: '❌ This command only works in groups!' });
                return;
            }

            // Check if user is admin
            const groupMetadata = await sock.groupMetadata(jid).catch(() => null);
            if (!groupMetadata) {
                await sock.sendMessage(jid, { text: '❌ Failed to fetch group information.' });
                return;
            }

            const isUserAdmin = groupMetadata.participants.some(p => 
                p.id === sender && p.admin
            );
            
            if (!isUserAdmin && !helpers.isAdmin(sender)) {
                await sock.sendMessage(jid, { text: '❌ Only admins can tag all members!' });
                return;
            }

            const participants = groupMetadata.participants || [];
            if (participants.length === 0) {
                await sock.sendMessage(jid, { text: '❌ No members found in this group.' });
                return;
            }

            await sock.sendMessage(jid, { text: `📢 Tagging all ${participants.length} members...` });
            
            let mentionText = '📢 *Attention All Members!*\n\n';
            const mentions = [];
            
            participants.forEach((participant, index) => {
                if (index < 50) { // Limit to avoid too large messages
                    mentionText += `@${participant.id.split('@')[0]} `;
                    mentions.push(participant.id);
                }
            });
            
            if (participants.length > 50) {
                mentionText += `\n\n...and ${participants.length - 50} more members`;
            }
            
            await sock.sendMessage(jid, { 
                text: mentionText,
                mentions: mentions
            });
            
            logger.info(`✅ Tagall command executed for ${jid}, tagged ${participants.length} members`);
        } catch (error) {
            logger.error(`Failed to execute tagall: ${error.message}`);
            await sock.sendMessage(jid, { text: `❌ Error: ${error.message}` });
        }
    },

    // !add command
    async add({ sock, jid, isGroup, sender, args }) {
        try {
            if (!isGroup) {
                await sock.sendMessage(jid, { text: '❌ This command only works in groups!' });
                return;
            }

            if (args.length === 0) {
                await sock.sendMessage(jid, { text: `Usage: ${config.prefix}add <phone number>` });
                return;
            }

            // Check if user is admin
            const groupMetadata = await sock.groupMetadata(jid).catch(() => null);
            if (!groupMetadata) {
                await sock.sendMessage(jid, { text: '❌ Failed to fetch group information.' });
                return;
            }

            const isUserAdmin = groupMetadata.participants.some(p => 
                p.id === sender && p.admin
            );
            
            if (!isUserAdmin && !helpers.isAdmin(sender)) {
                await sock.sendMessage(jid, { text: '❌ Only admins can add members!' });
                return;
            }

            const phoneNumber = helpers.formatNumber(args[0]);
            if (!phoneNumber) {
                await sock.sendMessage(jid, { text: '❌ Invalid phone number format.' });
                return;
            }

            await sock.groupParticipantsUpdate(jid, [phoneNumber], 'add');
            await sock.sendMessage(jid, { text: `✅ Added ${phoneNumber} to the group!` });
            
            logger.info(`✅ Added ${phoneNumber} to ${jid}`);
        } catch (error) {
            logger.error(`Failed to execute add: ${error.message}`);
            await sock.sendMessage(jid, { text: `❌ Failed to add user: ${error.message}` });
        }
    }
};