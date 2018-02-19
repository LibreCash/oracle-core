const
    logger = require('./logger'),
    nodemailer = require('nodemailer');

// todo: refactor common notifications for mail & slack (like in alarm)

class Mailer {

    /**
     * Constructor
     */

    constructor () {
    }

    /**
     * Setup
     * @param {MailerOptions} options Mailer options
     */

    async setup (options) {
        if (!options || !('useTestAccount' in options)) {
            logger.error('mailer bad options');
            return;
        }

        this.options = options;

        if (!options.useTestAccount) {
            await new Promise(resolve => {
                nodemailer.createTestAccount((err, account) => {
                    logger.log(account);

                    var optionsTransport = {
                        host: options.host,
                        port: options.port,
                        secure: options.secure, // true for 465, false for other ports
                        auth: {
                            user: account.user, // generated ethereal user
                            pass: account.pass  // generated ethereal password
                        }
                    };
                    this.setupTransport(optionsTransport);
                    resolve();
                });
            });
        }
        else {
            this.setupTransport(options);
        }
    }

    /**
     * Setup transport
     * @param {TransportOptions} options Nodemailer transport options
     */

    setupTransport (options) {
        this.transporter = nodemailer.createTransport(options);
    }

    /**
     * Send mail
     * @param {SendMailOptions} options Nodemailer send mail options
     */

    sendMail (mailOptions) {
        logger.info('send mail', mailOptions);
        
        this.transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                return logger.error(error);
            }
            logger.log('Message sent: %s', info.messageId);
            // Preview only available when sending through an Ethereal account
            logger.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
        });
    }

    /**
     * Send startup notification
     */

    sendStartup () {
        this.sendLibreMail('LibreNode started up ✔',
            `LibreNode started at ${(new Date).toString()}`);
    }

    /**
     * Send ticker overflow notification
     * @param {*} err Error info
     */

    sendNodeTickerOverflow (err) {
        this.sendLibreMail('LibreNode ERROR: ticker overflow',
            `LibreNode error\n${JSON.stringify(err)}`);
    }

    /**
     * Send ethereum message
     * @param {*} msg Message
     */

    sendEthereumMessage (msg) {
        this.sendLibreMail('LibreNode Ethereum info',
            `LibreNode ethereum info\n${JSON.stringify(msg)}`);
    }

    /**
     * Send ethereum error
     * @param {*} err Error info
     */

    sendEthereumError (err) {
        this.sendLibreMail('LibreNode Ethereum error', 
            `LibreNode ethereum error\n${JSON.stringify(err)}`);
    }

    /**
     * Send libre mail
     * @param {String} subject Subject
     * @param {String} text Text
     */

     sendLibreMail (subject, text) {
        let mailOptions = {
            from: this.options.from, // sender address
            to: this.options.to, // list of receivers
            subject, // Subject line
            text: text, // plain text body
            html: `<b>${text}</b>` // html body
        };

        this.sendMail(mailOptions);
     }
};

module.exports = Mailer;
