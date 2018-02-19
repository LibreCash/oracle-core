const 
    logger = require('./logger'),
    Slackbot = require('slackbots');

class Slack {

    /**
     * Constructor
     * @param {SlackOptions} options
     */

    constructor (options) {
        if (!options || !options.token || options.token === '' || !options.channel) {
            logger.error('Slack token or channel is none. Slack disabled.');
            return;
        }

        this.bot = new Slackbot({
            token: options.token,
            name: options.name || 'noname'
        });
        this.channel = options.channel;
    }

    /**
     * Send message
     * @param {String} message Message
     * @param {*} params Slackbot params
     */

    send (message, params) {
        this.bot && this.bot.postMessageToChannel(this.channel, message, params);
    }
}

module.exports = Slack;
