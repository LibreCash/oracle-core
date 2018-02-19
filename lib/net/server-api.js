const
    logger = require('../logger');

// todo: refactor to class, multiple instances
// todo: review methods + swagger

var server = null;

function setServer(owner) {
    server = owner;
}

function response(res, obj) {
    res.json(obj);
}

function error(res, code, obj) {
    logger.debug('server error', code, obj);
    res.json({
        error: {
            code,
            message: JSON.stringify(obj)
        }
    });
}

function getConnection(req, res, next) {
    var connection = server.getConnection(req.params.connectionId);
    if (!connection) {
        error(res, 'CONNECTION_NOT_FOUND', 'connection not found');
        return null;
    }
    return connection;
}

function getPing(req, res, next) {

    var connection = server.getConnection(req.params.connectionId);
    if (connection) {
        connection.onPing();
    }
    
    response(res, {
        res: 'pong',
        banner: 'LibreBank node server',
        apiVersion: '1.0',
        status:'ok', 
        timestamp: (new Date).toString()
    });
}

function getConnect(req, res, next) {
    logger.info('getConnect success');

    var connection = server.createConnection(req);

    if (!connection) {
        response(res, {
            code: 'noconnect',
            message: 'unable to connect'
        });
        return;
    }

    connection.onClientConnected();

    response(res, {
        connectionId: connection.id
    });
}

function getDisconnect(req, res, next) {
    logger.info('getDisconnect success');

    var connection = getConnection(req, res, next);
    if (!connection)
        return;

    connection.disconnect();

    response(res, {
        code: 'disconnected',
        message: 'connection deleted'
    });
}

function getNodeTickers(req, res, next) {

    var connection = getConnection(req, res, next);
    if (!connection)
        return;

    var tickers = connection.server.getNode().getTickers();

    response(res, tickers);
}

function getNodeState(req, res, next) {

    var connection = getConnection(req, res, next);
    if (!connection)
        return;

    (async ()=>{
        var state = await connection.server.getNode().exportState();

        response(res, {
            state
        }); 
    })();
}

function getPoolNotifications(req, res, next) {

    var connection = getConnection(req, res, next);
    if (!connection)
        return;

    var notifications = connection.getNotifications(req.params.index, req.params.count);

    response(res,
        notifications
    );
}

function getNodeOnOff(req, res, next) {

    var connection = getConnection(req, res, next);
    if (!connection)
        return;

    var node = connection.server.getNode();
    var onoff = req.params.onoff;
    if (onoff == 'on')
        node.start();
    else if (onoff == 'off')
        node.stop();
    else if (onoff == 'shutdown')
        node.shutdown();

    response(res, {
    });
}

/**
 * @title getNodeExchangeOnOff autogen
 * @description LightNode exchange on/off
 */

function getNodeExchangeOnOff(req, res, next) {
    logger.info('getNodeExchangeOnOff success');
    var connection = getConnection(req, res, next);
    if (!connection)
        return;

    var node = connection.server.getNode();
    var onoff = req.params.onoff;
    var exchangeId = parseInt(req.params.exchangeId);

    var err = node.exchangeOnOff(exchangeId, onoff);

    response(res, err);
}


module.exports = {
    setServer,
    getPing,
    getConnect,
    getDisconnect,
    getNodeTickers,
    getNodeState,
    getPoolNotifications,
    getNodeOnOff,
    getNodeExchangeOnOff
}
