const
    EventEmitter = require('events'),
    path = require('path'),
    fs = require('fs'),
    _ = require('lodash'),
    crypto = require('crypto'),
    logger = require('../logger'),
    Web3Client = require('./web3-client');

// |online|             1. no web3 connection -> notify error, select another node
// |online|             2. no new blocks
// |checkSenderWallet|  3. sender wallet not present
// |checkSenderWallet|  4. sender wallet is locked
// |checkSenderWallet|  5. sender wallet bad password
// |checkSenderWallet|  6. sender wallet no balance
// |transaction|        7. transaction sending error
// |transaction|        8. send transaction bad result
// |config|             9. bad ABI
// |config|             10. bad smart contract address
// |config|             11. smart contract no address or gas limit

// |deploy|             x1. create wallet if not exists

// |init|               I1. unlock wallet at startup

class Eth extends EventEmitter {
    constructor () {
        super();

        this.clients = [];
        this.clientsMap = {};

        this.initState();
    }

    /**
     * Init
     * @param {EthOptions} options Eth options
     */

    init (options, callback) {
        this.options = options;
        this.callback = callback;
        try {
            let abiArray = this.loadAbi(options.abiPath);
            if (!abiArray)
                return;

            this.state.activeClient = 'infura';

            var opts = {
                ...options,
                abiArray
            };

            this.connect('web3', options.web3url, opts);
            this.connect('infura', options.infuraUrl, opts);
        }
        catch (e) {
            this.notifyError('ETH_INIT_ERROR', e);
        }
    }

    /**
     * Init state
     */

    initState () {
        this.state = {
            activeClient: null,
            clients: [],
            events: [],
            lastPrice: 0,
            lastUpdate: null
        }
    }

    /**
     * Return state
     * @returns {EthState} Eth state
     */

    getState () {
        // todo: review

        this.state.status = _.clone(this.options);
        delete this.state.status['password'];
        this.state.status["abiHashMD5"] = this.abiHash;

        this.state.clients = [];
        for (var name in this.clientsMap) {
            var client = this.clientsMap[name];

            var clientState = {};

            clientState.name = name;
            clientState.url = client.url;

            clientState.connected = client.web3Connected;
            clientState.running = client.running;
            clientState.lastError = client.lastError;
            clientState.locked = client.locked;
            clientState.balance = client.balance;

            clientState.active = this.state.activeClient == name;
            clientState.lastPrice = this.state.lastPrice;
            clientState.lastUpdate = this.state.lastUpdate;
    
            this.state.clients.push(clientState);
        }

        return this.state;
    }

    /**
     * Connect
     * @param {String} name Name
     * @param {String} url Web3 url
     * @param {ConnectOptions} options Options
     */

    async connect (name, url, options) {
        const client = new Web3Client(name);
        
        this.clients.push(client);
        this.clientsMap[name] = client;

        client.on('event', this.onClientEvent.bind(this));
        await client.init(url, options);
    }

    /**
     * Callback from web3 client
     * @param {*} info
     */

    onClientEvent (...info) {
        var name = info[0];
        var code = info[1];
        if (code == 'WEB3CLIENT_CONNECTED') {
            this.state.activeClient = name;
        }
        else if (code == 'WEB3CLIENT_DISCONNECTED') {
            this.state.activeClient = 'infura';
            this.notifyError(...info);
        }
        else if (code == 'WEB3CLIENT_ERROR') {
            this.notifyError(...info);
        }
        else if (code == 'NewOraclizeQuery') {
            this.callback(code, info[2], info[3]);
        }
        else {
            this.notifyError(...info);
        }
    }

    // check wallet

    checkSenderWallet () {

    }

    /**
     * Load abi from path
     * @param {String} abi ABI path
     * @returns {AbiArray} ABI array
     */

    loadAbi (abiPath) {
        try {
            let abiArrayPath = path.resolve(abiPath);
            let abiData = fs.readFileSync(abiArrayPath);
            this.abiHash = crypto.createHash('md5').update(abiData).digest("hex");
            let abiArray = JSON.parse(abiData);
            return abiArray;
        }
        catch (e) {
            this.notifyError('ETH_ERROR_READ_ABI', e);
            return null;
        }
    }

    /**
     * Push to blockchain
     */

    pushToBlockchain (avg) {
        var client = this.clientsMap[this.state.activeClient];
        if (!client) {
            logger.error('Unable push to blockchain. Active client is undefined.');
            return 
        }
        avg = avg * 1000;
        client.contractPushToBlockchain(avg, {
            from: this.options.from,
            gasLimit: this.options.gasLimit
        });

        this.state.lastPrice = avg;
        this.state.lastUpdate = new Date().toISOString();
    }

    /**
     * Notify error
     * @param {*} err Error
     */

    notifyError (...err) {
        this.state.events.push([...err]);
        logger.error(...err);
        this.emit('error', ...err);
    }
}

module.exports = Eth;
