const mongoose = require('mongoose');
var Schema = mongoose.Schema;

/** @title Schema LightNodeState is state of lightnode
 * @param nodeId String
 * @param startTime Date
 * @param uptime Date
 * @param lastUpdate Date
 */

var lightNodeStateSchema = new Schema({
    nodeId: { type: String },
    startTime: { type: Date, required: true },
    uptime: { type: Date, required: true },
    lastUpdate: { type: Date, required: true }
});

/**
 * @title Create model LightNodeState
 * @param conn mongoose connection
 */

module.exports.createModel = conn => {
    return conn.model('LightNodeState', lightNodeStateSchema);
}
