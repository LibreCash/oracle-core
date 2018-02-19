const 
    fs = require('fs'),
    logger = require('../logger');


async function fetch() {
//    logger.debug(__dirname);
    var fetchersList = fs.readdirSync(__dirname+'/../../fetchers');
	var result = await Promise.all(fetchersList.map(async (file)=>{
        try {
            logger.debug(`fetch ${file}`);
            //non-test
            //fetcher = require(`./fetchers/${file}`);
            fetcher = require(__dirname+`/../../fetchers/${file}`);

            var data = await fetcher();
            data.id = file;
            return data;
        }
        catch (error) {
            logger.error(`error processing fetcher ${file}`);
            logger.error(error);
            
            return {
                id: file,
                error: error
            };
        }
    }));

//    logger.debug('fetch result:', result);

    // concat subarrays in single array

    var out = [];
    result.forEach((item)=>{
        if (item instanceof Array)
            out = out.concat(item);
        else
            out.push(item);
    });

//    logger.debug('fetch out:', out);
    
    return out;
}

module.exports = {
    fetch: fetch
}
