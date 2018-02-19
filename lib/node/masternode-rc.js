const
    _ = require('lodash'),
    logger = require('../logger'),
    socketIo = require('socket.io'),
    socketioJwt = require('socketio-jwt');

class RemoteControl {

    constructor (owner, db) {
        this.owner = owner;
        this.db = db;
        this.running = false;
        this.authenticatedSockets = {}
    }

    start (options) {
        if (this.running)
            return;

        // for dispatcher
        this.eventFns = {
            'pong': this.pong,
            'initConnection': this.initConnection,
            'getState': this.getState,
            'getLightNodes': this.getLightNodes,
            'addNode': this.addNode,
            'removeNode': this.removeNode,
            'nodeOp': this.nodeOp,
            'masterOn': this.masterOn
        };

        var self = this;
        
        logger.debug("✔ socket.io server listening on port %d", options.rc_port);

        // create

        var io = socketIo.listen(options.rc_port);

        this.io = io;

        // run

        this.running = true;

        io.sockets.on('connection', socketioJwt.authorize({
            secret: options.remoteControl.jwt.secret,
            timeout: options.remoteControl.jwt.timeout * 1000
        })).on('authenticated', function (socket) {
            logger.debug('Client', socket.handshake.address, 'token:', socket.decoded_token.name);

            self.authenticatedSockets[socket.id] = socket;

            // audit action authenticated

            self.db.addAction({
                name: 'Client authenticated',
                ip: socket.handshake.address,
                user: 'ui',
                date: new Date()
            });

            socket.on('disconnect', () => {

                // audit action disconnected

                self.db.addAction({
                    name: 'Client disconnected',
                    ip: socket.handshake.address,
                    user: 'ui',
                    date: new Date()
                });

                delete self.authenticatedSockets[socket.id];
            });

            socket.emit('ping', {payload:'123'});
            
            socket.on('message', msg => self.dispachMessage(socket, msg));       
        }).on('unauthorized', function (err) {

            // audit action unathorized

            self.db.addAction({
                name: `Client unathorized ${err.message}`,
                ip: 'undefined',
                user: 'ui',
                date: new Date()
            });
        });
    }

    stop () {
        if (this.running) {
            this.io.close();
            this.running = false;
            this.authenticatedSockets = {};
        }
    }

    dispachMessage (socket, msg) {
        logger.debug('ws_msg:', msg);

        var eventFns = this.eventFns[msg.event];
        eventFns && eventFns.call(this, socket, msg);
    }

    pong (socket, msg) {
        // for testing purposes
    }

    initConnection (socket, msg) {
        // startup
        this.getState(socket, msg);
        this.getLightNodes(socket, msg);
    }

    checkConnection (socket) {
        return socket && !!this.authenticatedSockets[socket.id]
    }

    getState (socket, msg) {
        if (this.checkConnection(socket)) {

            (async ()=> {
                socket.send({
                    event: 'state',
                    state: await this.owner.getState()
                });
            })();
        }
    }

    getLightNodes (socket, msg) {
        if (this.checkConnection(socket)) {
            var nodes = []
            for (let [k, node] of Object.entries(this.owner.nodes)) {
                var newNode = _.clone(node);
                delete newNode.options['user'];
                delete newNode.options['password'];
                delete newNode['owner'];
                delete newNode['client'];
                delete newNode['hasNewData'];
                nodes.push(newNode);
            }

            socket.send({
                event: 'lightNodes',
                nodes: nodes
            });
        }
    }

    addNode (socket, msg) {
        if (this.checkConnection(socket)) {
            this.owner.addNetNodeDefault(msg.node);
            this.db.addNetNode(msg.node);
        }
    }

    removeNode (socket, msg) {
        if (this.checkConnection(socket)) {
            this.owner.removeNetNode(msg.node);
            this.db.removeNetNode(msg.node);
        }
    }

    nodeOp (socket, msg) {
        if (this.checkConnection(socket)) {
            try {
                var payload = msg.payload;
                var node = this.owner.nodeById(payload.id);
                if (!node) {
                    notifications.error('RC_BAD_REQUEST', `nodeOp ${JSON.stringify(msg)}`);
                    return;
                }
                // node logic
                //  on/off
                //  unlock
                switch (payload.code) {
                    case 'onoff':
                        if (payload.cmd == 'on')
                            this.owner.nodeOn(node);
                        else if (payload.cmd == 'off')
                            this.owner.nodeOff(node);
                        else if (payload.cmd == 'shutdown')
                            this.owner.nodeShutdown(node);
                        else
                            notifications.error('RC_BAD_REQUEST', `nodeOp ${JSON.stringify(msg)}`);
                        break;
                    case 'exchange.onoff':
                        if (payload.cmd == 'on')
                            this.owner.nodeExchangeOn(node, payload.exchangeId);
                        else if (payload.cmd == 'off')
                            this.owner.nodeExchangeOff(node, payload.exchangeId);
                        else
                            notifications.error('RC_BAD_REQUEST', `nodeOp ${JSON.stringify(msg)}`);
                        break;
                }
            }
            catch (e) {
                logger.error('rc:nodeOp', e);
            }
        }
    }

    masterOn (socket, msg) {
        if (this.checkConnection(socket)) {
            if (msg.payload == 'on')
                this.owner.start();
            else if (msg.payload == 'off')
                this.owner.stop();
            else if (msg.payload == 'shutdown')
                this.owner.shutdown();
            else
                notifications.error('RC_BAD_REQUEST', `masterOn ${JSON.stringify(msg)}`);
        }
    }

    pushNotification (notification) {
        Object.values(this.authenticatedSockets).map(socket =>
            socket.send({
                event: 'notification',
                notification
            })
        )
    }

    updateLightNodes () {
        Object.values(this.authenticatedSockets).map(socket => this.getLightNodes(socket, null));
    }

    updateLightNode (node) {
        Object.values(this.authenticatedSockets).map(socket => this.getLightNodes(socket, null));
    }

    updateState () {
        Object.values(this.authenticatedSockets).map(socket => this.getState(socket, null));
    }
}

module.exports = RemoteControl;
