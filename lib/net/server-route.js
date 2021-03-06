// FILE IS GENERATED! DON'T EDIT! Generated by apigen.js
function initRoute(app, api, options) {

    app.get('/api/v1/ping/:connectionId', api.getPing);

    app.get('/api/v1/connect/:secret', api.getConnect);

    app.get('/api/v1/disconnect/:connectionId', api.getDisconnect);

    app.get('/api/v1/nodeTickers/:connectionId/:token', api.getNodeTickers);

    app.get('/api/v1/nodeState/:connectionId/:nodeId', api.getNodeState);

    app.get('/api/v1/poolNotifications/:connectionId/:index/:count', api.getPoolNotifications);

    app.get('/api/v1/nodeOnOff/:connectionId/:onoff', api.getNodeOnOff);

    app.get('/api/v1/nodeExchangeOnOff/:connectionId/:exchangeId/:onoff', api.getNodeExchangeOnOff);

}

module.exports = {
    'initRoute': initRoute
}
