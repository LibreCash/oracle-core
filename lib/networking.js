const 
    https = require('https'),
    logger = require('../lib/logger');

 // todo: check connection interval

var internetConnected = false;

async function checkInternetConnection() {
    servers = [
        'https://google.com/'
    ]

    logger.debug('check internet connection', servers);

    await https.get(server, (resp)=>{
        internetConnected = true;
        logger.debug('internet connected');
    }).on('error', (err)=>{
        internetConnected = false;
        logger.debug('internet disconnected');
    })
    return internetConnected;
}

module.exports = {
    checkInternetConnection: checkInternetConnection
}
