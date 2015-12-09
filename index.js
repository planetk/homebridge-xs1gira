'use strict';

var Service, Characteristic;

module.exports = function(homebridge) {

  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  homebridge.registerPlatform("homebridge-xs1gira", "xs1gira", Xs1giraPlatform);
}

var request = require("request");

function evalCallback(data) {
    return data;
}

function Xs1giraPlatform(log, config) {
  var that=this;
  this.log = log;
  this.host = config["host"];
  this.basename = config["name"];
}

Xs1giraPlatform.prototype = {
  accessories: function(callback) {
    var that=this;
    var foundAccessories = [];
    request(
      {
        url: "http://" + this.host + "/control?callback=evalCallback&cmd=get_list_actuators",
        method: "GET",
      },
      function(error, response, body) {
        if (error) {
          that.log("could not setup xs1");
          that.log(error);
          callback(null);
        } else {
          var data = eval(body);
          for (var actuator of data.actuator) {
            if (actuator.type != "disabled") {
              that.log(actuator.name + "  " + actuator.type);
              foundAccessories.push(new Xs1giraAccessory(that.log, that.host, that.basename, actuator));
            }
          }
          callback(foundAccessories);
        }
      }
    );
  }
}

function Xs1giraAccessory(log, host, name, actuator) {
  this.log = log;
  this.host = host;
  this.name = name + " " + actuator.name
  this.actuator = actuator;
}

Xs1giraAccessory.prototype = {
  identify: function(callback) {
    this.log("Identify requested!");
    callback(); // success
  },
  setActuator: function(actNumber, idxFunction, callback) {
    var that = this;
    request(
      {
        url: "http://" + that.host + "/control?callback=evalCallback&cmd=set_state_actuator&number=" + actNumber + "&function=" + idxFunction,
        method: "GET",
      },
      function(error, response, body) {
        if (error) {
          that.log(error);
          callback(null);
        } else {
          var data = eval(body);
          callback(null, data);
        }
      }

    );
  },
  getActuator: function(actNumber, callback) {
    var that = this;
    request(
      {
        url: "http://" + that.host + "/control?callback=evalCallback&cmd=get_state_actuator&number=" + actNumber,
        method: "GET",
      },
      function(error, response, body) {
        if (error) {
          that.log(error);
          callback(null);
        } else {
          var data = eval(body);
          callback(null, data);
        }
      }
    );
  },
  getSwitchState: function (callback) {
    var actNumber = this.actuator.id;
    this.getActuator(actNumber, function(error, response) {
      if (error) {
        callback(error, null);
      } else {
        callback(null, response.actuator.value > 0);
      }
    });
  },
  setSwitchState: function(powerOn, callback) {
    var actNumber = this.actuator.id;
    var idxFunction = powerOn ? this.idxOn : this.idxOff;
    this.setActuator(actNumber, idxFunction, function(error, response) {
      if (error) {
        callback(error, null);
      } else {
        callback(null, response.actuator.value > 0);
      }
    });
  },
  getBrightness: function (callback) {
    var that=this;
    var actNumber = this.actuator.id;
    this.getActuator(actNumber, function(error, response) {
      if (error) {
        callback(error, null);
      } else {
        that.brightness = response.actuator.value;
        callback(null, response.actuator.value);
      }
    });
  },
  setBrightness: function(newBrightness, callback) {
    var that=this;
    var actNumber = this.actuator.id;
    this.getActuator(actNumber, function(error, response) {
      if (error) {
      } else {
        that.brightness = response.actuator.value;
      }
    });
    var idxFunction = newBrightness > that.brightness ? this.idxUp : this.idxDown;
    this.setActuator(actNumber, idxFunction, function(error, response) {
      if (error) {
        callback(error, null);
      } else {
        callback(null, response.actuator.value);
      }
    });
  },

  getServices: function() {
    var that = this;
    var services = [];

    this.log("creating services for " + this.name)

    // INFORMATION ///////////////////////////////////////////////////

    var informationService = new Service.AccessoryInformation();
    services.push( informationService );
    
    informationService
      .setCharacteristic(Characteristic.Manufacturer, "EZControl")
      .setCharacteristic(Characteristic.Model, "xs1")
      .setCharacteristic(Characteristic.Name, this.actuator.name);

    if (this.actuator.type == "dimmer") {    
      var lightbulb = new Service.Lightbulb(this.actuator.name + " " + this.actuator.type);
      services.push( lightbulb );

      var idx = 0;
      for (var func of this.actuator.function) {
        idx++;

        if (func.type == "on") {
          this.idxOn = idx;
        } else if (func.type == "off") {
          this.idxOff = idx;
        } else if (func.type == "dim_up") {
          this.idxUp = idx;
        } else if (func.type == "dim_down") {
          this.idxDown = idx;
        }
      }

      lightbulb.getCharacteristic(Characteristic.On)
          .on('get', this.getSwitchState.bind(this))
          .on('set', this.setSwitchState.bind(this));

      lightbulb.addOptionalCharacteristic(Characteristic.CurrentPosition);
      lightbulb.addOptionalCharacteristic(Characteristic.TargetPosition);

      lightbulb.getCharacteristic(Characteristic.CurrentPosition)
          .on('get', this.getBrightness.bind(this));

      lightbulb.getCharacteristic(Characteristic.TargetPosition)
          .on('get', this.getBrightness.bind(this))
          .on('set', this.setBrightness.bind(this));

    }

    return services;
  }
}
