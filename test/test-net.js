const 
    logger = require('../lib/logger'),
    LightNode = require('../lib/node/lightnode'),
    MasterNode = require('../lib/node/masternode');

var options = require('../config/default.json');
    
var optionsLightnode0 = options.lightnode0;
var optionsLightnode1 = options.lightnode1;
var optionsMasternode0 = options.masternode0;
optionsLightnode0.smartContract = options.smartContract;
optionsLightnode1.smartContract = options.smartContract;
optionsMasternode0.smartContract = options.smartContract;

const lightNode0 = new LightNode('L0-TEST');
lightNode0.start(optionsLightnode0);

//Warning! Don't use directly second instance. Use cli/lightnode
//const lightNode1 = new LightNode(2);
//lightNode1.start(optionsLightnode1);

const spawn = require('child_process').spawn;

var child1 = spawn('node', ['cli/lightnode-cli.js', '--section', 'lightnode1']);
//var b = a.stdout.toString();
//var c = a.stderr.toString();
child1.stdout.on('data', function(data) {
/*    try {
        console.log('light1:', JSON.parse(data));
    } catch (e) {
        console.log('light1:', data.toString());
    }*/
//    console.log('light1:', data.toString());
});
child1.stderr.on('data', function(data) {
//    console.log(data.toString());
});

(async () => {
    const masterNode = await new MasterNode(optionsMasternode0);

    masterNode.on('finished', () => {
        logger.info('master node finish');
    });
    masterNode.on('nodeConnected', () => {
        logger.info('node connected');
    });
    masterNode.on('nodeDisconnected', () => {
        logger.info('node disconnected');
    });

    masterNode.start();
})();

