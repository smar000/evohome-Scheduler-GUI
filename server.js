'use strict';

var config = require('./config/config.json');

var path = require('path');
var express = require('express');
var morgan = require('morgan');
var _ = require('lodash');
var log = require('./lib/logger.js');
var moment = require('moment');

var evohome = require('./lib/evohome.js');
var session;  //use a global evohome session for now
var lastDataUpdate;
var locationIndex = config.locationIndex || 0;
var app = express();
var bodyParser = require('body-parser');

// --------------------
var PORT = config.port || 3000;
var SSL_PORT = config.sslPort || 3001;
var SSL_CERT_PATH = config.sslCertPath
var SSL_CA_PATH = config.sslCAPath
var SSL_KEY_PATH = config.sslKeyPath

// --------------------
var http = require('http');
if (SSL_KEY_PATH && SSL_CERT_PATH) {
    var fs = require('fs');
    var https = require('https');
    var sslKey = fs.readFileSync(SSL_KEY_PATH);
    var sslCert = fs.readFileSync(SSL_CERT_PATH );
    var sslCa = fs.readFileSync(SSL_CA_PATH);
    var sslOptions = {key: sslKey, cert: sslCert, ca: sslCa};
}


// --------------------
app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
app.use(morgan('dev')); // Log the requests using morgan
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With, Content-Type");
    next();
});

// ----------- Routes -------------
app.use(express.static(path.join(__dirname, 'static'))); // Serve static files

app.use('/rest',getSession);    //All rest commands require valid evohome session

app.get('/rest/session', async function (req, res, next) { // Get Session
    log.debug("/session: request received");    
    if (session) {
        res.json(session);
    }
    else {
        log.debug("/session: session is undefined....");
        res.json({error:"Session is undefined"});
    }   
});

app.get('/rest/renewsession', async function (req, res, next) { // Renew current session
    log.debug("/renewsession: request received");    
    if (session && session.credentials) log.silly(`/renewsession: current session credentials:  ${JSON.stringify(session.credentials)}`);    
    var credentials = await doSessionRenewal(session.credentials);
    if (credentials) {
        log.debug(`/renewsession: new credentials:  ${JSON.stringify(credentials)}`);
        log.debug(`/renewsession: new session credentials expiry: ${session.expiry().format("YYYY-MM-DD HH:mm:ss")}`);
    }
    res.json(credentials);
});

app.get('/rest/getsystemmode', async function (req, res, next) { // Get system mode
    log.debug("/getsystemmode: request received");    
    var json = await session.getCurrentStatus(session.locations[locationIndex].locationID);
    res.json(session.locations[locationIndex].systemModeStatus); //Note capital ID...
});

app.get('/rest/getzones/:forItem?', async function (req, res, next) { // Get Zones
    var forItem = req.params.forItem;
    log.debug(`/getzones: request received (forItem = ${JSON.stringify(forItem)}`);    
    // if (session && session.locations.length >0) log.debug(`/getzones: Zones found: ${_.size(session.locations[locationIndex].zones)}`);        
    if (session && session.locations[locationIndex])
        if (forItem)
            res.json(session.getZoneForName(forItem, locationIndex));
        else
            res.json(session.locations[locationIndex].zones);
    else   
        res.status(500).json({"error":"Session could not be found"})
});

app.get('/rest/getdhw', async function (req, res, next) { // Get dhw if it exits
    log.debug("/getdhw: request received");    
    res.json(session.locations[locationIndex].dhw);
});


app.get('/rest/getcurrentstatus/:forItem?', async function (req, res, next) { // Get Zones
    log.debug(`/getcurrentstatus: request received. Parameters: ${JSON.stringify(req.params)}`);   
    var secondsAgo;
    var forItem = req.params.forItem;
    if (lastDataUpdate) secondsAgo = (moment().unix() - lastDataUpdate); else secondsAgo = 181; 
    if (req.query.refresh || secondsAgo > 180){ //we reuse the same data if less than 3 minutes ago; saves hammering the evohome server
        var json = await session.getCurrentStatus(session.locations[locationIndex].locationID);
        lastDataUpdate = moment().unix();
    } else log.debug(`/getcurrentstatus: re-using previous data as last refresh was ${secondsAgo} seconds ago` )
    if (forItem){ //Filter by forItem - this should be zone name or dhw or system
        log.silly(`/getcurrentstatus: filtering for '${forItem}'`)
        if (forItem == "dhw"){
            res.json(session.locations[locationIndex].dhw);
        } else if (forItem == "system") {
            res.json(session.locations[locationIndex].systemModeStatus);
        } else { //assume zone
            res.json(session.getZoneForName(forItem));
        }
    } else {
        log.silly("/getcurrentstatus: Sending everything...")
        res.json(session.locations[locationIndex]); //send everything
    }
});

app.get('/rest/getallschedules', async function (req, res, next) { // Get Schedules for all zones 
    log.info(`/getschedules: request params:  ${JSON.stringify (req.query)}`);
    if (_.size(session.schedules) < _.size(session.locations[locationIndex].zones) || req.query.refresh){
        log.debug("/getschedules: Refreshing all schedules from server...")
        await session.getAllSchedules();    
    }  else
        log.debug("/getschedules: Sending previously downloaded schedules...");
    log.debug(`/getSchedules: Schedules found for ${_.size(session.schedules)} zones`);
    res.json(session.schedules);
});

app.get('/rest/getscheduleforzone/:forItem?', async function (req, res, next) { //Get Schedule for single zone
    log.debug("/getscheduleforzone: request received for zone " + req.params.forItem);    
    var forItem = req.params.forItem;
    if (forItem){ //Filter by forItem - this should be zone name or dhw
        log.silly(`/getscheduleforzone: filtering for '${forItem}'`);
        res.json(await session.getScheduleForZoneName(forItem));
    } else 
        resp.status(500).json({"error":"Zone name is missing"})    
});

app.post('/rest/savezoneschedule', function (req, res, next) { // Post Single Zone Schedule
    log.info("/savezoneschedule received.");
    log.silly(`/savezoneschedule:  ${JSON.stringify(req.body)}`);
    var zone = session.locations[locationIndex].zones[0];
    log.debug("/savezoneschedule: zone: " + zone.name);
    //TODO..... complete saving of single schedule - not beng used at the moment
});

app.post('/rest/saveallschedules', async function (req, res, next) { // Save Schedules for all zones
    log.info("/saveallschedules received.");
    log.silly(`/saveallschedules:  ${JSON.stringify(req.body)}`);
    var responses = [];
    for (let zone of session.locations[locationIndex].zones) {
        var zoneId = zone.zoneId;
        log.debug("/saveallschedules: Saving schedule for zone: " + zone.name + " (" + zoneId + ")");
        var zoneSchedule = {name: zone.name, schedule: req.body[zoneId].schedule}; 
        session.schedules[zoneId] = zoneSchedule;
        responses.push (await session.saveScheduleForZone(zone));
        log.debug("/saveallschedules: returned from saveScheduleForzone ('" + zone.name + ")'");    
        log.silly(`/saveallschedules: ${zone}: ${JSON.stringify(zoneSchedule)}`);
    }
    res.send(responses);
    // res.sendStatus(200);
    log.debug("/saveallschedules: returned from saving all zones' schedules");
});

app.post('/rest/setsystemmode', async function (req, res, next) { // Set system mode
    //Valid options are Auto, Custom, AutoWithEco, Away, DayOff, HeatingOff
    log.info("/setsystemmode received.");
    log.debug(`/setsystemmode:  ${JSON.stringify(req.body)}`);

    var response = await session.setSystemMode(req.body.mode, req.body.until, locationIndex);
    res.send(response);
});

app.post('/rest/setdhwstate', async function (req, res, next) { // Set system mode
    log.info("/setdhwstate received.");
    log.silly(`/setdhwstate:  ${JSON.stringify(req.body)}`);
    var response = await session.setDhwState(req.body.state,req.body.until,locationIndex)
    log.debug(`/setdhwstate: response: ${JSON.stringify(response)}`);
    res.send(response);
});

app.post('/rest/setdhwmodeauto', async function (req, res, next) { // Set system mode
    log.info("/setdhwmodeauto received");
    // setDHWModeAuto
    var response = await session.setDhwModeAuto();
    log.debug(`/setdhwmodeauto: response: ${JSON.stringify(response)}`);
    res.send(response);
});


app.post('/rest/setzoneoverride', async function (req, res, next) { // Set system mode
    log.info("/setzoneoverride received.");
    log.debug(`/setzoneoverride: parameters: ${JSON.stringify(req.body)}`);
    if (!(req.body.zoneId || req.body.zoneName))
        res.status(500).send({error: "Missing zoneId/zoneName"});
    else {
        var zone;
        if (req.body.zoneId)
            zone = session.getZoneForId(req.body.zoneId, locationIndex);
        else if (req.body.zoneName)
            zone = session.getZoneForName(req.body.zoneName, locationIndex);
        if (!zone)
            res.status(500).send({error:"Could not find zone for parameters " + JSON.stringify(req.body)});
        else {
            var response = session.setZoneSetpoint(zone,req.body.setpoint,req.body.until);
            res.send(response);
        }
    }
});

app.post('/rest/cancelzoneoverride', async function (req, res, next) { // Cancel zone setpoint override
    log.info("/cancelzoneoverride received.");
    log.silly(`/cancelzoneoverride: ${JSON.stringify(req.body)}`);
    if (!req.body.zoneId)
        res.status(500).send({error: "Missing zoneId"});
    else {
        var response = session.setZoneSetpoint(req.body.zoneId,0);
        res.send(response);
    }
});

app.get('/rest/setloglevel', function (req, res, next) {
    log.info(`/setloglevel: received ${JSON.stringify (req.query)}`);
    if (req.query.level) {        
        log.level = req.query.level;
        log.info(`/setloglevel: log levels set to ${JSON.stringify(log.level)}]`)
        res.json({loglevel : req.query.level});
    } else {
        log.info("/setloglevel: Ignoring log level change as level parameter missing")
        res.status(404).send("Log level not specified")
    }
    
});

app.get('/rest/*', function(req, res){
    var msg = "Valid endpoints: <ul>"  
    for (var i = 0; i < app._router.stack.length; i++) {
        var ep = app._router.stack[i];
        if (ep.name == "bound dispatch") {
            log.debug("/rest/: " + ep.route.path);
            if (!ep.route.path.includes("*")) msg = msg + "<li>" + ep.route.path + "</li>";
        }
    }
    msg = msg + "</ul>"
    res.status(404).send(msg);
  });
  


  app.get('*', function(req, res){ // Catch all....
  res.send('Page not found.');
});

// ----------------------------------------------
async function getSession(req,res,next) {
    try{
        log.silly("getSession: Called...")
        if (typeof config.username  == 'undefined' && typeof config.password == 'undefined' ){
            log.error("getSession: : Invalid userid or password")
            res.status(401).json({Error: "Invalid userId or password. Please check the config file."});
            next('router');
        }       
        // log.silly("Checking for valid session.... Session type is " + typeof session);
        if (typeof session !== "undefined")
            log.silly(`getSession: Session - isValid: ${session.isValid()}, Start: ${session.start().format("YYYY-MM-DD HH:mm:ss")}, Expiry: ${session.expiry().format("YYYY-MM-DD HH:mm:ss")}`);
        else
            log.debug("getSession: : session is undefined....");

        var isValid = (typeof session !== "undefined" && session.isValid());
        if (!isValid) {
            log.info("getSession: Existing valid session not found. Creating new session...");
            await createNewSession();
        } else log.debug(`getSession: Existing session expiry is  ${session.expiry().format("YYYY-MM-DD HH:mm:ss")}. Reusing session`);
        
        if (session && session.isValid()) next(); else next(new Error("getSession: Could not get valid session"));

        return session;

    } catch (ex) {
        log.error(ex)
        next(ex);
    }
}

async function createNewSession(){
    try{
        session = await evohome.GetNewSession(config.username,config.password)   ;         
        log.info("Done logging in.");
        if (config.keepSessionAlive) setSessionRenewalTimer();
        log.debug(`createNewSession: Got new session. session.isValid = ${session.isValid()}, Expiry = ${session.expiry().format("YYYY-MM-DD HH:mm:ss")}`);
        log.debug(`createNewSession: Session zones: ${_.size(session.locations[locationIndex].zones)}`);
        session.locations[locationIndex].zones.forEach(zone => {
            log.debug(`zone: ${zone.zoneId} - ${zone.name} [${zone.zoneType}]`);
        });
        var dhw = session.locations[locationIndex].dhw;
        if (dhw) log.debug(`DHW:  ${dhw.dhwId} - Hot Water [dhw]`);
        return session;
    } catch (ex) {
        log.error(JSON.stringify(ex));
        return new Error(JSON.stringify(ex));
    }
}


function setSessionRenewalTimer(){
    if (session && session.isValid()){
        log.debug(`setSessionRenewalTimer: setting timer for token renewal in ${session.credentials.expiresIn - 45} seconds`);
        setTimeout(doSessionRenewal, (session.credentials.expiresIn - 60) * 1000);//renew 45 seconds before expiry  
    } //
}

async function doSessionRenewal(){
    log.debug("doSessionRenewal: function called");
    log.debug(`DoSession: Calling Login for userid '${session.credentials.username}'...`);
    if (session && session.isValid()) { // use the session renewal token
        var newCreds = await evohome.login(session.credentials.username, session.credentials.password,session.refreshToken);
        log.info(`doSessionRenewal: session renewed: isValid status: ${session.isValid()}. Expiry ${session.expiry().format("YYYY-MM-DD HH:mm:ss")}`);
        session.setCredentials(newCreds);    
    } else { //Create a new session as old one has expired
        await createNewSession();
    }
    if (config.keepSessionAlive) setSessionRenewalTimer();
    return newCreds;
}


app.use(function (err, req, res, next) {
    console.error(err.stack);
    res.status(500).send("Something has gone wrong..." + JSON.stringify(err));
})

// ----------------------------------------------
http.createServer(app).listen(PORT);
var msg = `Listening on port ${PORT}(http)`

if (SSL_KEY_PATH && SSL_CERT_PATH) {
    https.createServer(sslOptions, app).listen(SSL_PORT);
    msg += ` and port ${SSL_PORT}(https)`
}
log.info("");
log.info("");
log.info("----------------------------------------------");
log.info(msg);
