const winston = require('winston');

const logger = new winston.Logger({
    transports: [
        new winston.transports.Console({
            name: 'debug-console',
            json: false,
            prettyPrint: true,
            colorize: true
        }),
/*** disabled until fix log levels (too much data)
        new (winston.transports.File)({
            name: 'debug-file',
            filename: 'debug.log',
            json: false,
            prettyPrint: true
        }),
        new (winston.transports.File)({
            name: 'error-file',
            filename: 'error-error.log',
            level: 'error',
            json: false,
            prettyPrint: true
        })*/
    ]
});

logger.level = 'debug';

function setLogLevel(level) {
    logger.level = level
}

function _log(...args) {
    console.log(...args); //by vscode bug
}

function log(...args) {
    logger.log(...args);
    _log(...args);
}

function info(...args) {
    logger.info(...args);
    _log(...args);
}

function error(...args) {
    logger.error(...args);
    _log(...args);
}

function debug(...args) {
    logger.debug(...args);
    _log(...args);
}

module.exports = {
    setLogLevel,
    log,
    info,
    error,
    debug
}
