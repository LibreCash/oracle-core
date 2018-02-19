const
    got = require('got'),
    _ = require('lodash'),
    logger = require('../logger');

/**
 * Feetcher class
 */

//+ |error| dns
//+ |error| cerificate
//+ |error| connection timeout
//+ |error| server internal error
//+ |error| bad response
//+ |error| no fields
//+ |error| bad data


class Fetcher {
    constructor () {
        this.loadExchanges(this.defaultExchanges());
    }

    /**
     * Get default exchanges configuration
     * @returns {Array} Exchanges
     */

    defaultExchanges () {
        return [
            {'bitfinex': {currency: 'ETHUSD'}},
            {'bitstamp': {currency: 'ETHUSD'}},
            {'gdax': {currency: 'ETH-USD'}},
            {'gemini': {currency: 'ETHUSD'}},
            {'kraken': {currency: 'ETHUSD'}},
            {'poloniex': {currency: 'USDT_ETH'}},
            {'wex': {currency: 'ETH_USD'}},
        ]
    }

//  https://api.bitfinex.com/v1/pubticker/ETHUSD last_price
//  {"mid":"1294.8","bid":"1294.6","ask":"1295.0","last_price":"1295.0","low":"1256.0","high":"1424.3","volume":"215328.69018037","timestamp":"1515951342.581568"}
//  https://www.bitstamp.net/api/v2/ticker/ethusd last
//  {"high": "1420.00", "last": "1306.00", "timestamp": "1515951418", "bid": "1302.02", "vwap": "1348.84", "volume": "37679.87258557", "low": "1265.00", "ask": "1306.00", "open": "1381.52"}
//  https://api.gdax.com/products/ETH-USD/ticker price
//  {"trade_id":25827002,"price":"1305.77000000","size":"0.00133619","bid":"1305.76","ask":"1305.77","volume":"201863.91197995","time":"2018-01-14T17:38:11.295000Z"}
//  https://api.gemini.com/v1/pubticker/ethusd last
//  {"bid":"1304.79","ask":"1305.20","volume":{"ETH":"57158.6175489","USD":"77289177.7619412032","timestamp":1515951300000},"last":"1304.79"}
//  https://api.kraken.com/0/public/Ticker?pair=ETHUSD .result.XETHZUSD.c.0
//  {"error":[],"result":{"XETHZUSD":{"a":["1285.79000","2","2.000"],"b":["1285.79000","2","2.000"],"c":["1297.68000","2.12331495"],"v":["18073.59845294","36290.69049196"],"p":["1341.51465","1356.90838"],"t":[11904,21058],"l":["1221.00000","1221.00000"],"h":["1404.95000","1451.30000"],"o":"1398.99000"}}}
//  https://poloniex.com/public?command=returnTicker .USDT_ETH.last
//  ..."USDT_ETH":{"id":149,"last":"1285.50000000","lowestAsk":"1285.62374716","highestBid":"1285.50000000","percentChange":"-0.06982633","baseVolume":"29384911.57430339","quoteVolume":"21878.45249318","isFrozen":"0","high24hr":"1423.99999999","low24hr":"1250.01000000"},...
//  https://wex.nz/api/3/ticker/eth_usd eth_usd.last
//  {"eth_usd":{"high":1447.36274,"low":1359.23432,"avg":1403.29853,"vol":5732433.69952,"vol_cur":4095.29444,"last":1372.6855,"buy":1374.36,"sell":1371.02,"updated":1515951773}}

    async fetchBitfinex (exchange) {
        return await this.fetchExchange(exchange, `https://api.bitfinex.com/v1/pubticker/${exchange.options.currency}`, 'last_price');
    }

    async fetchBitstamp (exchange) {
        return await this.fetchExchange(exchange, `https://www.bitstamp.net/api/v2/ticker/${exchange.options.currency}`, 'price');
    }

    async fetchGdax (exchange) {
        return await this.fetchExchange(exchange, `https://api.gdax.com/products/${exchange.options.currency}/ticker`, 'price');
    }

    async fetchGemini (exchange) {
        return await this.fetchExchange(exchange, `https://api.gemini.com/v1/pubticker/${exchange.options.currency}`, 'last');
    }

    async fetchKraken (exchange) {
        return await this.fetchExchange(exchange, `https://api.kraken.com/0/public/Ticker?pair=${exchange.options.currency}`, 'result.XETHZUSD.c.0');
    }

    async fetchPoloniex (exchange) {
        return await this.fetchExchange(exchange, `https://poloniex.com/public?command=returnTicker`, `.${exchange.options.currency}.last`);
    }

    async fetchWex (exchange) {
        return await this.fetchExchange(exchange, `https://wex.nz/api/3/ticker/${exchange.options.currency}`, `.${exchange.options.currency}.last`);
    }

    /**
     * Fetch single exchange
     * @param {FetcherExcange} exchange Fetcer exchange object
     * @param {String} url Url
     * @param {String} field JSON object nested field (split by '.')
     */

    async fetchExchange (exchange, url, field) {
        var result = await this.fetch(url);

        // todo: structure single symbol for all exchanges
        exchange.symbol = exchange.options.currency;

        exchange.err = undefined;
        exchange.lastest = 0;
        exchange.updateTime = new Date().toISOString();
        // todo: structure timestamp
        exchange.timestamp = (
            result.timestamp ? parseInt(result.timestamp) :
            result.time ? new Date(result.time).getTime() :
            result.updated ? parseInt(result.updated) :
            new Date().toISOString().toString()
        );
        
        if (result.err) {
            exchange.err = result.err;
            return;
        }

        // extract result field [

        var fields = field.split('.');

        var v = result;

        fields.forEach(f=>{
            if (v)
                v = v[f];
        });

        if (!v) {
            exchange.err = 'FETCHER_NO_FIELD';
            return;
        }

        // extract result field ]

        var n = NaN;
        
        if (typeof v == 'number')
            n = v;
        else if (typeof v == 'string') {
            n = parseFloat(v);
        }

        if (n == NaN) {
            exchange.err = 'FETCHER_BAD_DATA';
            return;
        }

        exchange.lastest = n
    }

    /**
     * Load exchanges
     * @param options Exchanges list
     */

    loadExchanges (options) {
        var exchangesFetchers = {
            'bitfinex': this.fetchBitfinex,
            'bitstamp': this.fetchBitstamp,
            'gdax': this.fetchGdax,
            'gemini': this.fetchGemini,
            'kraken': this.fetchKraken,
            'poloniex': this.fetchPoloniex,
            'wex': this.fetchWex
        }

        this.exchanges = [];
        
        options.forEach(exchange=>{
            var name = Object.keys(exchange)[0];
            var fetcher = exchangesFetchers[name];

            // todo: review, UUID is prefered
            var id = this.exchanges.length;

            if (!fetcher) {
                this.exchanges.push({id, name, err: 'FETCHER_BAD_CONFIG', enabled: false});
                return;
            }

            this.exchanges.push({id, name, fetcher, options: exchange[name], enabled: true});
        });
    }

    /**
     * Get exchanges
     * @returns {Array} Exchanges list
     */

    getExchanges () {
        return this.exchanges;
    }

    /**
     * Get exchange by id
     * @param {Number} id Id
     * @returns {Exchange} Exchange
     */

    getExchangeById (id) {
        if (typeof id !== 'number' || id < 0 || id >= this.exchanges.length)
            return;
        var exchange = _.find(this.exchanges, (exchange)=>{ 
            return exchange.id == id;
        });
        return exchange;
    }

    /**
     * Fetch all active exchanges
     */

    async fetchAll () {
        var result = await Promise.all(this.exchanges.map(async (exchange)=>{
            if (exchange.enabled) {
                logger.debug(`fetch ${exchange.name}`);
                await exchange.fetcher.bind(this)(exchange);
                return {
                    name: exchange.name,
                    symbol: exchange.symbol,
                    lastest: exchange.lastest,
                    updateTime: exchange.updateTime,
                    timestamp: exchange.timestamp,
                    err: exchange.err
                }
            }
            else {
                logger.debug(`skip fetcher ${exchange.name}`);
                return {
                    name: exchange.name,
                    symbol: exchange.symbol,
                    lastest: 0,
                    updateTime: exchange.updateTime,
                    timestamp: exchange.timestamp,
                    err: exchange.err || 'FETCHER_DISABLED'
                }
            }
        }));

//        return this.exchanges;
        return result;
    }

    async fetch (url) {
        const request = got(url, {json:true});
//        const request = got(url);
        try {
            var response = (await request).body;
            return response
        }
        catch (e) {
//            console.log(e);
//            console.log(request);
            if (e.name == 'ParseError')
                return {err: "FETCHER_PARSE_ERROR", url};
            
            if (e.statusCode == 400)
                return {err: "FETCHER_BAD_REQUEST", url};
            else if (e.statusCode == 403)
                return {err: "FETCHER_FORBIDDEN", url};
            else if (e.statusCode == 404)
                return {err: "FETCHER_NOT_FOUND", url};
            else if (e.statusCode == 500)
                return {err: "FETCHER_INTERNAL_SERVER_ERROR", url};
            else if (e.statusCode == 503)
                return {err: "FETCHER_SERVICE_TEMPORARILY_UNAVAILABLE", url};
                
            switch (e.code) {
                case 'ENOTFOUND':
                    return {err: "FETCHER_DOMAIN_NOT_FOUND", url};
                case 'CERT_HAS_EXPIRED':
                    return {err: "FETCHER_CERTIFICATE_HAS_EXPIRED", url};
                case 'ECONNREFUSED':
                    return {err: "FETCHER_CONNECTION_REFUSED", url};
                case 'DEPTH_ZERO_SELF_SIGNED_CERT':
                    return {err: "FETCHER_CERTIFICATE_SELF_SIGNED", url};
                case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
                    return {err: "FETCHER_CERTIFICATE_BAD_SIGNATURE", url};
                case 'EPROTO':
                    return {err: "FETCHER_BAD_PROTOCOL", url};
                default:
                    return {err: "FETCHER_ERROR", url, e: e};
            }
        }
    }

    /**
     * Test fetch
     * @todo move to tests
     */

    async testFetch (url) {
        console.log('testFetch', url);
        var result = await this.fetch(url);
        console.log(result);
    }

    /**
     * Test
     * @todo move to tests
     */

    async test() {
        // no url -> FETCHER_DOMAIN_NOT_FOUND
        await this.testFetch('qewqwerwer');
        await this.testFetch('this-is-not-url!');
        // expired cert -> FETCHER_CERTIFICATE_HAS_EXPIRED
        await this.testFetch('https://expired.badssl.com/');
        // wrong host -> FETCHER_ERROR
        await this.testFetch('https://wrong.host.badssl.com/');
        // self signed -> FETCHER_SELF_SIGNED_CERTIFICATE
        await this.testFetch('https://self-signed.badssl.com/');
        // untrusted root -> FETCHER_CERTIFICATE_BAD_SIGNATURE
        await this.testFetch('https://untrusted-root.badssl.com/');
        // revoked -> OK
//        await this.testFetch('https://revoked.badssl.com/');

        // pinning test -> OK
//        await this.testFetch('https://pinning-test.badssl.com/');
        // no common name -> OK
//        await this.testFetch('https://no-common-name.badssl.com/');
        // no subject -> FETCHER_ERROR
        await this.testFetch('https://no-subject.badssl.com/');
        // incomplete chain -> FETCHER_CERTIFICATE_BAD_SIGNATURE
        await this.testFetch('https://incomplete-chain.badssl.com/');

        // sha1 intermediate -> OK
//        await this.testFetch('https://sha1-intermediate.badssl.com/');
        // client cert missing -> FETCHER_BAD_REQUEST
        await this.testFetch('https://client-cert-missing.badssl.com/');

        // mixed script -> OK?
//        await this.testFetch('https://mixed-script.badssl.com/');
        // very badssl -> OK?
//        await this.testFetch('https://very.badssl.com/');

        // cbc -> OK?
//        await this.testFetch('https://cbc.badssl.com/');
        // rc4 md5 -> FETCHER_BAD_PROTOCOL
        await this.testFetch('https://rc4-md5.badssl.com/');
        // rc4 -> FETCHER_BAD_PROTOCOL
        await this.testFetch('https://rc4.badssl.com/');
        // 3des -> FETCHER_BAD_PROTOCOL
        await this.testFetch('https://3des.badssl.com/');
        // null -> FETCHER_BAD_PROTOCOL
        await this.testFetch('https://null.badssl.com/');

        // mozilla old -> OK?
//        await this.testFetch('https://mozilla-old.badssl.com/');

        // mozilla intermediate -> OK?
//        await this.testFetch('https://mozilla-intermediate.badssl.com/');

        // dh480 -> FETCHER_BAD_PROTOCOL
        await this.testFetch('https://dh480.badssl.com/');
        // dh512 -> FETCHER_BAD_PROTOCOL
        await this.testFetch('https://dh512.badssl.com/');
        // dh1024 -> OK
//        await this.testFetch('https://dh1024.badssl.com/');

        // dh small subgroup -> OK?
//        await this.testFetch('https://dh-small-subgroup.badssl.com/');
        // dh composite -> OK?
//        await this.testFetch('https://dh-composite.badssl.com/');

        // static rsa -> OK
//        await this.testFetch('https://static-rsa.badssl.com/');

        // tls v1.0 -> OK
//        await this.testFetch('https://tls-v1-0.badssl.com:1010/');
        // tls v1.1 -> OK
//        await this.testFetch('https://tls-v1-1.badssl.com:1011/');

        // invalid expected sct -> OK?
//        await this.testFetch('https://invalid-expected-sct.badssl.com/');

        // superfish -> FETCHER_CERTIFICATE_BAD_SIGNATURE
        await this.testFetch('https://superfish.badssl.com/');
        // edellroot -> FETCHER_CERTIFICATE_BAD_SIGNATURE
        await this.testFetch('https://edellroot.badssl.com/');
        // dsdtestprovider -> FETCHER_CERTIFICATE_BAD_SIGNATURE
        await this.testFetch('https://dsdtestprovider.badssl.com/');
        // preact cli -> FETCHER_CERTIFICATE_BAD_SIGNATURE
        await this.testFetch('https://preact-cli.badssl.com/');
        // webpack dev server -> FETCHER_CERTIFICATE_BAD_SIGNATURE
        await this.testFetch('https://webpack-dev-server.badssl.com/');

        // sha1-2016 -> FETCHER_CERTIFICATE_HAS_EXPIRED
        await this.testFetch('https://sha1-2016.badssl.com/');
        // sha1-2017 -> FETCHER_CERTIFICATE_HAS_EXPIRED
        await this.testFetch('https://sha1-2017.badssl.com/');

        console.log('Fetcher tests done');
    }
}

module.exports = Fetcher;
