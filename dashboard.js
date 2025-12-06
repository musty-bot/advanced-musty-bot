class Dashboard {
    constructor() {
        this.socket = null;
        this.qrCode = null;
        this.botStatus = 'disconnected';
        this.monitoredContacts = [];
        this.isLogsPaused = false;
        this.logsBuffer = [];
        this.commandHistory = [];
        this.currentCommand = '';
        this.isAuthenticated = false;
        this.terminalOutput = [];
        this.init();
    }

    init() {
        this.connectSocket();
        this.setupEventListeners();
        this.updateTime();
        this.setupTerminal();
        setInterval(() => this.updateTime(), 1000);
        setInterval(() => this.updateUptime(), 1000);
        this.checkAuth();
    }

    connectSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        this.socket = io(`${protocol}//${host}`, {
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });
        
        this.socket.on('connect', () => {
            console.log('✅ Connected to bot server');
            this.addLog('Connected to bot server', 'success');
            this.updateStatus('connected', 'Connected to bot server');
            this.requestStatusUpdate();
        });

        this.socket.on('disconnect', () => {
            console.log('❌ Disconnected from bot server');
            this.addLog('Disconnected from server', 'error');
            this.updateStatus('disconnected', 'Disconnected from server');
        });

        this.socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            this.addLog(`Connection error: ${error.message}`, 'error');
        });

        // Bot status updates
        this.socket.on('status', (data) => {
            this.botStatus = data.status;
            this.qrCode = data.qrCode;
            this.updateUI(data);
        });

        // QR code updates
        this.socket.on('qr', (data) => {
            this.qrCode = data.qrCode;
            this.generateQRCode();
            this.updateStatus('qr_pending', 'Scan QR code to connect');
            this.addLog('New QR code generated. Scan with WhatsApp.', 'info');
        });

        this.socket.on('qrImage', (data) => {
            document.getElementById('qrCode').innerHTML = 
                `<img src="${data.qrImage}" alt="QR Code" style="max-width: 200px;">`;
        });

        // Stats updates
        this.socket.on('stats', (stats) => {
            this.updateStats(stats);
        });

        // Log updates
        this.socket.on('log', (log) => {
            this.addLog(log.message, log.level);
        });

        // Bot command responses
        this.socket.on('command-response', (response) => {
            this.handleCommandResponse(response);
        });

        // Terminal output
        this.socket.on('terminal-output', (data) => {
            this.addTerminalOutput(data.output, data.type || 'info');
        });

        // Status monitoring updates
        this.socket.on('status-update', (update) => {
            this.handleStatusUpdate(update);
        });

        // Chat updates
        this.socket.on('chat-update', (chat) => {
            this.handleChatUpdate(chat);
        });

        // Group updates
        this.socket.on('group-update', (group) => {
            this.handleGroupUpdate(group);
        });

        // Message updates
        this.socket.on('message-update', (message) => {
            this.handleMessageUpdate(message);
        });

        // Error notifications
        this.socket.on('error', (error) => {
            this.showError(error.message || 'An error occurred');
        });

        // Authentication response
        this.socket.on('auth-response', (response) => {
            this.handleAuthResponse(response);
        });

        // Broadcast results
        this.socket.on('broadcast-result', (result) => {
            this.handleBroadcastResult(result);
        });

        // Bot state changes
        this.socket.on('state-change', (state) => {
            this.handleStateChange(state);
        });
    }

    requestStatusUpdate() {
        if (this.socket.connected) {
            this.socket.emit('get-status');
        }
    }

    updateUI(data) {
        // Update status indicator
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        
        statusDot.className = 'status-dot';
        switch(data.status) {
            case 'connected':
                statusDot.classList.add('connected');
                statusText.textContent = 'Connected';
                document.getElementById('connectionStatus').textContent = 'Connected';
                document.getElementById('connectionStatus').style.color = '#4CAF50';
                break;
            case 'qr_pending':
                statusDot.classList.add('qr-pending');
                statusText.textContent = 'Waiting for QR Scan';
                document.getElementById('connectionStatus').textContent = 'QR Pending';
                document.getElementById('connectionStatus').style.color = '#FF9800';
                break;
            case 'disconnected':
                statusDot.classList.add('disconnected');
                statusText.textContent = 'Disconnected';
                document.getElementById('connectionStatus').textContent = 'Disconnected';
                document.getElementById('connectionStatus').style.color = '#f44336';
                break;
            case 'starting':
                statusDot.classList.add('qr-pending');
                statusText.textContent = 'Starting...';
                document.getElementById('connectionStatus').textContent = 'Starting';
                document.getElementById('connectionStatus').style.color = '#FF9800';
                break;
            case 'error':
                statusDot.classList.add('disconnected');
                statusText.textContent = 'Error';
                document.getElementById('connectionStatus').textContent = 'Error';
                document.getElementById('connectionStatus').style.color = '#f44336';
                break;
        }
    }

    generateQRCode() {
        const qrContainer = document.getElementById('qrCode');
        qrContainer.innerHTML = '';
        
        if (this.qrCode) {
            try {
                new QRCode(qrContainer, {
                    text: this.qrCode,
                    width: 200,
                    height: 200,
                    colorDark: "#000000",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.H
                });
            } catch (error) {
                console.error('Failed to generate QR code:', error);
                qrContainer.innerHTML = `<p class="error">Failed to generate QR code</p>`;
            }
        }
    }

    updateStatus(status, message) {
        this.botStatus = status;
        this.updateUI({ status });
        
        if (message) {
            this.showNotification(message, status === 'error' ? 'error' : 'info');
        }
    }

    updateStats(stats) {
        // Update uptime
        if (stats.uptime) {
            this.uptime = stats.uptime;
            document.getElementById('uptime').textContent = this.formatUptime(stats.uptime);
        }

        // Update memory
        if (stats.memory) {
            const memoryMB = (stats.memory.heapUsed / 1024 / 1024).toFixed(2);
            document.getElementById('memoryUsage').textContent = `${memoryMB} MB`;
        }

        // Update chat counts
        if (stats.chats !== undefined) {
            document.getElementById('chatCount').textContent = stats.chats;
        }
        if (stats.groups !== undefined) {
            document.getElementById('groupCount').textContent = stats.groups;
        }

        // Update command counts
        if (stats.commands !== undefined) {
            document.getElementById('commandCount').textContent = stats.commands;
        }
        if (stats.errors !== undefined) {
            document.getElementById('errorCount').textContent = stats.errors;
        }

        // Update last update time
        document.getElementById('lastUpdate').textContent = 
            `Last updated: ${new Date().toLocaleTimeString()}`;
    }

    formatUptime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    updateTime() {
        const now = new Date();
        document.getElementById('currentTime').textContent = 
            now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        document.getElementById('currentDate').textContent = 
            now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }

    updateUptime() {
        if (this.uptime) {
            this.uptime++;
            document.getElementById('uptime').textContent = this.formatUptime(this.uptime);
        }
    }

    addLog(message, level = 'info') {
        if (this.isLogsPaused) {
            this.logsBuffer.push({ message, level });
            return;
        }

        const logContainer = document.getElementById('logContainer');
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        
        const time = new Date().toLocaleTimeString();
        
        logEntry.innerHTML = `
            <span class="log-time">[${time}]</span>
            <span class="log-level ${level}">[${level.toUpperCase()}]</span>
            <span class="log-message">${this.escapeHtml(message)}</span>
        `;
        
        logContainer.appendChild(logEntry);
        logContainer.scrollTop = logContainer.scrollHeight;
        
        // Keep only last 100 logs
        const logs = logContainer.querySelectorAll('.log-entry');
        if (logs.length > 100) {
            logs[0].remove();
        }
    }

    addTerminalOutput(output, type = 'info') {
        const terminal = document.getElementById('terminalOutput');
        const entry = document.createElement('div');
        entry.className = `terminal-entry ${type}`;
        
        const time = new Date().toLocaleTimeString();
        entry.innerHTML = `<span class="terminal-time">[${time}]</span> ${this.escapeHtml(output)}`;
        
        terminal.appendChild(entry);
        terminal.scrollTop = terminal.scrollHeight;
        
        // Keep only last 50 entries
        const entries = terminal.querySelectorAll('.terminal-entry');
        if (entries.length > 50) {
            entries[0].remove();
        }
    }

    setupTerminal() {
        const terminalInput = document.getElementById('terminalInput');
        if (terminalInput) {
            terminalInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const command = terminalInput.value.trim();
                    if (command) {
                        this.executeTerminalCommand(command);
                        terminalInput.value = '';
                    }
                }
            });
        }
    }

    executeTerminalCommand(command) {
        this.addTerminalOutput(`$ ${command}`, 'command');
        this.commandHistory.push(command);
        this.currentCommand = '';
        
        // Handle local commands
        if (command === 'clear') {
            document.getElementById('terminalOutput').innerHTML = '';
            return;
        }
        
        if (command === 'help') {
            this.addTerminalOutput('Available commands:', 'info');
            this.addTerminalOutput('- status: Get bot status', 'info');
            this.addTerminalOutput('- restart: Restart bot', 'info');
            this.addTerminalOutput('- logs [n]: Get last n logs', 'info');
            this.addTerminalOutput('- broadcast <message>: Send broadcast', 'info');
            this.addTerminalOutput('- clear: Clear terminal', 'info');
            return;
        }
        
        // Send command to bot
        this.sendCommand(command);
    }

    sendCommand(command) {
        if (!this.socket.connected) {
            this.addTerminalOutput('Error: Not connected to bot', 'error');
            return;
        }
        
        this.socket.emit('command', { 
            command: command,
            timestamp: new Date().toISOString()
        });
        
        this.addTerminalOutput(`Command sent: ${command}`, 'info');
    }

    handleCommandResponse(response) {
        if (response.success) {
            this.addTerminalOutput(`✅ ${response.message || 'Command executed successfully'}`, 'success');
            if (response.data) {
                this.addTerminalOutput(JSON.stringify(response.data, null, 2), 'data');
            }
        } else {
            this.addTerminalOutput(`❌ ${response.error || 'Command failed'}`, 'error');
        }
    }

    handleStatusUpdate(update) {
        if (update.type === 'contact') {
            this.updateMonitoredContact(update.data);
        } else if (update.type === 'stats') {
            this.updateStatusStats(update.data);
        }
    }

    updateMonitoredContact(contact) {
        const list = document.getElementById('monitoredList');
        const existing = Array.from(list.querySelectorAll('.monitored-item'))
            .find(item => item.dataset.jid === contact.jid);
        
        if (existing) {
            existing.innerHTML = this.getMonitoredContactHTML(contact);
        } else {
            const item = document.createElement('div');
            item.className = 'monitored-item';
            item.dataset.jid = contact.jid;
            item.innerHTML = this.getMonitoredContactHTML(contact);
            list.appendChild(item);
            
            // Add remove button handler
            const removeBtn = item.querySelector('.remove-btn');
            if (removeBtn) {
                removeBtn.addEventListener('click', () => {
                    this.removeMonitoredContact(contact.jid);
                });
            }
        }
    }

    getMonitoredContactHTML(contact) {
        const lastSeen = contact.lastSeen ? 
            new Date(contact.lastSeen).toLocaleString() : 'Never';
        const status = contact.isOnline ? '🟢 Online' : '⚫ Offline';
        
        return `
            <div class="contact-info">
                <strong>${contact.jid}</strong>
                <div class="contact-details">
                    <span>${status}</span>
                    <span>Last seen: ${lastSeen}</span>
                </div>
            </div>
            <button class="remove-btn" data-jid="${contact.jid}">
                <i class="fas fa-times"></i>
            </button>
        `;
    }

    removeMonitoredContact(jid) {
        this.sendCommand(`statusstop ${jid}`);
        const item = document.querySelector(`.monitored-item[data-jid="${jid}"]`);
        if (item) {
            item.remove();
        }
        this.showNotification(`Removed ${jid} from monitoring`, 'success');
    }

    setupEventListeners() {
        // Refresh QR button
        document.getElementById('refreshQr').addEventListener('click', () => {
            this.socket.emit('command', { command: 'refresh_qr' });
            this.showNotification('Requested QR code refresh', 'info');
        });

        // Restart bot button
        document.getElementById('restartBot').addEventListener('click', () => {
            this.showRestartModal();
        });

        // Check status button
        document.getElementById('checkStatus').addEventListener('click', () => {
            this.sendCommand('status');
            this.showNotification('Requested status check', 'info');
        });

        // View logs button
        document.getElementById('viewLogs').addEventListener('click', () => {
            this.showLogsModal();
        });

        // Open terminal button
        document.getElementById('openTerminal').addEventListener('click', () => {
            this.showTerminalModal();
        });

        // Add monitor button
        document.getElementById('addMonitor').addEventListener('click', () => {
            this.addMonitoredContact();
        });

        // Enter key in monitor input
        document.getElementById('monitorNumber').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addMonitoredContact();
            }
        });

        // Toggle logs button
        document.getElementById('toggleLogs').addEventListener('click', (e) => {
            this.isLogsPaused = !this.isLogsPaused;
            const button = e.target.closest('button');
            button.innerHTML = this.isLogsPaused ? 
                '<i class="fas fa-play"></i> Resume' : 
                '<i class="fas fa-pause"></i> Pause';
            
            if (!this.isLogsPaused && this.logsBuffer.length > 0) {
                this.logsBuffer.forEach(log => this.addLog(log.message, log.level));
                this.logsBuffer = [];
            }
            
            this.showNotification(this.isLogsPaused ? 'Logs paused' : 'Logs resumed', 'info');
        });

        // Clear logs button
        document.getElementById('clearLogs').addEventListener('click', () => {
            document.getElementById('logContainer').innerHTML = '';
            this.showNotification('Logs cleared', 'info');
        });

        // Modal controls
        document.getElementById('confirmRestart').addEventListener('click', () => {
            this.restartBot();
        });

        document.getElementById('cancelRestart').addEventListener('click', () => {
            this.hideRestartModal();
        });

        document.getElementById('closeLogs').addEventListener('click', () => {
            this.hideLogsModal();
        });

        document.getElementById('closeTerminal').addEventListener('click', () => {
            this.hideTerminalModal();
        });

        // Broadcast form
        document.getElementById('sendBroadcast').addEventListener('click', () => {
            this.sendBroadcast();
        });

        // Command history navigation
        document.addEventListener('keydown', (e) => {
            if (e.target.id === 'terminalInput') {
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.navigateCommandHistory(-1);
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.navigateCommandHistory(1);
                }
            }
        });

        // Close modals on outside click
        window.addEventListener('click', (e) => {
            const modals = ['restartModal', 'logsModal', 'terminalModal', 'broadcastModal'];
            modals.forEach(modalId => {
                const modal = document.getElementById(modalId);
                if (modal && e.target === modal) {
                    this[`hide${modalId.replace('Modal', '')}Modal`]();
                }
            });
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl+R to refresh
            if (e.ctrlKey && e.key === 'r') {
                e.preventDefault();
                this.requestStatusUpdate();
            }
            
            // Ctrl+L to clear logs
            if (e.ctrlKey && e.key === 'l') {
                e.preventDefault();
                document.getElementById('logContainer').innerHTML = '';
            }
            
            // Ctrl+T for terminal
            if (e.ctrlKey && e.key === 't') {
                e.preventDefault();
                this.showTerminalModal();
            }
        });

        // Initialize tooltips
        this.initTooltips();
    }

    initTooltips() {
        const tooltips = document.querySelectorAll('[data-tooltip]');
        tooltips.forEach(element => {
            element.addEventListener('mouseenter', (e) => {
                const tooltip = document.createElement('div');
                tooltip.className = 'tooltip';
                tooltip.textContent = e.target.dataset.tooltip;
                document.body.appendChild(tooltip);
                
                const rect = e.target.getBoundingClientRect();
                tooltip.style.left = `${rect.left + rect.width / 2 - tooltip.offsetWidth / 2}px`;
                tooltip.style.top = `${rect.top - tooltip.offsetHeight - 5}px`;
                
                e.target._tooltip = tooltip;
            });
            
            element.addEventListener('mouseleave', (e) => {
                if (e.target._tooltip) {
                    e.target._tooltip.remove();
                    e.target._tooltip = null;
                }
            });
        });
    }

    navigateCommandHistory(direction) {
        if (this.commandHistory.length === 0) return;
        
        this.historyIndex = this.historyIndex || this.commandHistory.length;
        this.historyIndex += direction;
        
        if (this.historyIndex < 0) this.historyIndex = 0;
        if (this.historyIndex > this.commandHistory.length) this.historyIndex = this.commandHistory.length;
        
        const terminalInput = document.getElementById('terminalInput');
        if (this.historyIndex === this.commandHistory.length) {
            terminalInput.value = this.currentCommand;
        } else {
            terminalInput.value = this.commandHistory[this.historyIndex];
        }
    }

    addMonitoredContact() {
        const input = document.getElementById('monitorNumber');
        const number = input.value.trim();
        
        if (!number) {
            this.showNotification('Please enter a phone number', 'error');
            return;
        }
        
        if (!this.validatePhoneNumber(number)) {
            this.showNotification('Invalid phone number format', 'error');
            return;
        }
        
        this.sendCommand(`statusmonitor ${number}`);
        input.value = '';
        this.showNotification(`Added ${number} to monitoring`, 'success');
    }

    validatePhoneNumber(number) {
        return /^[0-9]{10,15}$/.test(number.replace(/\D/g, ''));
    }

    showRestartModal() {
        document.getElementById('restartModal').style.display = 'flex';
        document.getElementById('restartPassword').focus();
    }

    hideRestartModal() {
        document.getElementById('restartModal').style.display = 'none';
        document.getElementById('restartPassword').value = '';
    }

    showLogsModal() {
        document.getElementById('logsModal').style.display = 'flex';
        this.loadFullLogs();
    }

    hideLogsModal() {
        document.getElementById('logsModal').style.display = 'none';
    }

    showTerminalModal() {
        document.getElementById('terminalModal').style.display = 'flex';
        document.getElementById('terminalInput').focus();
    }

    hideTerminalModal() {
        document.getElementById('terminalModal').style.display = 'none';
    }

    showBroadcastModal() {
        document.getElementById('broadcastModal').style.display = 'flex';
        document.getElementById('broadcastMessage').focus();
    }

    hideBroadcastModal() {
        document.getElementById('broadcastModal').style.display = 'none';
        document.getElementById('broadcastMessage').value = '';
    }

    async loadFullLogs() {
        try {
            const response = await fetch('/api/logs?lines=200');
            const data = await response.json();
            
            const logsContainer = document.getElementById('fullLogs');
            if (data.logs && data.logs.length > 0) {
                logsContainer.textContent = data.logs.join('\n');
                logsContainer.scrollTop = logsContainer.scrollHeight;
            } else {
                logsContainer.textContent = 'No logs available';
            }
        } catch (error) {
            console.error('Failed to load logs:', error);
            document.getElementById('fullLogs').textContent = 'Error loading logs';
        }
    }

    async restartBot() {
        const password = document.getElementById('restartPassword').value;
        if (!password) {
            this.showNotification('Please enter admin password', 'error');
            return;
        }
        
        try {
            const response = await fetch('/api/restart', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ password })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.showNotification(data.message || 'Bot restart initiated', 'success');
                this.hideRestartModal();
                
                // Show countdown
                let countdown = 5;
                const countdownInterval = setInterval(() => {
                    if (countdown > 0) {
                        this.showNotification(`Restarting in ${countdown} seconds...`, 'info');
                        countdown--;
                    } else {
                        clearInterval(countdownInterval);
                        this.showNotification('Bot is restarting...', 'info');
                    }
                }, 1000);
            } else {
                this.showNotification(data.error || 'Failed to restart bot', 'error');
            }
        } catch (error) {
            this.showNotification('Failed to restart bot', 'error');
            console.error('Restart error:', error);
        }
    }

    async sendBroadcast() {
        const message = document.getElementById('broadcastMessage').value.trim();
        if (!message) {
            this.showNotification('Please enter a broadcast message', 'error');
            return;
        }
        
        this.sendCommand(`broadcast ${message}`);
        this.hideBroadcastModal();
        this.showNotification('Broadcast sent to bot for processing', 'info');
    }

    handleBroadcastResult(result) {
        if (result.success) {
            this.showNotification(`Broadcast completed: ${result.success} sent, ${result.failed} failed`, 'success');
            this.addTerminalOutput(`Broadcast result: ${JSON.stringify(result, null, 2)}`, 'data');
        } else {
            this.showNotification(`Broadcast failed: ${result.error}`, 'error');
        }
    }

    handleAuthResponse(response) {
        if (response.success) {
            this.isAuthenticated = true;
            this.showNotification('Authentication successful', 'success');
        } else {
            this.isAuthenticated = false;
            this.showNotification(`Authentication failed: ${response.error}`, 'error');
        }
    }

    handleChatUpdate(chat) {
        // Update chat list in UI if needed
        console.log('Chat update:', chat);
    }

    handleGroupUpdate(group) {
        // Update group list in UI if needed
        console.log('Group update:', group);
    }

    handleMessageUpdate(message) {
        // Update message display if needed
        console.log('Message update:', message);
    }

    handleStateChange(state) {
        this.updateStatus(state.status, state.message);
        if (state.data) {
            this.updateStats(state.data);
        }
    }

    checkAuth() {
        // Check if password is required
        const requiresAuth = document.body.dataset.requiresAuth === 'true';
        if (requiresAuth && !this.isAuthenticated) {
            this.showAuthModal();
        }
    }

    showAuthModal() {
        // Implement authentication modal if needed
    }

    showNotification(message, type = 'info') {
        // Use Toastr or custom notification
        if (typeof toastr !== 'undefined') {
            const config = {
                closeButton: true,
                progressBar: true,
                positionClass: 'toast-top-right',
                timeOut: 3000
            };
            
            switch(type) {
                case 'success':
                    toastr.success(message, 'Success', config);
                    break;
                case 'error':
                    toastr.error(message, 'Error', config);
                    break;
                case 'warning':
                    toastr.warning(message, 'Warning', config);
                    break;
                default:
                    toastr.info(message, 'Info', config);
            }
        } else {
            // Fallback to console
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    showError(message) {
        this.showNotification(message, 'error');
        this.addLog(`Error: ${message}`, 'error');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Socket command handlers
    sendSocketCommand(type, data) {
        if (!this.socket.connected) {
            this.showError('Not connected to server');
            return false;
        }
        
        this.socket.emit(type, data);
        return true;
    }

    // Bot control commands via socket
    botCommand(command, args = {}) {
        return this.sendSocketCommand('bot-command', { command, ...args });
    }

    // Quick action methods
    quickRestart() {
        if (confirm('Are you sure you want to restart the bot?')) {
            this.botCommand('restart');
        }
    }

    quickBroadcast(message) {
        this.botCommand('broadcast', { message });
    }

    quickStatusCheck() {
        this.botCommand('status');
    }

    quickGetLogs(lines = 50) {
        this.botCommand('get-logs', { lines });
    }

    quickGetStats() {
        this.botCommand('get-stats');
    }

    // Export functionality
    exportData(type) {
        this.botCommand('export-data', { type });
    }

    // Import functionality
    importData(type, data) {
        this.botCommand('import-data', { type, data });
    }

    // Update bot settings
    updateSettings(settings) {
        this.botCommand('update-settings', { settings });
    }
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Toastr if available
    if (typeof toastr !== 'undefined') {
        toastr.options = {
            positionClass: "toast-top-right",
            timeOut: 3000,
            extendedTimeOut: 1000,
            closeButton: true,
            progressBar: true,
            newestOnTop: true,
            preventDuplicates: true
        };
    }
    
    // Create global dashboard instance
    window.dashboard = new Dashboard();
    
    // Make dashboard methods globally accessible
    window.restartBot = () => window.dashboard.quickRestart();
    window.checkStatus = () => window.dashboard.quickStatusCheck();
    window.openTerminal = () => window.dashboard.showTerminalModal();
    window.openLogs = () => window.dashboard.showLogsModal();
    window.openBroadcast = () => window.dashboard.showBroadcastModal();
    
    // Add some CSS for tooltips
    const style = document.createElement('style');
    style.textContent = `
        .tooltip {
            position: fixed;
            background: #333;
            color: white;
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 10000;
            pointer-events: none;
            white-space: nowrap;
        }
        
        .terminal-entry {
            margin: 2px 0;
            padding: 2px 5px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
        }
        
        .terminal-entry.command {
            color: #4CAF50;
        }
        
        .terminal-entry.info {
            color: #2196F3;
        }
        
        .terminal-entry.success {
            color: #4CAF50;
        }
        
        .terminal-entry.error {
            color: #f44336;
        }
        
        .terminal-entry.data {
            color: #9C27B0;
        }
        
        .terminal-entry.warning {
            color: #FF9800;
        }
        
        .terminal-time {
            color: #888;
            margin-right: 10px;
        }
    `;
    document.head.appendChild(style);
    
    // Add keyboard shortcut help
    console.log('Keyboard shortcuts:');
    console.log('Ctrl+R - Refresh status');
    console.log('Ctrl+L - Clear logs');
    console.log('Ctrl+T - Open terminal');
    console.log('Arrow Up/Down - Navigate command history');
});