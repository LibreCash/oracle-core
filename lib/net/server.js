const
    route = require('./server-route'),
    http = require('http'),
    express = require('express'),
    fs = require('fs'),
    path = require('path'),
    crypto = require('crypto'),
    logger = require('../logger'),
    cookieParser = require('cookie-parser'),
    bodyParser = require('body-parser'),
    api = require('./server-api'),
    passport = require('passport'),
    LocalStrategy = require('passport-local').Strategy,
    Connection = require('./server-connection');

// todo: refactor to class, multiple instances

var initialized = false;
var app;

var notifications = [];
var connections = {};

function setup(options, success) {
    if (initialized)
        return;

    initialized = true;

    logger.debug('server options:', options)
    
    app = express();

    app.set('port', options.port);

    app.use(cookieParser());
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: false }));

    route.initRoute(app, api, {passport});

    // catch 404 and forward to error handler
    app.use(function(req, res, next) {
        var err = new Error('404 Not Found ' + req.path);
        err.status = 404;
        
        node && node.onHttpError(err);

        next(err);
    });
    
    // error handler
    app.use(function(err, req, res, next) {
        // set locals, only providing error in development
        res.locals.message = err.message;
        res.locals.error = req.app.get('env') === 'development' ? err : {};
    
        res.json({err:err})

        node && node.onHttpError(err);
    });
    
    app.listen(app.get('port'), ()=> {
        logger.debug("✔ Server listening on port %d in %s mode", app.get('port'), app.settings.env);
        success();
    });
}

function start(options, success) {
    this.options = options;
    api.setServer(this);
    setup(options, success);
}

function stop(success) {
    if (app) {
        app.close();
        app = undefined;
    }
    success();
}

// node

var node = null;
var db = null;

function setNode(owner) {
    node = owner;
    db = node.getDb();
}

function getNode(owner) {
    return node;
}

function getOptions() {
    return this.options;
}

// notifications

function pushNotification(message) {
    logger.debug(`pushNotification ${JSON.stringify(message)}`);
    notifications.push(message);
    message.nodeId = node.getId();
    message.date = new Date();
    db.addNotification(message);
}

function getNotifications() {
    return notifications;
}

// Connection

/**
 * Create connection
 * @param {IncomingMessage} req Request
 */

function createConnection(req) {
    if (req.params.secret != crypto.createHmac('sha256', this.options.secret).digest('hex'))
        return;

    var connectionId = crypto.randomBytes(64).toString('hex');
    var connection = new Connection(connectionId, this, req);
    connections[connection.id] = connection;
    return connection;
}

/**
 * Delete connection
 * @param {Connection} connection Connection
 */

function deleteConnection(connection) {
    delete connections[connection.id];
    delete connection;
}

/**
 * Get connection by id
 * @param {String} id Connection
 */

function getConnection(id) {
    var connection = connections[id];
    return connection;
}

module.exports = {
    start: start,
    stop: stop,
    setNode: setNode,
    getNode: getNode,
    getOptions: getOptions,
    pushNotification: pushNotification,
    getNotifications: getNotifications,
    createConnection: createConnection,
    deleteConnection: deleteConnection,
    getConnection: getConnection
}
