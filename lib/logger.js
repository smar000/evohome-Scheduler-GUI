var log = require("winston");
// require('winston-daily-rotate-file');

var logDir = './logs'; // log folder
var fs = require('fs');
var path = require ('path');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

var level = process.env.LOG_LEVEL || 'debug';

log.remove(log.transports.Console);
log.add(log.transports.Console, {
    timestamp: true,
    level: level,
    colorize: true,
    timestamp: function () {
        return (new Date()).toISOString();
    }
});

log.add(log.transports.File, { 
    filename: logDir + '/evoScheduler.log', 
    json:false, 
    maxsize:'1000000', 
    maxFiles:'10', 
    level: level,
    timestamp: function () {return (new Date()).toISOString()}
});


module.exports = log;