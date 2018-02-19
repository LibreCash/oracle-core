const mongoose = require('mongoose');
var Schema = mongoose.Schema;

/** @title Schema Notification
 * @param nodeId String
 * @param date Date
 * @param code String
 * @param object String
 */

var notificationSchema = new Schema({
    nodeId: { type: String, required: true },
    date: { type: Date, required: true },
    code: { type: String, required: true },
    object: { type: mongoose.Schema.Types.Mixed },
});

/**
 * @title Create model Notification
 * @param conn mongoose connection
 */

module.exports.createModel = conn => {
    return conn.model('Notification', notificationSchema);
}
