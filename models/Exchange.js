const mongoose = require('mongoose');
var Schema = mongoose.Schema;

/** @title Schema Exchange for lightnode aggregation
 * @param name String
 */

var exchangeSchema = new Schema({
    name: { type: String, required: true, unique: true },
});

/**
 * @title Create model Exchange
 * @param conn mongoose connection
 */

module.exports.createModel = conn => {
    return conn.model('Exchange', exchangeSchema);
}
