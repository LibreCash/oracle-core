const
    _ = require('lodash'),
    Client = require('../net/client');

class MasternodeNode {
    constructor (id, options) {
        this.id = id;
        this.owner = this;
        this.connected = false;
        this.updateTimerOn = false;
        this.options = _.clone(options);
        this.avarageRate = 0;
        this.tickers = [];
        this.lastTickerIndex = 0;
        this.hasNewData = function () {
            return this.lastTickerIndex < this.tickers.length;
        }
        this.error = null;
        this.state = {};

        this.client = new Client(options);
    }
}

module.exports = MasternodeNode;
