const
    EventEmitter = require('events'),
    delay = require('../helpers').delay,
    crypto = require('crypto'),
    _ = require('lodash'),
    api = require('./client-api'),
    logger = require('../logger');

class Client extends EventEmitter {
    constructor (options) {
        super();
        this.settings = _.clone(options);
        this.state = {
            connected: false,
            url: '',
            requestFailCount: 0,
            connectionId: null
        };
    }

    // state

    setConnected (connected) {
        this.state.connected = connected;
        this.notifyStateChanged();
    }

    // events

    notifyStateChanged () {
    }

    // ping timer

    async startPingTimer () {
        this.pingTimerOn = true;
        this.pingTimer();
    }

    stopPingTimer () {
        this.pingTimerOn = false;
    }

    async pingTimer () {
        if (!this.pingTimerOn)
            return;
        
        await this.ping();

        delay(this.settings.pingRate * 1000).then(this.pingTimer.bind(this));
    }

    // api

    async connect () {
        this.state.url = 'http://' + this.settings.host + ':' + this.settings.port;
        this.state.requestFailCount = 0;

        logger.debug('client connect', this.state.url);
        
        return await this.sendConnect();
    }

    disconnect () {
        logger.debug('disconnect');
        this.stopPingTimer();
        this.sendDisconnect();
        this.setConnected(false);
        this.state.connectionId = null;
    }

    getClientState () {
        return this.state;
    }

    // networking

    successRequest () {
        this.state.requestFailCount = 0;
    }

    failRequest (error) {
        logger.debug('fail request', error);
        if (this.state.requestFailCount++ > this.settings.requestRetryCount ||
            (error && error.code == 'CONNECTION_NOT_FOUND')) {
            this.disconnect();
        }
    }

    async ping () {
        try {
            var res = await api.ping(this.state.url, this.state.connectionId);
            this.successRequest();
        }
        catch (err) {
            logger.error('ping() error', err);
            failRequest(err);
        }
    }

    async sendConnect () {
        try {
            var res = await api.connect(this.state.url, crypto.createHmac('sha256', this.settings.secret).digest('hex'));

            if (res.code || !res.connectionId) {
                logger.error('connect() error', res);
                return null;
            }

            this.state.connectionId = res.connectionId;

            this.setConnected(true);
            this.successRequest();

            this.startPingTimer();

            return this.state.connectionId;
        }
        catch (err) {
            logger.error('connect() error', err);
            return null;
        }
    }

    async sendDisconnect () {
        try {
            var res = await api.disconnect(this.state.url, this.state.connectionId);
        }
        catch (err) {
            logger.error('disconnect() error', err);
        }
    }

    async poolNotifications (options) {
        try {
            var res = await api.poolNotifications(this.state.url, this.state.connectionId, options.index, options.maxCount);

            this.successRequest();

            return res;
        }
        catch (err) {
            logger.error('poolNotifications() error', err);

            this.failRequest(err);

            return {
                error: err
            }
        }
    }

    async getNodeState () {
        try {
            var res = await api.nodeState(this.state.url, this.state.connectionId);

            this.successRequest();
            
            return res;
        }
        catch (err) {
            logger.error('getNodeState() error', err);

            this.failRequest(err);
            
            return {
                error: err
            };
        }
    }

    async getTickers () {
        try {
            var res = await api.nodeTickers(this.state.url, this.state.connectionId);

            this.successRequest();
            
            return res;
        }
        catch (err) {
            logger.error('getTickers() error', err);

            this.failRequest(err);

            return {
                error: err
            };
        }
    }

    async nodeOnOff (on) {
        try {
            var res = await api.nodeOnOff(this.state.url, this.state.connectionId, on);

            this.successRequest();
            
            return res;
        }
        catch (err) {
            logger.error('nodeOnOff() error', err);

            this.failRequest(err);

            return {
                error: err
            };
        }
    }

    async nodeExchangeOnOff (exchangeId, on) {
        try {
            var res = await api.nodeExchangeOnOff(this.state.url, this.state.connectionId, exchangeId, on);

            this.successRequest();
            
            return res;
        }
        catch (err) {
            logger.error('nodeExchangeOnOff() error', err);

            this.failRequest(err);

            return {
                error: err
            };
        }
    }
}

module.exports = Client;
