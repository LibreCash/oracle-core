/**
 * Process tickers avarage rate
 * @param {Array} tickers 
 * @param {*} options {avarageRate, deltaMax}
 * @returns {*} {err, avarageRate}
 */

function processTickersAvarageRate(tickers, options) {
    var fails = null;
    var avarageRate = 0;
    
    tickers.forEach((ticker)=>{
        var value = ticker.lastest;

        // verify node
        var delta = value - options.avarageRate;
        if (options.avarageRate == 0)
            delta = 0;
        var deltaMax = options.avarageRate * options.deltaMax;
        if (Math.abs(delta) > deltaMax) {
            fails = fails || [];
            fails.push(ticker);
        }
        else {
            avarageRate += value;
        }
    });
    
    avarageRate /= tickers.length;

    return {
        err: fails,
        avarageRate,
    }
}

/**
 * Process light nodes final avarage rate
 * @param {Array} nodes processed nodes array
 * @returns {Number} final avarage rate
 */

function processNodesFinalAvarageRate(nodes) {
    var finalAvarageRate = 0;
    for (var i in nodes) {
        var node = nodes[i];
        finalAvarageRate += node.avarageRate;
    }

    finalAvarageRate /= nodes.length;

    return finalAvarageRate;
}

module.exports = {
    processTickersAvarageRate,
    processNodesFinalAvarageRate
}
