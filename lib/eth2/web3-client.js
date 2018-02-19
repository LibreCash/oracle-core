const
    EventEmitter = require('events'),
    delay = require('../helpers').delay,
    Web3 = require('web3'),
    logger = require('../logger');

class Web3Client extends EventEmitter {

    /**
     * Constructor
     */

    constructor (name) {
        super();

        this.name = name;
        this.web3Connected = false;
        this.balance = -1;
        this.lastError = null;
        this.running = false;
        this.locked = true;
    }

    /**
     * Init
     * @param {String} url Web3 url
     * @param {Web3ClientOptions} options Options
     */

    async init (url, options) {
        try {
            this.url = url;
            this.options = options;
            if (url.indexOf('ws:') != -1)
                this.initWebSocketProvider(url);
            else
                this.initHttpProvider(url);
            
            this.startTimer();

            this.initBlockchain();
            this.initContract(options);
            await this.initWallet(options);
        }
        catch (e) {
            this.notifyError('WEB3CLIENT_ERROR_INIT', e.toString());
        }
    }

    /**
     * Init HTTP provider
     * @param {String} url
     */

    initHttpProvider (url) {
        this.web3 = new Web3(new Web3.providers.HttpProvider(url));
        this.web3Http = true;
    }

    /**
     * Init WebSocket provider
     * @param {String} url
     */

    initWebSocketProvider (url) {
        this.web3Http = false;

        var self = this;
        
        // destory old provider for reconnect
        
        if (this.web3Provider) {
            this.web3Provider.removeAllListeners();
            this.web3Provider.reset();
        }
        
        // create new provider

        var web3Provider = new Web3.providers.WebsocketProvider(url);
        this.web3Provider = web3Provider;
        web3Provider.on('connect', ()=>{
            self.web3Connected = true;
            self.notify('WEB3CLIENT_CONNECTED');
        });
        web3Provider.on('end', ()=>{
            if (!self.web3FirstRunDone || self.web3Connected)
                self.notify('WEB3CLIENT_DISCONNECTED');
            self.web3Connected = false;
            self.web3FirstRunDone = true;
            self.web3NeedWebsocketReconnect = true;
        });
        web3Provider.on('error', (e)=>{
            if (!self.web3FirstRunDone || self.web3Connected)
                self.notifyError('WEB3CLIENT_ERROR', e);
        });
        this.web3 = this.web3 || new Web3();
        this.web3.setProvider(web3Provider);
    }

    /**
     * Init blockchain
     */

    initBlockchain() {
        if (this.web3Http) {
            // HTTP no events, recheck manually
        }
        else {
            this.web3.eth.subscribe('newBlockHeaders', (error, event) => {
                // check by timer
                logger.debug(this.name, 'newBlockHeaders', event, error);
            });
        }
    }

    /**
     * Init contract
     * @param {Web3ClientOptions} options
     */

    initContract (options) {
        this.contract = new this.web3.eth.Contract(options.abiArray, options.address);

        this.contractAttachEvents();
    }

    /**
     * Attach contract events
     */

    contractAttachEvents () {
        if (this.web3Http) {
            // HTTP no events, recheck manually
        }
        else {
            // WebSocket support events
            this.contract.events.NewOraclizeQuery({}, (error, event) => {
                this.notify('NewOraclizeQuery', error, event);
            });
        }
    }

    /**
     * Get past events manually
     */

    async contractGetPastEvents() {
        this.contract && await this.contract.getPastEvents('NewOraclizeQuery', //'allEvents',
            {fromBlock: 0,  toBlock: 'latest'},
            (error, oraclizeQueries) => {
                logger.debug('getPastEvents', error, oraclizeQueries);
                oraclizeQueries.forEach(query => {
                    this.notify('NewOraclizeQuery', error, event);
                });
        });
    }

    /**
     * Contract push to blockchain
     * @param {Number} avg 
     * @param {*} options 
     */

    async contractPushToBlockchain (avg, options) {
        await this.checkAccountBalance(options.from);
        if (this.running) {
            var transaction = await this.contract.methods.__callback(avg).send({
                from: options.from, 
                gas: options.gasLimit
            });
            this.notify('contractPushToBlockchain', transaction);

            if (transaction.status === '0x0')
                this.notifyError('WEB3CLIENT_TRANSACTION_FAIL', transaction);
        }
        else {
            this.notifyError('WEB3CLIENT_UNABLE_TO_PUSH_CONTRACT_NOT_RUNNING');
        }
    }

    /**
     * Start timer
     */

    startTimer () {
        this.timerOn = true;
        this.timerUpdate();
    }

    /**
     * Stop timer
     */

    stopTimer () {
        this.timerOn = false;
    }

    /**
     * Timer update
     */

    timerUpdate () {
        if (!this.timerOn)
            return;

        if (this.web3Provider) {
            // check websocket reconnect
            if (this.web3NeedWebsocketReconnect) {
                this.web3NeedWebsocketReconnect = false;
                logger.debug('try websocket reconnect');
                this.initWebSocketProvider(this.url);
            }
        }
        else {
            // check http get event
        }
        
        if (this.web3Http) {
            this.contractGetPastEvents();
        }

        delay(this.options.updateTimeout * 1000).then(this.timerUpdate.bind(this));
    }


    /**
     * Init wallet
     * @param {*} options Options
     */

    async initWallet (options) {
        await this.checkSenderWallet(options);
    }

    /**
     * Check sender wallet
     * @param {*} options Options
     */
    
    async checkSenderWallet (options) {
        if (!options || !options.from) {
            this.notifyError('WEB3CLIENT_ERROR_FROM_ADDRESS_NOT_PRESENT', address);
            return
        }

        let address;

        if (this.name != 'infura') {
            address = await this.web3.eth.getCoinbase();

            if (!address) {
                this.notifyError('WEB3CLIENT_ERROR_COINBASE_ADDRESS_NOT_PRESENT', address);
                address = options.from;
            }
        }
        else {
            address = options.from;
        }

        // warning if don't match address 
        if (address.toLowerCase() != options.from.toLowerCase()) {
            this.notifyError('WEB3CLIENT_ERROR_COINBASE_NOT_MATCH_FROM', address, options.from);
            address = options.from;
        }

        this.address = address;

        this.running = true;

        await this.checkAccountBalance(address);

        await this.checkAccountLockedAndUnlock(address);
    }

    /**
     * Check account balance
     * @param {Address} address Address
     * @returns {Boolean} True if present
     */

    async checkAccountBalance (address) {
        let balance = await this.web3.eth.getBalance(address);
        this.balance = balance;
        if (balance < this.options.minimumBalance) {
            this.notifyError('WEB3CLIENT_ERROR_ACCOUNT_LOW_BALANCE', account, balance);
            this.running = false;
            return false;
        }
        return true;
    }

    /**
     * Check account locked and unlock if true
     * @param {*} address 
     * @returns {Boolean} True if unlocked
     */

    async checkAccountLockedAndUnlock (address) {
        if (this.name == 'infura') {
            this.notifyError('WEB3CLIENT_ERROR_ACCOUNT_IS_LOCKED', address);
            this.running = false;
            return false;
        }

        var locked = !await this.isAccountUnlocked(address);
        this.locked = locked;
        if (locked) {
            await this.web3.eth.personal.unlockAccount(address, this.options.password, 999999);
            var locked = !await this.isAccountUnlocked(address);
            this.locked = locked;
            if (locked) {
                this.notifyError('WEB3CLIENT_ERROR_ACCOUNT_IS_LOCKED', address);
                this.running = false;
                return false;
            }
        }
        return true;
    }

    /**
     * Is account unlocked
     * @param {Address} address Address
     * @returns {Boolean} True if unlocked
     */

    async isAccountUnlocked (address) {
        try {
            await web3.eth.sign("", address);
        } catch (e) {
            return false;
        }
        return true;
    }

    /**
     * Create wallet
     */

    createWallet () {
        this.web3.eth.accounts.create();
    }

    /**
     * Get info
     */

    async getInfo () {
        var defaultBlock = web3.eth.defaultBlock;
        var protocolVersion = await web3.eth.getProtocolVersion();
        var syncing = await web3.eth.isSyncing();
        var account = await web3.eth.getCoinbase();
    }

    async fullApiTest() {
        // eth
        // web3.eth.isMining()
        // web3.eth.getHashrate()
        // web3.eth.getGasPrice()
        // web3.eth.getAccounts()
        // web3.eth.getBlockNumber()
        // web3.eth.getBalance(account)
        // web3.eth.getStorageAt(account, 0)
        // web3.eth.getCode(address)
        // web3.eth.getBlock(0|hash)
        // web3.eth.getBlockTransactionCount(0|hash)
        // web3.eth.getUncle(0|hash, 0)
        // web3.eth.getTransaction(transactionHash)
        // web3.eth.getTransactionFromBlock(0|hash, 0)
        // web3.eth.getTransactionReceipt(transactionHash)
        // web3.eth.getTransactionCount(address)
        // web3.eth.sendTransaction(transactionObject)
        // web3.eth.sendSignedTransaction(signedTransactionData)
        // web3.eth.sign(dataToSign, address)
        // web3.eth.signTransaction(transactionObject, address)
        // web3.eth.estimateGas(callObject)
        // web3.eth.getPastLogs(options)
        // web3.eth.getCompilers()
        // web3.eth.compile.solidity(sourceCode)
        // web3.eth.compile.lll(sourceCode)
        // web3.eth.compile.serpent(sourceCode)
        // web3.eth.getWork()
        // web3.eth.submitWork(nonce, powHash, digest)
        // eth.subscribe
        // web3.eth.subscribe(type)
        // web3.eth.clearSubscriptions()
        // web3.eth.subscribe('pendingTransactions')
        // web3.eth.subscribe('newBlockHeaders')
        // web3.eth.subscribe(“syncing”)
        // web3.eth.subscribe(“logs”)
        // web3.eth.personal.newAccount(pass)


    }

    /**
     * Notify
     * @param {*} msg Message
     */

    notify (...msg) {
        logger.debug(this.name, ...msg);
        this.emit('event', this.name, ...msg);
    }

    /**
     * Notify error
     * @param {*} error Error
     */

    notifyError (...err) {
        this.lastError = Array.isArray(err) ? err[0] : err;
        logger.error(this.name, ...err);
        this.emit('event', this.name, ...err);
    }
}

module.exports = Web3Client
