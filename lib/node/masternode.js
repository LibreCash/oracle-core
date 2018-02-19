const
    EventEmitter = require('events'),
    delay = require('../helpers').delay,
    _ = require('lodash'),
    logger = require('../logger'),
    db = require('../db'),
    notifications = require('../notification'),
    MasternodeNode = require('./masternode-node'),
    RemoteControl = require('./masternode-rc'),
    utils = require('./utils'),
    Mailer = require('../mailer'),
    Slack = require('../slack');

class MasterNode extends EventEmitter {
    constructor (options) {
        super();

        logger.setLogLevel(options.logLevel);

        return new Promise(resolve => {
            this.options = _.clone(options);
            this.nodes = {};
            this.interval = null;
            this.nodeId = 1;

            this.initState();

            this.state.id = 1;

            this.init(options, resolve);
        });
    }

    async init(options, resolve) {
        notifications.setOwner(this);
        
        await db.connect(this.options.db);

        notifications.setDb(db);

        notifications.push('MASTERNODE_INITED', {id: this.state.id});
        
        this.rc = new RemoteControl(this, db);

        this.mailer = new Mailer;

        this.slack = new Slack(options.slack);

        resolve(this);
    }

    async getState () {
        var state = this.state;
        state.actions = await db.getActions();
        return state;
    }
    
    initState () {
        this.state = {
            id: 0,
            startTime: new Date(),
            uptime: 0,
            lastUpdate: new Date(),
            lightNodesTotal: 0,
            lightNodesAlive: 0,
            finalAvarageRate: 0,
            running: false,
            lastPrices: []
        };
    }

    async updateState () {
        this.state.lastUpdate = new Date();
        this.state.uptime = new Date().getTime() - this.state.startTime.getTime();

        await db.updateMasterNodeState(this.state);

        this.rc && this.rc.updateState();
    }
    
    set nodes (nodes) {
        this._nodes = nodes;
    }

    get nodes () {
        return this._nodes;
    }

    // api

    async start () {
        if (!this.state.running) {
            this.state.running = true;

            for (var i in this.options.lightnodes) {
                await this.addNetNodeDefault(this.options.lightnodes[i]);
            }

            var dbNodes = await db.getNetNodes();

            for (var i in dbNodes) {
                await this.addNetNodeDefault(dbNodes[i]);
            }

            this.remoteControlStart(this.options);

            await this.mailer.setup(this.options.mail);

            this.mailer.sendStartup();

            this.slack.send(`Masternode ${this.options.id} started`);

            notifications.push('MASTERNODE_STARTED', {id: this.state.id});
        }
    }

    async stop () {
        if (this.state.running) {
            this.state.running = false;

            await this.updateState();
            
            while (this.state.lightNodesTotal > 0) {
                await this.removeNode(Object.values(this.nodes)[0]);
            }

            this.slack.send(`Masternode ${this.options.id} stopped`);

            notifications.push('MASTERNODE_STOPPED', {id: this.state.id});
        }
    }

    async shutdown () {
        notifications.push('MASTERNODE_SHUTDOWN', {id: this.state.id});

        // delayed shutdown for notify ui
        delay(5000).then(()=>{
            process.exit(0);
        });
    }

    async addNetNodeDefault (node) {
        var options = {
            name: node.name,
            description: node.description,
            host: node.host,
            port: node.port,
            secret: node.secret,
            pingRate: this.options.pingRate,
            requestRetryCount: this.options.requestRetryCount,
            reconnectTimeout: this.options.reconnectTimeout,
        };
        await this.addNode(options);
    }

    async addNode (optionsNode) {
        var node = new MasternodeNode(this.nodeId++, optionsNode);
        
        logger.debug('addNode', node);
        
        // add

        this.nodes[node.id] = node;

        this.emit('nodeAdded', node);

        // start

        this.nodeStartUpdateTimer(node);

        this.rc && this.rc.updateLightNode(node);
        
        this.state.lightNodesTotal++;
        await this.updateState();
    }

    async removeNode (node) {
        logger.debug('removeNode', node);
        
        this.nodeStopUpdateTimer(node);

        delete this.nodes[node.id];

        this.emit('nodeRemoved', node);
        
        this.state.lightNodesTotal--;
        await this.updateState();
    }

    // node control

    nodeError (node, code, err) {
        node.updateTimerOn = false;
        node.error = {code: code, message: JSON.stringify(err)};

        if (code == 'NODE_TICKER_DELTA_OVERFLOW') {
            this.mailer.sendNodeTickerOverflow(node.error);

            this.slack.send(`Masternode ${options.id} ticker delta overflow ${JSON.stringify(node.error)}`);
        }

        this.onNodeError(node.id, node.error);
    }

    nodeById (id) {
        return this.nodes[id];
    }

    async nodeOn (node) {
        var client = node.client;
        await client.nodeOnOff('on');
    }

    async nodeOff (node) {
        var client = node.client;
        await client.nodeOnOff('off');
    }

    async nodeShutdown (node) {
        var client = node.client;
        await client.nodeOnOff('shutdown');
    }

    async nodeExchangeOn (node, exchangeId) {
        var client = node.client;
        await client.nodeExchangeOnOff(exchangeId, 'on');
    }

    async nodeExchangeOff (node, exchangeId) {
        var client = node.client;
        await client.nodeExchangeOnOff(exchangeId, 'off');
    }

    // core

    nodeStartUpdateTimer (node) {
        node.updateTimerOn = true;
        if (!this.updateTimerOn) {
            this.updateTimerOn = true;
            this.updateAllNodes();
        }
    }
    nodeStopUpdateTimer (node) {
        this.updateTimerOn = false;
    }

    async updateAllNodes () {
        var nodesUpdated = 0;
        for (var i in this.nodes) {
            var node = this.nodes[i];
            if (!node.updateTimerOn)
                continue;
            await this.update(node);
            nodesUpdated++;
        }

        this.checkNodes();

        this.rc && this.rc.updateLightNodes();
        this.updateState();

        if (nodesUpdated > 0) {
            // continue if nodes is updated
            Promise.delay(this.options.updateTimeout * 1000).then(this.updateAllNodes.bind(this));
        } else {
            // stop timer if all nodes is passed
            this.nodeStopUpdateTimer();
        }
    }

    async update (node) {
        var client = node.client;
        
        logger.debug('MasterNode update node id='+node.id);

        // connect 

        if (!node.connected) {
            var connectionId = await client.connect();
            if (!connectionId) {
                this.onNodeConnectionError(node);
            }
        }

        // load info

        var clientState = await client.getClientState();
        if (clientState.connected != node.connected) {
            node.connected = clientState.connected;
            if (node.connected)
                this.onNodeConnected(node);
            else 
                this.onNodeDisconnected(node);
        }

        if (node.connected) {

            // load tickers

            var tickers = await client.getTickers();
            if (!tickers.error)
                await this.updateTickers(node, tickers);
            else
                this.onNodeError(node.id, tickers.error);

            // get node state

            var nodeState = await client.getNodeState();
            if (!nodeState.error)
                node.state = nodeState.state;
            else
                this.onNodeError(node.id, nodeState.error);

            // pool notifications

            var notifications = await client.poolNotifications({index: -1, maxCount: 100});
            if (!notifications.error)
                this.processClientNotifications(node, notifications.notifications);
            else
                this.onNodeError(node.id, notifications.error);
        }
    }

    async updateTickers (node, tickers) {
        node.tickers = node.tickers.concat(tickers);

        this.saveData(tickers);
    }
    
    async saveData(result) {
        db.saveTickers(result);
    }

    async checkNodes () {
        var processedNodes = [];
        for (var i in this.nodes) {
            var node = this.nodes[i];
            if (node.hasNewData()) {
                var res = utils.processTickersAvarageRate(node.tickers, {
                    avarageRate: node.avarageRate,
                    deltaMax: node.deltaMax
                });

                if (!res.err) {
                    node.avarageRate = res.avarageRate;
                    processedNodes.push(node);
                }
                else {
                    nodeError(node, 'NODE_TICKER_DELTA_OVERFLOW', res.err);
                }
            }
        }

        // calc final

        if (processedNodes.length > 0) {

            this.state.finalAvarageRate = utils.processNodesFinalAvarageRate(processedNodes);

            // last prices

            var prevPrice = this.state.lastPrices.length > 0 ? this.state.lastPrices[this.state.lastPrices.length - 1] : {
                price: 0,
                date: new Date(),
                deltaPercent: 0
            }

            var v = prevPrice.price;
            var deltaPercent = v != 0 ? (this.state.finalAvarageRate - v) / v : 0;

            if (prevPrice.date != this.state.lastUpdate) {
                this.state.lastPrices.push({
                    price: this.state.finalAvarageRate,
                    date: this.state.lastUpdate,
                    deltaPercent: deltaPercent
                })
                if (this.state.lastPrices.length > 10)
                    this.state.lastPrices = this.state.lastPrices.slice(1)
            }
            await this.updateState();
        }
    }

    processClientNotifications (node, notifications_) {
        logger.debug(notifications);
        notifications_.forEach((notification)=>{
            notification.masterNodeId = node.id
            notifications.push('LIGHTNODE_NOTIFICATION', notification);
        })
    }

    // events
    
    onNodeConnectionError (node) {
        this.emit('nodeConnetionError', node);

        notifications.error('NODE_UNABLE_TO_CONNECT', {nodeId: node.id});
    }

    async onNodeConnected (node) {
        this.emit('nodeConneted', node);

        this.state.lightNodesAlive++;
        await this.updateState();

        notifications.push('NODE_CONNECTED', {nodeId: node.id, name: node.options.name});

        this.rc && this.rc.updateLightNode(node);
    }
    
    async onNodeDisconnected (node) {
        this.emit('nodeDisconnected', node);

        this.state.lightNodesAlive--;
        await this.updateState();

        notifications.push('NODE_DISCONNECTED', {nodeId: node.id});

        this.rc && this.rc.updateLightNode(node);
    }

    async onNodeUpdateRates (node, rates) {
        this.emit('nodeRatesUpdated', node, rates);

        notifications.push('NODE_RATES_UPDATED', {nodeId: node.id});

        await this.updateState();

        this.rc && this.rc.updateLightNode(node);
    }

    onNodeError (nodeId, error) {
        this.emit('nodeError', error);

        notifications.error(error.code, {nodeId, error});
    }

    onNotification (notification) {
        this.emit('notification', notification);
        
        this.rc && this.rc.pushNotification(notification);
    }

    // remote control

    remoteControlStart (options) {
        this.rc && this.rc.start(options);
    }

    remoteControlStop () {
        this.rc && this.rc.stop();
    }
}

module.exports = MasterNode;
