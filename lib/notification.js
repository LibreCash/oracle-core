const
    logger = require('./logger');

var
    db = null,
    owner = null;

function setDb(db_) {
    db = db_;
}

function setOwner(owner_) {
    owner = owner_;
}

function debug(code, ...message) {
    notify('debug', code, ...message);
}

function info(code, ...message) {
    notify('info', code, ...message);
}

function error(code, ...message) {
    notify('error', code, ...message);
}

function push(code, ...message) {
    notify('info', code, ...message);
}

// type - logger type
// code:
//  DB_ERROR    database error
//  NODE_*
//  

function notify(type, code, ...message) {
    
    // log to file also
    logger.info(`notify: ${code}`, message);

    var notification = {
        nodeId: owner.nodeId,
        date: new Date(),
        code: code,
        object: message
    };

    try {
        db.addNotification(notification);
    } catch (e) {
        logger.error('DB_ERROR', `can't write to db`);
    }
    
    // notify owner

    // todo: refactor to slack & email here + filter events

    switch (code) {
            // master
        case 'MASTERNODE_STARTED':
        case 'MASTERNODE_STOPPED':
        case 'MASTERNODE_SHUTDOWN':
        case 'NODE_UNABLE_TO_CONNECT':
        case 'NODE_CONNECTED':
        case 'NODE_DISCONNECTED':
        case 'NODE_TICKER_DELTA_OVERFLOW':
            break;
            // light
        case 'LIGHTNODE_STARTED':
        case 'LIGHTNODE_STOPPED':
        case 'LIGHTNODE_SHUTDOWN':
        case 'LIGHTNODE_CLIENT_CONNECTED':
        case 'LIGHTNODE_CLIENT_DISCONNECTED':
            break;
            // common
        case 'RATES_UPDATED':
        case 'TICKER_DELTA_OVERFLOW':
        case 'HTTP_ERROR':
        case 'DB_ERROR':
            break;
            // eth
        case 'CONTRACT_EVENT':
        case 'CONTRACT_ERROR':
        case "ETH_INIT_ERROR":
        case "ETH_ERROR_READ_ABI":
        case "WEB3CLIENT_ERROR_INIT":
        case "WEB3CLIENT_ERROR":
        case "WEB3CLIENT_ERROR_ACCOUNT_NOT_PRESENT":
        case "WEB3CLIENT_ERROR_ACCOUNT_BAD_PASSWORD":
        case "WEB3CLIENT_ERROR_ACCOUNT_IS_LOCKED":
        case "WEB3CLIENT_ERROR_ACCOUNT_LOW_BALANCE":
            break;
        default:
            break;
    }
    owner.onNotification(notification);
}

module.exports = {
    setDb,
    setOwner,
    debug,
    info,
    error,
    push
}
