const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs-extra');
const QRCode = require('qrcode');
const config = require('./config');
const logger = require('./utils/logger');

class WebDashboard {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        this.qrCode = null;
        this.botStatus = 'starting';
        this.botStats = {};
        this.clients = new Map();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketIO();
        this.start();
    }

    setupMiddleware() {
        this.app.use(express.static('public'));
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        
        // Security middleware
        this.app.use((req, res, next) => {
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Frame-Options', 'DENY');
            res.setHeader('X-XSS-Protection', '1; mode=block');
            next();
        });
    }

    setupRoutes() {
        // Serve dashboard
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });

        // API endpoints
        this.app.get('/api/status', (req, res) => {
            res.json({
                status: this.botStatus,
                qrCode: this.qrCode,
                stats: this.botStats,
                uptime: process.uptime(),
                timestamp: new Date().toISOString()
            });
        });

        this.app.get('/api/logs', async (req, res) => {
            try {
                const lines = parseInt(req.query.lines) || 50;
                const logPath = path.join(__dirname, config.logFile);
                
                if (await fs.pathExists(logPath)) {
                    const logContent = await fs.readFile(logPath, 'utf8');
                    const logLines = logContent.split('\n').filter(line => line.trim()).slice(-lines);
                    res.json({ logs: logLines });
                } else {
                    res.json({ logs: [] });
                }
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/sessions', async (req, res) => {
            try {
                const sessions = await fs.readdir(config.sessionPath).catch(() => []);
                res.json({ sessions });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/restart', (req, res) => {
            // Simple authentication
            const { password } = req.body;
            if (password !== process.env.ADMIN_PASSWORD || !process.env.ADMIN_PASSWORD) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            res.json({ message: 'Restarting bot...' });
            setTimeout(() => {
                process.exit(0);
            }, 1000);
        });

        this.app.post('/api/command', (req, res) => {
            const { command, password } = req.body;
            
            if (password !== process.env.ADMIN_PASSWORD || !process.env.ADMIN_PASSWORD) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            // Emit command to all connected bots
            this.io.emit('bot-command', { command });
            res.json({ message: 'Command sent to bot' });
        });

        // Serve QR code as image
        this.app.get('/api/qrcode', async (req, res) => {
            if (!this.qrCode) {
                return res.status(404).json({ error: 'No QR code available' });
            }
            
            try {
                const qrDataUrl = await QRCode.toDataURL(this.qrCode);
                res.json({ qrCode: qrDataUrl });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({ 
                status: 'ok',
                botStatus: this.botStatus,
                uptime: process.uptime(),
                timestamp: new Date().toISOString()
            });
        });

        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({ error: 'Not found' });
        });

        // Error handler
        this.app.use((err, req, res, next) => {
            logger.error(`Web error: ${err.message}`);
            res.status(500).json({ error: 'Internal server error' });
        });
    }

    setupSocketIO() {
        this.io.on('connection', (socket) => {
            logger.info(`📡 Web client connected: ${socket.id}`);
            this.clients.set(socket.id, socket);
            
            // Send initial status
            socket.emit('status', {
                status: this.botStatus,
                qrCode: this.qrCode,
                stats: this.botStats,
                timestamp: new Date().toISOString()
            });

            // Handle commands from web
            socket.on('command', (data) => {
                logger.info(`Web command from ${socket.id}: ${data.command}`);
                this.io.emit('bot-command', { command: data.command });
            });

            socket.on('disconnect', () => {
                logger.info(`📡 Web client disconnected: ${socket.id}`);
                this.clients.delete(socket.id);
            });
        });
    }

    setQrCode(qr) {
        this.qrCode = qr;
        this.io.emit('qr', { qrCode: qr });
        
        // Also generate QR code image
        QRCode.toDataURL(qr, (err, url) => {
            if (!err) {
                this.io.emit('qrImage', { qrImage: url });
            }
        });
    }

    setBotStatus(status) {
        this.botStatus = status;
        this.io.emit('status', { 
            status: this.botStatus,
            qrCode: this.qrCode,
            timestamp: new Date().toISOString()
        });
    }

    updateStats(stats) {
        this.botStats = stats;
        this.io.emit('stats', this.botStats);
    }

    sendLog(log) {
        this.io.emit('log', {
            message: log,
            timestamp: new Date().toISOString(),
            level: this.getLogLevel(log)
        });
    }

    getLogLevel(log) {
        if (log.includes('ERROR') || log.includes('❌')) return 'error';
        if (log.includes('WARN') || log.includes('⚠️')) return 'warning';
        if (log.includes('INFO') || log.includes('✅')) return 'info';
        if (log.includes('DEBUG')) return 'debug';
        return 'info';
    }

    start() {
        const port = process.env.PORT || 3000;
        this.server.listen(port, () => {
            logger.info(`🌐 Web dashboard running on http://localhost:${port}`);
            console.log(`\n══════════════════════════════════════════════════`);
            console.log(`🌐 WEB DASHBOARD AVAILABLE AT: http://localhost:${port}`);
            console.log(`══════════════════════════════════════════════════\n`);
        });
    }
}

module.exports = WebDashboard;