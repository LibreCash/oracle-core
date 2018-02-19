const mongoose = require('mongoose');
var Schema = mongoose.Schema;

/** @title Schema Action for system audit
 * @param {String} name Action name
 * @param {String} ip IP 
 * @param {String} user User
 * @param {Date} Date Date
 */

var actionSchema = new Schema({
    name: { type: String, required: true },
    ip: { type: String, required: true },
    user: { type: String, required: true },
    date: { type: Date, required: true }
});

/**
 * @title Create model Action
 * @param conn mongoose connection
 */

module.exports.createModel = conn => {
    return conn.model('Action', actionSchema);
}
