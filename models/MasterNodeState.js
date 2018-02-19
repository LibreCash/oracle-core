const mongoose = require('mongoose');
var Schema = mongoose.Schema;

/** @title Schema MasterNodeState is state of masternode
 * @param nodeId String
 * @param startTime Date
 * @param uptime Date
 * @param lastUpdate Date
 */

var masterNodeStateSchema = new Schema({
    id: { type: String },
    startTime: { type: Date, required: true },
    uptime: { type: Date, required: true },
    lastUpdate: { type: Date, required: true },
    lightNodesTotal: { type: Number, required: true },
    lightNodesAlive: { type: Number, required: true },
});

/**
 * @title Create model MasterNodeState
 * @param conn mongoose connection
 */

module.exports.createModel = conn => {
    return conn.model('MasterNodeState', masterNodeStateSchema);
}
