const
    delay = require('../helpers').delay;

class Connection {

    constructor(id, server, req) {
        this.id = id.toString();
        this.server = server;
        this.options = this.server.options;
        this.notificationsMax = 500;
        this.lastNotificationIndex = 0;
        this.pingTimerStarted = false;
        this.ip = req.ip;
    }

    get node () {
        return this.server.getNode();
    }
    
    // ping/pong

    startPingTimer () {
        this.isPingTimerOut = false;
        if (!this.pingTimerStarted) {
            this.pingTimerStarted = true;

            this.pingTimer();
        }
    }
    
    pingTimer () {
        if (!this.pingTimerStarted)
            return;
        if (this.isPingTimerOut) {
            this.disconnect();
            this.pingTimerStarted = false;
            return;
        }

        this.isPingTimerOut = true;

        delay(this.options.pingTimeout * 1000).then(()=>this.pingTimer.bind(this));
    }
    
    onPing () {
        this.isPingTimerOut = false;
    }

    // connect/disconnect

    disconnect() {
        this.server.deleteConnection(this);
        this.onClientDisconnected();
    }
    
    onClientConnected () {
        this.node.onClientConnected(this);
        this.startPingTimer();
    }

    onClientDisconnected () {
        this.node.onClientDisconnected(this);
    }

    // notifications

    getNotifications (index, count) {
        // todo: check index, count

        var notifications = this.server.getNotifications();

        if (index < 0) {
            index = this.lastNotificationIndex;
        }

        if (count > this.notificationsMax) {
            count = this.notificationsMax;
        }

        var selected = notifications.slice(index, index + count);

        this.lastNotificationIndex += selected.length;

        return {
            'notifications': selected,
            'total': notifications.length
        };
    }
}

module.exports = Connection;
