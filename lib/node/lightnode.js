var
    EventEmitter = require('events'),
    delay = require('../helpers').delay,
    logger = require('../logger'),
    server = require('../net/server'),
    Fetcher = require('../fetcher/fetcher'),
//    fetcher = require('./fetcher'),
    LightNodeState = require('../../models/LightNodeState'),
//    eth = require('../eth/eth'),
    Eth = require('../eth2/eth2'),
    db = require('../db'),
    utils = require('./utils'),
    Mailer = require('../mailer'),
    Slack = require('../slack');

// todo: refactor to new DB() & new Server(), multiple instances

var singleInstance = null;
var eth = null;
var fetcher = new Fetcher();

class LightNode extends EventEmitter {
    constructor (id) {
        super();

        if (singleInstance)
            throw "Multiple instances is not supported";

        singleInstance = this;

        this.id = id;
        this.connections = {};
        this.server = server;
        this.rates = {};
        this.db = db;
        this.mailer = new Mailer;
        
        this.tickers = [];
        this.avarageRate = 0;
        this.tickersDeltaMax = 1/5;

        // nodebug: must force on error. in other case emit('error') produce an error
        this.on('error', (e)=>{
            logger.debug('internalerror handled', e);
        });

        server.setNode(this);

        this.initState();
    }

    getId () {
        return this.id;
    }

    getDb () {
        return this.db;
    }

    // state

    initState () {
        this.state = {
            id: this.id,
            startTime: new Date(),
            uptime: 0,
            lastUpdate: new Date(),
            running: false,
            lastError: null,
            eth: null
        };
    }

    async updateState () {
        this.state.lastUpdate = new Date();
        this.state.eth = eth.getState();
        await this.updateStateUptimeAndSave();
    }

    async updateStateUptimeAndSave () {
        this.state.uptime = new Date().getTime() - this.state.startTime.getTime();

        await db.updateLightNodeState(this.state);
    }

    async exportState () {
        this.updateStateUptimeAndSave();

        return {
            startTime: this.state.startTime,
            uptime: this.state.uptime,
            lastUpdate: this.state.lastUpdate,
            running: this.state.running,
            lastError: this.state.lastError,
            eth: this.state.eth,
            exchanges: fetcher.getExchanges(),
            actions: await db.getActions()
        };
    }

    // api

    async start (options = this.options) {
        if (!this.updateTimerOn) {
            this.options = options;

            logger.setLogLevel(options.logLevel);
            
            var self = this;

            this.dburl = options.db;
            
            await db.connect(this.dburl);

            await this.mailer.setup(options.mail);
            
            this.slack = new Slack(options.slack);

            this.mailer.sendStartup();

            this.slack.send(`Lightnode ${options.id} started`);

            await this.setupEthereum();

            fetcher.loadExchanges(options.exchanges);

            server.start(options, ()=>{
                self.onStarted();
            });

            this.startUpdateTimer();
        }
    }

    stop () {
        if (this.updateTimerOn) {
            this.stopUpdateTimer();
            this.onStopped();

            this.slack.send(`Lightnode ${this.options.id} stopped`);
        }
    }

    shutdown () {
        this.onShutdown();
        
        // delayed shutdown for notify ui
        delay(5000).then(()=>{
            process.exit(0);
        });
    }

    // core

    startUpdateTimer () {
        this.updateTimerOn = true;
        this.state.running = true;
        this.update();
    }

    stopUpdateTimer (node) {
        this.updateTimerOn = false;
        this.state.running = false;
    }

    async update (node) {
        if (!this.updateTimerOn)
            return;
        
        logger.debug('LightNode update node id='+this.id);

        var tickers = await fetcher.fetchAll();

        await this.updateTickers(tickers);

        Promise.delay(this.options.updateTimeout * 1000).then(this.update.bind(this));
    }

    // rates

    async updateTickers (tickers) {

        // check for errors
        tickers = tickers.filter(ticker => ticker.err == undefined);

        if (tickers.length < this.options.minimumExchangesLimit) {
            this.onError('NODE_TICKER_MINIMUM_LIMIT', tickers.length);
            // something wrong, stop
            this.stop();
            return;
        }

        this.tickers = tickers;

        await db.saveTickers(tickers);

        var res = utils.processTickersAvarageRate(tickers, {
            avarageRate: this.avarageRate,
            deltaMax: this.tickersDeltaMax
        });

        if (!res.err) {
            this.avarageRate = res.avarageRate;
            
        }
        else {
            this.onError('TICKER_DELTA_OVERFLOW', res.err); // 'Node error: delta > deltaMax', 
        }

        await this.updateState();

        this.onRatesUpdated(res.err, this.avarageRate);
    }

    getTickers () {
        return this.tickers;
    }

    // events

    onStarted () {
        this.emit('started');
        server.pushNotification({code: 'LIGHTNODE_STARTED'});
    }

    onStopped () {
        this.emit('stoped');
        server.pushNotification({code: 'LIGHTNODE_STOPPED'});
    }

    onShutdown () {
        this.emit('shutdown');
        server.pushNotification({code: 'LIGHTNODE_SHUTDOWN'});
    }

    onClientConnected (connection) {
        this.emit('clientConnected', connection);
        server.pushNotification({code: 'LIGHTNODE_CLIENT_CONNECTED'});

        db.addAction({
            name: 'Client connected',
            ip: connection.ip,
            user: 'masternode',
            date: new Date()
        });
    }

    onClientDisconnected (connection) {
        this.emit('clientDisconnected', connection);
        server.pushNotification({code: 'LIGHTNODE_CLIENT_DISCONNECTED'});

        db.addAction({
            name: 'Client disconnected',
            ip: connection.ip,
            user: 'masternode',
            date: new Date()
        });
    }

    onRatesUpdated (err, avarageRate) {
        this.emit('ratesUpdated');
        server.pushNotification({code: 'RATES_UPDATED', err, avarageRate});
    }

    onError (code, err) {
        this.emit('error', code);
        server.pushNotification({code, err});

        if (code == 'TICKER_DELTA_OVERFLOW') {
            // todo: pretty print & refactor to notifications

            this.mailer.sendNodeTickerOverflow(err);

            this.slack.send(`Lightnode ${options.id} ticker delta overflow ${JSON.stringify(err)}`);
        }

        this.state.lastError = code;
    }

    onHttpError (err) {
        this.emit('httpError');
        server.pushNotification({code: 'HTTP_ERROR', error: err.message});
    }

    // contract

    onContractEvent (type, error, event) {
        this.emit('contractEvent', event);
        server.pushNotification({code: 'CONTRACT_EVENT', event});

        if (error) {
            this.onContractError(error);
            return;
        }
        
        switch (type) {
            case 'NewOraclizeQuery':
                this.pushToBlockchain(this.avarageRate);
                break;
        }
    }

    onContractError (error) {
        this.emit('contractError', error);
        server.pushNotification({code: 'CONTRACT_ERROR', error});
    }

    // Ethereum

    /**
     * Setup ethereum
     */

    async setupEthereum () {
        eth = new Eth();

        eth.on('event', this.onEthEvent.bind(this));
        eth.on('error', this.onEthError.bind(this));

        await eth.init(this.options.smartContract, this.onContractEvent.bind(this));
    }

    /**
     * Eth event callback
     * @param {*} msg Message
     */

    onEthEvent (...msg) {
        this.emit('ethEvent', ...msg);
        var code = msg[0];
        server.pushNotification({code, msg: msg.slice(1)});
        switch (code) {
            case WEB3CLIENT_CONNECTED:
            case WEB3CLIENT_DISCONNECTED:
                this.mailer.ethereumInfo(msg);
                break;
        }
    }

    /**
     * Eth error callback
     * @param {*} err Error
     */

    onEthError (...err) {
        this.emit('ethError', ...err);
        var code = err[0];
        server.pushNotification({code, err: err.slice(1)});
        switch (code) {
            case "ETH_INIT_ERROR":
            case "ETH_ERROR_READ_ABI":
            case "WEB3CLIENT_ERROR_INIT":
            case "WEB3CLIENT_ERROR":
            case "WEB3CLIENT_ERROR_ACCOUNT_NOT_PRESENT":
            case "WEB3CLIENT_ERROR_ACCOUNT_BAD_PASSWORD":
            case "WEB3CLIENT_ERROR_ACCOUNT_IS_LOCKED":
            case "WEB3CLIENT_ERROR_ACCOUNT_LOW_BALANCE":
                this.mailer.sendEthereumError(err);
                break;
        }
    }

    /**
     * Push rate to eth block chain
     */

    async pushToBlockchain (rate) {
        try {
            eth.pushToBlockchain(rate);
        }
        catch (e) {
            this.onContractError({code: 'ETH_PUSH_ERROR', rate});
        }
    }

    exchangeOnOff (exchangeId, onoff) {
        let exchange = fetcher.getExchangeById(exchangeId);
        if (!exchange)
            return {
                error: 'BAD_EXCHANGE_ID', 
                message: 'Exchange not found'
            };

        if (onoff != 'on' && onoff != 'off')
            return {
                error: 'BAD_OPERATION',
                message: 'Bad operation. "on/off" is required'
            }

        exchange.enabled = onoff == 'on';

        return {};
    }
}

module.exports = LightNode;
