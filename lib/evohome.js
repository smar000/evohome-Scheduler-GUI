// 'use strict';

const request = require('request');
const log = require('winston');
const moment = require('moment');
const _ = require('lodash');

function Session (credentials,userInfo,locations) {
  // console.log('Session: ' + JSON.stringify(json));
  log.silly("Session called")
  this.credentials = credentials;
  this.userInfo = userInfo;
  this.locations = locations;  
  this.schedules = {};
 }


 Session.prototype.isValid = function(){
  if (this.credentials.start && this.credentials.expiresIn){
    
    log.silly("session.start(): start = " + this.credentials.start.format("YYYY-MM-DD HH:mm:ss") + ", expiresIn = ", this.credentials.expiresIn);
    // var expiry = moment(this.credentials.start).add(this.credentials.expiresIn, "seconds");
    log.silly("session.start(): expiry = " + this.credentials.expires.format("YYYY-MM-DD HH:mm:ss"));
    return (moment() < this.credentials.expires);
  }
  else
    return false;
  // var t = new Date();
  // return (t.setSeconds(t.getSeconds() + this.credentials.expiresIn));
}

Session.prototype.start = function(){
  return this.credentials.start;
}

Session.prototype.expiry = function(){
  log.silly("session.credentials.start: " + this.credentials.start);
  log.silly("session.credentials.expiresIn: " + this.credentials.expiresIn);
  log.silly("session.credentials.expires: " + moment(this.credentials.expires));
  // if (this.credentials.start && this.credentials.expiresIn)
  //   return moment(this.credentials.start).add(this.credentials.expiresIn, "seconds");
  // else 
  //   return undefined;
  return this.credentials.expires;
}

Session.prototype.getZoneForId = function(zoneId, locationIndex=0){
  var zone = _.find(this.locations[locationIndex].zones, function (zn) { return zn.zoneId == zoneId});
  log.silly(`Session.getZoneForId: Zone(${zoneId}: ${JSON.stringify(zone)})`);
  // if (!zone){ //Double check in case the _lodash function fails?
  //   for (z=0; z<this.locations[locationIndex].zones.length; z++){
  //     var zone = this.locations[locationIndex].zones[z];
  //     if (zone.zoneId == zoneId){
  //       log.debug(`Session.getZoneForId: Found! Zone(${zoneId}: ${zone.name})`);
  //       return this.locations[locationIndex].zones[z];
  //     }
  //   }
  // } else 
  return zone;
}

Session.prototype.getZoneForName = function(zoneName, locationIndex=0){
  var zone = _.find(this.locations[locationIndex].zones, function (zn) { return zn.name == zoneName});
  log.silly(`Session.getZoneForName: Zone(${zoneName}: ${JSON.stringify(zone)})`);
  return zone;
}

Session.prototype.getAllSchedules = async function() {
  if (this.locations == null || this.locations.length <= 0 || this.locations[0].zones == null){
    log.debug("/getAllSchedules: locations[0].zones is not iterable");
    return;
  }

  for (let zone of this.locations[0].zones) {
    log.debug(`getAllSchedules: Getting schedule for zone: ${zone.name}`);
    var zoneSchedule = await this.getScheduleForZoneId(zone.zoneId, zone.name);
    log.silly(zone + ": " + JSON.stringify(zoneSchedule));
  }
  if (this.locations[0].dhw) await this.getScheduleForZoneName("dhw");

  log.silly("getAllSchedules: Done getting schedules. Count = " + _.size(this.schedules));
}

Session.prototype.getScheduleForZoneName = async function(name, locationIndex=0) {
  var id;
  if (name == "dhw")
    id = this.locations[locationIndex].dhw.dhwId;
  else {
    var zone = this.getZoneForName(name);
    if (zone) id = zone.zoneId;
  }
  
  if (id) 
    return await this.getScheduleForZoneId(id, name);
  else
    return new Error ({"error": "Invalid zone name '" + name + "'"});
}

Session.prototype.getScheduleForZoneId = async function(zoneId, zoneName) {
  // Note - Watchforstock's python script also passes zoneType instead of 'temperatureZone'. This seems to be giving a 404...
  var url = "https://tccna.honeywell.com/WebAPI/emea/api/v1/temperatureZone/" + zoneId + "/schedule";
  var json = await _request(url, this.credentials, 'GET');
  log.silly("getScheduleForZoneId json: " + JSON.stringify(json));
  var dailySchedules = _.map(json.dailySchedules, function(s) { return new Schedule(s); });
  var zoneSchedule = {name: zoneName, schedule: dailySchedules}; 

  this.schedules[zoneId] = zoneSchedule;
  log.silly("getScheduleForZoneId: " + JSON.stringify(this.schedules[zoneId]));
  log.silly("getScheduleForZoneId: " + zoneName + " schedule items = " + _.size(this.schedules[zoneId].schedule));
  return this.schedules[zoneId];
}

Session.prototype.getCurrentStatus = async function(locationId) {
  var url = "https://tccna.honeywell.com/WebAPI/emea/api/v1/location/" + locationId + "/status?includeTemperatureControlSystems=True";
  log.silly("session.getCurrentStatus url: " + url);

  var json = await _request(url, this.credentials, 'GET');
  var updatedZoneData = _.merge([],this.locations[0].zones, json.gateways[0].temperatureControlSystems[0].zones);
  log.silly("Session.getCurrentStatus: updatedZoneData = " + JSON.stringify(updatedZoneData));

  var updatedDhwData =  _.merge([],this.locations[0].dhw, json.gateways[0].temperatureControlSystems[0].dhw);
  this.locations[0].zones = updatedZoneData;
  this.locations[0].dhw = updatedDhwData;
  this.locations[0].systemModeStatus = json.gateways[0].temperatureControlSystems[0].systemModeStatus;
  log.silly("session.getCurrentStatus systemModeStatus: " + JSON.stringify(this.locations[0].systemModeStatus));

  return json;
}

Session.prototype.saveScheduleForZone = async function(zone,zoneSchedule){
  if (zoneSchedule) log.debug("saveSchedulesForZone: zoneSchedule: " + JSON.stringify(zoneSchedule));
  if (!zone) return (Error ("Invalid zone"));
  if (!this.schedules[zone.zoneId] || _.size(this.schedules[zone.zoneId]) ==0) return (Error (zone.name + " (" + zone.zoneId + ") Schedule is empty"));

  var zoneId = zone.zoneId;

  if (zoneSchedule) this.schedules[zoneId] = zoneSchedule;
  var schedule = this.schedules[zoneId].schedule;
  log.silly("saveScheduleForZone: this.schedules[" + zoneId + "]: " + JSON.stringify(schedule));
  var evoFormat = {}
  evoFormat["dailySchedules"] = schedule; //simple json object with 'dailySchedules' consisting of array of schedules
  log.silly("saveScheduleForZone: " + JSON.stringify(evoFormat));
  var url = "https://tccna.honeywell.com/WebAPI/emea/api/v1/temperatureZone/" + zone.zoneId + "/schedule";
  var options = {"body": JSON.stringify(evoFormat)}
  var response = await _request(url,this.credentials,'PUT',options);
  log.silly("saveScheduleForZone: Response: " + JSON.stringify(response));
  return response;
}

Session.prototype.setCredentials = function(credentials){
  this.credentials = credentials;
}

Session.prototype.setZoneSetpoint = async function(zone,setpoint=0,until, locationIndex=0){ //Need to check timezone issues. "Until" time seems 4 hours ahead of whatever we set it to
  // log.silly(`Session.setZoneSetPoint: ZoneId ${zoneId}, Setpoint ${setpoint}`)

  if (!zone) {
    log.debug("Session.setZoneSetPoint: ERROR: Could not find zone");
    log.silly("Session.setZoneSetPoint: Current ocation data: " + JSON.stringify(this.locations[locationIndex]));
    return new Error(`Session.setZoneSetpoint: Zone missing`)
  }
  var zoneId = zone.zoneId; // this.getZoneForId(zoneId, locationIndex);
  
  var now = new Date();
  var body;

  if(setpoint == 0) {   // if target temperature is set to zero then we ask to follow the schedule instead of setting a temperature
    body = JSON.stringify({"HeatSetpointValue":null,"SetpointMode":"FollowSchedule","TimeUntil":null});
  } else {
    if (zone.setpointCapabilities){
      if (setpoint < zone.setpointCapabilities.minHeatSetpoint) setpoint = zone.setpointCapabilities.minHeatSetpoint;
      if (setpoint > zone.setpointCapabilities.maxHeatSetpoint) setpoint = zone.setpointCapabilities.maxHeatSetpoint; 
      // setpoint = Math.round(setpoint*2)/2; // Ensure we are in 0.5 degree intervals. 
      setpoint = round(setpoint,zone.setpointCapabilities.setpointValueResolution); // round to required resolution
    } else 
      log.debug("Session.setZoneSetPoint: setpointCapabilities not found for the zone: " + JSON.stringify(zone));
    
    if (until) 
      body = JSON.stringify({"HeatSetpointValue":setpoint,"SetpointMode":"TemporaryOverride","TimeUntil":until});
    else
      body = JSON.stringify({"HeatSetpointValue":setpoint,"SetpointMode":"PermanentOverride","TimeUntil":null});
  }

  log.debug(`Session.setZoneSetpoint: Setting setpoint for zone '${zone.name}' to ${setpoint}`);
  var url = `https://tccna.honeywell.com/WebAPI/emea/api/v1/temperatureZone/${zoneId}/heatSetpoint`;
  log.silly(`Session.setZoneSetpoint: url = ${url}`);
  var options = {"body": body};
  log.silly(`Session.setZoneSetpoint: body: ${JSON.stringify(body)}`);
  var response = await _request(url,this.credentials,'PUT',options);
  return response;
}

Session.prototype.setDhwState = async function(state,until, locationIndex=0){
  state = state.charAt(0).toUpperCase() + state.slice(1);
  log.debug(`Session.setDhwState: Setting state to '${state}'`);
  if (until)
    var body = {"State" : state,"Mode":"TemporaryOverride","UntilTime":until};
  else 
    var body = {"State": state,"Mode":"PermanentOverride","UntilTime":null};
  log.silly(`Session.setDhwState: body: ${JSON.stringify(body)}`);
  var resp = this._setDhw(body, locationIndex);  
  log.debug(`Session.setDhwState: _request response: '${JSON.stringify(resp)}'`)
  if (resp == {}) resp = {"status": "Ok"};
  return resp;
}

Session.prototype.setDhwModeAuto = async function(locationIndex=0){
  var body = {"State": "","Mode":"FollowSchedule","UntilTime":null};
  log.silly(`Session.setDhwModeAuto: body: ${JSON.stringify(body)}`);
  return this._setDhw(body, locationIndex);  
}

Session.prototype._setDhw = async function(body, locationIndex){
  log.debug(`Session._setDhw: body: ${JSON.stringify(body)}`);
  var dhwId = this.locations[locationIndex].dhw.dhwId;
  if (!dhwId) {
    log.debug("Session._setDhw: ERROR: Could not find dhwId");
    log.silly("Session._setDHW: Current location data: " + JSON.stringify(this.locations[locationIndex]));
    return new Error("Session._setDhw: Could not find zone with dhwId")
  }
  
  var url = `https://tccna.honeywell.com/WebAPI/emea/api/v1/domesticHotWater/${dhwId}/state`
  var options = {"body": JSON.stringify(body)};
  var response = await _request(url,this.credentials,'PUT',options);
  return response;  
}

Session.prototype.setSystemMode = async function(mode, until, locationIndex=0){
  var systemId = this.locations[locationIndex].systemId;
  if (!systemId) {
    log.debug("Session.setSystemMode: ERROR: Could not find systemId");
    log.silly("Session.setSystemMode: Current location data: " + JSON.stringify(this.locations[locationIndex]));
    return new Error("Session.setSystemMode: ERROR: Could not find systemId")
  }

  log.debug(`Session.setSystemMode: systemId = ${systemId}, mode = ${JSON.stringify(mode)}`);
  if (until)
    var body = {"SystemMode" : mode,"TimeUntil": until, "Permanent":false};
  else 
    var body = {"SystemMode": mode,"TimeUntil": null, "Permanent":true};
  log.debug(`Session.setSystemMode: body: ${JSON.stringify(body)}`);

  var url = `https://tccna.honeywell.com/WebAPI/emea/api/v1/temperatureControlSystem/${systemId}/mode`;    
  var options = {"body": JSON.stringify(body)};
  var response = await _request(url,this.credentials,'PUT',options);
  log.debug(`Session.setSystemMode: reponse: ${JSON.stringify(response)}`);
  if (response == "") response = {"status" : "Ok"}
  return response;  
}


function round(value, step) {
  step || (step = 1.0);
  var inv = 1.0 / step;
  return Math.round(value * inv) / inv;
}

function UserInfo(json) {
  this.userId = json.userId
  this.username = json.username
  this.firstname = json.firstname
  this.lastname = json.lastname
  this.streetAddress = json.streetAddress
  this.city = json.city
  this.postcode = json.postcode
  this.country = json.country
  this.language = json.language
  log.silly("setUserInfo done. userID = " + this.userId)
}

function Credentials (username, password, json) {
  this.token = json.access_token;
  this.tokenType = json.token_type;
  this.expiresIn = json.expires_in;
  this.start = new moment();
  this.expires = (moment(this.start).add(this.expiresIn, "seconds"));
  this.refreshToken = json.refresh_token;
  this.headers = {
    'Authorization': 'bearer ' + json.access_token, 
    'applicationId': 'b013aa26-9724-4dbd-8897-048b9aada249',
    'Accept' : 'application/json, application/xml, text/json, text/x-json, text/javascript, text/xml',
    'Content-Type': 'application/json'
  };
  this.username = username;
  this.password = password;
  this.expires = ( moment(this.start).add(this.expiresIn, "seconds"));
}

function Schedule(json) {
  this.dayOfWeek = json.dayOfWeek;
  this.switchpoints = _.map(json.switchpoints, function(sw) { return new Switchpoint(sw); });
}

function Switchpoint(json) {
  this.heatSetpoint = json.heatSetpoint;
  this.timeOfDay = json.timeOfDay;
}

function Location(json) {
  this.locationID = json.locationID;
  this.name = json.name;
  this.streetAddress = json.streetAddress;
  this.city = json.city;
  this.country = json.country;
  this.postcode = json.postcode;
  this.locationType = json.locationType;
  this.zones = _.map(json.zones, function(zone) { return new Zone(zone); });
  if (json.dhw) {
    this.dhw = json.dhw;
    this.dhw.zoneType = "dhw";
    this.dhw.name = "Hot Water"
  }
  this.useDaylightSaveSwitching = json.useDaylightSaveSwitching;
  this.timeZone = new Timezone(json.timeZone);
  this.systemId = json.systemId;
  this.gateways = {};
  this.systemModeStatus = {}; //This should technically be under gateway. TODO...
}
Location.prototype.setTemperatureControl = async function (json){
  this.gateways = json;
}

function Timezone(json){
  this.timeZoneId = json.timeZoneId;
  this.displayName = json.displayName;
  this.offsetMinutes = json.offsetMinutes;
  this.currentOffsetMinutes = json.currentOffsetMinutes;
  this.supportsDaylightSaving = json.supportsDaylightSaving;
}

function Zone (json) {
  this.zoneId = json.zoneId;
  this.zoneType = json.zoneType;
  this.modelType = json.modelType;
  this.name = json.name;
  this.setpointCapabilities = new SetpointCapabilities(json.setpointCapabilities);
  this.ScheduleCapabilities = new ScheduleCapabilities(json.scheduleCapabilities);
}

function SetpointCapabilities (json) {
  this.allowedSetpointModes = json.allowedSetpointModes;
  this.minHeatSetpoint = json.minHeatSetpoint;
  this.maxHeatSetpoint = json.maxHeatSetpoint;
  this.canControlHeat = json.canControlHeat;
  this.timingResolution = json.timingResolution;
  this.maxDuration = json.maxDuration;
}

function ScheduleCapabilities(json){
  this.maxSwitchpointsPerDay = json.maxSwitchpointsPerDay;
  this.minSwitchpointsPerDay = json.minSwitchpointsPerDay;
  this.timingResolution = json.timingResolution;
  this.setpointValueResolution = json.setpointValueResolution;
}

function SystemModeStatus(json) {
  this.mode = json.mode;
  this.isPermanent = json.isPermanent;
}

async function getUserInfo (credentials) {
  var url='https://tccna.honeywell.com/WebAPI/emea/api/v1/userAccount';
  var json = await _request(url, credentials, 'GET');
  var ui = new UserInfo(json);
  log.silly("getUserInfo: JSON - " + JSON.stringify(json));
  return (ui);
}

async function getInstallationData (credentials, userId) {
  if (userId) {
    var url = 'https://tccna.honeywell.com/WebAPI/emea/api/v1/location/installationInfo?userId=' + userId + '&includeTemperatureControlSystems=True'
    var json = await _request(url, credentials, 'GET')
    log.silly("getLocations JSON: " + JSON.stringify(json));

    this.locations = _.map(json, function(location) {     
      var data = {}
      
      data.locationID = location.locationInfo.locationId;
      data.name = location.locationInfo.name;
      data.streetAddress = location.locationInfo.streetAddress;
      data.city = location.locationInfo.city;
      data.country = location.locationInfo.country;
      data.postcode = location.locationInfo.postcode;
      data.locationType = location.locationInfo.locationType;
      data.daylightSavingTimeEnabled = location.locationInfo.useDaylightSaveSwitching;
      data.timeZone = location.locationInfo.timeZone;
      data.zones = location.gateways[0].temperatureControlSystems[0].zones;
      if (location.gateways[0].temperatureControlSystems[0].dhw) data.dhw = location.gateways[0].temperatureControlSystems[0].dhw; 
      data.systemId = location.gateways[0].temperatureControlSystems[0].systemId;
      log.silly("GetIntallatinData - Done for locationID " + data.locationID + ", zones size: " + _.size(data.zones))
      return new Location(data);
    });
    log.silly("getInstallation done. locations:  - " + JSON.stringify(this.locations))
    return (this.locations)
  } else {
    log.error("getInstallationJSON: userId is undefined")
    return (Error ("Invalid userId"))
  }
}

_request = function (url, credentials, method, extraOptions) {
  log.silly("_request CREDENTIALS: " + JSON.stringify(credentials));
  if (credentials === undefined)
    return (Error ("Session credentials not provided"))
  var headers = credentials.headers;
  var options = {
    method: method || 'GET',
    url: url,
    headers: headers
  }
  if (extraOptions) options = Object.assign(options, extraOptions);
  log.silly("_request OPTIONS: " + JSON.stringify(options))
  return new Promise(function(resolve,reject){
    request(options, function (err, response) {
      if (err) {
        reject(err)
      } else {
        var json
        try {
          log.silly("_request JSON: " +JSON.stringify(response));          
          json = JSON.parse(response.body);          
        } catch (ex) {
          // log.error(ex)
          log.error(response.body)
          // log.error(response)
          reject(ex)
        }
        if (json) resolve(json); else resolve (response.statusCode)
      }
    })
  })
}

function login (username, password,refreshToken) {
  log.debug(`login: Attempting login for userid '${username}'`)
  var options = {
    method: 'POST',
    url: 'https://tccna.honeywell.com/Auth/OAuth/Token',
    headers: {
      'Authorization':	'Basic NGEyMzEwODktZDJiNi00MWJkLWE1ZWItMTZhMGE0MjJiOTk5OjFhMTVjZGI4LTQyZGUtNDA3Yi1hZGQwLTA1OWY5MmM1MzBjYg==',
      'Accept': 'application/json, application/xml, text/json, text/x-json, text/javascript, text/xml',
      'Content-Type':	'application/x-www-form-urlencoded; charset=utf-8',
      'Cache-Control':'no-store no-cache',
      'Pragma':	'no-cache',
      'Connection': 'Keep-Alive'
    }
  }
  if (refreshToken){
    options["body"] = 'grant_type=refresh_token&refresh_token=' + refreshToken;
  } else {
    options["body"] = 'Host=rs.alarmnet.com/&grant_type=password&scope=EMEA-V1-Basic EMEA-V1-Anonymous EMEA-V1-Get-Current-User-Account&Username=' + encodeURIComponent(username) +
          '&Password=' + encodeURIComponent(password)
  }

  return new Promise(function(resolve,reject){
    request(options,  function (err, response) {
      if (err) {
        reject(err)
      } else {
        var json
        try {          
          // log.info("response.body: ", response.body);
          json = JSON.parse(response.body);          
          // log.info("JSON: ", json);
        } catch (ex) {
          log.error(JSON.stringify(ex));
          log.error(JSON.stringify(response));
          reject(ex)
        }
        if (json) {
          var newCreds = new Credentials(username,password, json)
          log.silly("login: " + JSON.stringify(json));
          resolve(newCreds)
        }
      }
    });
  });
}

async function initialise(username, password) {
    var credentials = await login(username, password)
    log.silly("Inialise: done login")
    var userInfo = await getUserInfo(credentials);
    log.silly("initialise: Got userinfo. Userid = " + JSON.stringify(userInfo.userId));
    var locs = await getInstallationData(credentials, userInfo.userId);
    log.silly("initialise: zones count:  " + _.size(locs[0].zones) + " and for locs: " + _.size(locs))
    return new Session(credentials,userInfo,locs);
}

module.exports = {
  login: async function (username, password, refreshToken) {
    return await login(username, password,refreshToken);
  },
  RenewLogin: async function(credentials){
    return await RenewLogin(credentials);
  },
  GetNewSession: async function(username, password){
    return await initialise(username, password);
  }
}

