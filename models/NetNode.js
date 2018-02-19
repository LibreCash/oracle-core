const mongoose = require('mongoose');
var Schema = mongoose.Schema;

/** @title Schema NetNode for masternode remote nodes configuration
 * @param name String
 * @param host String
 * @param port String
 * @param state Enum
 * @param error String
 */

var netNodeSchema = new Schema({
    name: { type: String },
    host: { type: String },
    port: { type: Number },
    state: { 
        type: String,
        enum: ['online', 'offline', 'banned'],
        default: ['offline'],
        required: true
    },
    error: { type: String }
});

/**
 * @title Create model NetNode
 * @param conn mongoose connection
 */

module.exports.createModel = conn => {
    return conn.model('NetNode', netNodeSchema);
}
