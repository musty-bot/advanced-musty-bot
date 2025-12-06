const fs = require('fs-extra');
const path = require('path');
const config = require('../config');

class Logger {
    constructor() {
        this.logFile = path.join(__dirname, '..', config.logFile);
        this.commandCount = 0;
        this.errorCount = 0;
        this.autoReplyCount = 0;
        this.statusChecks = 0;
        this.setupLogFile();
    }

    setupLogFile() {
        try {
            fs.ensureFileSync(this.logFile);
        } catch (error) {
            console.error('Failed to setup log file:', error.message);
        }
    }

    getTimestamp() {
        return new Date().toISOString().replace('T', ' ').slice(0, 19);
    }

    log(level, message) {
        const timestamp = this.getTimestamp();
        const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
        
        // Console output with ANSI colors
        const colors = {
            info: '\x1b[34m',    // Blue
            warn: '\x1b[33m',    // Yellow
            error: '\x1b[31m',   // Red
            success: '\x1b[32m', // Green
            debug: '\x1b[35m',   // Magenta
            event: '\x1b[36m',   // Cyan
            status: '\x1b[90m'   // Gray
        };
        
        const reset = '\x1b[0m';
        const color = colors[level] || reset;
        
        // Format console output
        const levelDisplay = level.toUpperCase().padEnd(7);
        console.log(`${color}[${timestamp}] [${levelDisplay}] ${message}${reset}`);
        
        // File logging
        try {
            fs.appendFileSync(this.logFile, logMessage + '\n');
        } catch (error) {
            console.error('Failed to write to log file:', error.message);
        }
    }

    info(message) {
        this.log('info', message);
    }

    warn(message) {
        this.log('warn', message);
    }

    error(message) {
        this.errorCount++;
        this.log('error', message);
    }

    success(message) {
        this.log('success', message);
    }

    debug(message) {
        if (config.logLevel === 'debug') {
            this.log('debug', message);
        }
    }

    event(message) {
        this.log('event', message);
    }

    status(message) {
        this.statusChecks++;
        this.log('status', message);
    }

    // Stats tracking methods
    incrementCommandCount() {
        this.commandCount++;
    }

    incrementAutoReplyCount() {
        this.autoReplyCount++;
    }

    incrementStatusChecks() {
        this.statusChecks++;
    }

    // Get statistics
    getStats() {
        return {
            commandCount: this.commandCount,
            errorCount: this.errorCount,
            autoReplyCount: this.autoReplyCount,
            statusChecks: this.statusChecks,
            logFile: this.logFile,
            logSize: this.getLogSize()
        };
    }

    getLogSize() {
        try {
            const stats = fs.statSync(this.logFile);
            return this.formatBytes(stats.size);
        } catch (error) {
            return '0 Bytes';
        }
    }

    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
}

module.exports = new Logger();