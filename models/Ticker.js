const mongoose = require('mongoose');
var Schema = mongoose.Schema;

/** @title Schema Ticker for lightnode aggregation
 * @param ObjectId exchange
 * @param String symbol Exchagne symbol
 * @param Number lastest Lastest price
 * @param Date updateTime Fetcher update time
 * @param String timestamp Timestamp from exchange
 * @param {*} err Error
 */

var tickerSchema = new Schema({
    exchange: { type: Schema.Types.ObjectId, ref: 'exchangeSchema' },
    symbol: { type: String, required: true },
    lastest: { type: Number, required: true },
    updateTime: { type: String, required: true },
    timestamp: { type: String, required: true },
    err: { type: String }
});

/**
 * @title Create model Ticker
 * @param conn mongoose connection
 */

module.exports.createModel = conn => {
    return conn.model('Ticker', tickerSchema);
}
