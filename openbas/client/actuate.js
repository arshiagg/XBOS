String.prototype.toProperCase = function () { // from http://stackoverflow.com/questions/196972/convert-string-to-title-case-with-javascript
      return this.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
};

if (Meteor.isClient) {
  Session.set('loading',false);
  var actuators = {};
  var actuatorsDep = new Deps.Dependency;

  var getActuators = function(act_uuid) {
    actuatorsDep.depend();
    return actuators[act_uuid] || {"Actuator": {"Model": "none", "States": [0,1], "MinValue": 0, "MaxValue": 100, "Values": ["does","not","work"]}};
  };

  var updateActuators = function(act_uuid, data) {
    actuators[act_uuid] = data;
    actuatorsDep.changed();
  };

  var permalinks = {};
  var permalinksDep = new Deps.Dependency;

  var getPermalink = function(uuid) {
    permalinksDep.depend();
    return permalinks[uuid] || '#';
  };

  var updatePermalink = function(uuid, link) {
    permalinks[uuid] = link
    permalinksDep.changed();
  };

  Template.actuators.actuatorsAll = function() {
    // only returns points that have ActuatorPath
    return Points.find({"ActuatorUUID": {"$exists": true}}, {"reactive": !Session.get('loading')});
  };

  Template.actuator_display.rendered = function() {
    var uuid = this.data.ActuatorUUID;
    Meteor.call('tags', uuid, function(err, res) {
      if (err) {
        console.log(err);
      }
      updateActuators(res[0].uuid, res[0]);
    });
    var uuid = this.data.uuid;
    Meteor.call('createPermalink', 
    {
       "streams":
       [
           {
               "uuid": uuid,
               "color": "#000000"
           },
       ],
       "autoupdate": true,
       "window_type": "now",
       "window_width": 86400000000000,
       "tz": "America/Los_Angeles",
     }, function(err, res) {
       updatePermalink(uuid, res);
    });
  };

  Template.actuator_display.type = function() {
    return getActuators(this.ActuatorUUID).Actuator.Model || "none";
  };

  // functions to help determine type of actuator based on Actuator.Model from sMAP metadata
  Template.actuator_display.helpers({
    isDiscrete: function(template) {
      return getActuators(this.ActuatorUUID).Actuator.Model === "discrete";
    },
    isBinary: function(template) {
      return getActuators(this.ActuatorUUID).Actuator.Model === "binary";
    },
    isContinuous: function(template) {
      var model = getActuators(this.ActuatorUUID).Actuator.Model;
      return model === 'continuous' || model === 'continuousInteger';
    }
  });

  Template.actuator_display.point = function(uuid) {
    var p = Points.find({'uuid': uuid}, {'reactive': !Session.get('loading')}).fetch()[0];
    return p;
  };

  Template.actuator_display.name = function() {
    var p = Points.find({'_id': this._id}).fetch()[0];
    var pathcomponents = p.Path.split("/");
    return pathcomponents[pathcomponents.length - 1].replace('_',' ').toProperCase();
  };

  Template.actuator_display.ploturl = function() {
    return Meteor.absoluteUrl('plot?'+getPermalink(this.uuid));
  };

  Template.point_display.point = function(uuid) {
    var p = Points.find({'uuid': uuid}, {'reactive': !Session.get('loading')}).fetch()[0];
    return p;
  };

  Template.point_display.rendered = function() {
   var uuid = this.data.uuid;
   Meteor.call('createPermalink', 
   {
      "streams":
      [
          {
              "uuid": uuid,
              "color": "#000000"
          },
      ],
      "autoupdate": true,
      "window_type": "now",
      "window_width": 86400000000000,
      "tz": "America/Los_Angeles",
    }, function(err, res) {
      updatePermalink(uuid, res);
    });
  };

  Template.point_display.ploturl = function() {
    return Meteor.absoluteUrl('plot?'+getPermalink(this.uuid));
  };

  Template.point_display.name = function() {
    var p = Points.find({'_id': this._id}).fetch()[0];
    var pathcomponents = p.Path.split("/");
    return pathcomponents[pathcomponents.length - 1].replace('_',' ').toProperCase();
  };

  /* Actuator Continuous */

  Template.actuator_continuous.rendered = function() {
    if (Meteor.isClient) {
      var that = getActuators(this.data.ActuatorUUID);
      var port = this.data.ServerPort;
      var min = 0;
      var max = 10;
      if (that.Actuator.MinValue) {
        min = that.Actuator.MinValue;
        max = that.Actuator.MaxValue;
      } else {
        var states = EJSON.parse(that.Actuator.States);
        min = states[0];
        max = states[1]
      }
      $("#"+this.data.ActuatorUUID).slider({
        min: min,
        max: max,
        step: 1,
        value: this.data.value
      }).on('slideStop', function(e) {
        Meteor.call("actuate", port, that.Path, e.value, function(err, res) {
          if (err) {
            console.log("ERROR", err);
          }
        });
        Session.set('loading',false);
      }).on('slideStart', function(e) {
        Session.set('loading', true);
      });
    }
  };

  Template.actuator_continuous.value = function() {
    if (Meteor.isClient) {
      var p = Points.find({'_id': this._id}, {'reactive': !Session.get('loading')}).fetch();
      $('#'+this.ActuatorUUID).slider('setValue', p[0].value);
      return p[0].value;
    }
  };

  /* Actuator Discrete */

  Template.actuator_discrete.rendered = function() {
    if (Meteor.isClient) {
      var that = getActuators(this.data.ActuatorUUID);
      var uuid = this.data.ActuatorUUID;
      $.each(that.Actuator.Values, function(idx, val) {
        $('#'+uuid).append($("<option></option>")
            .attr("value", idx)
            .text(val));
      });
    }
  };

  Template.actuator_discrete.events({
    'change': function(e) {
      console.log(e.target.selectedIndex);
    }
  });

  Template.actuator_discrete.value = function() {
    if (Meteor.isClient) {
      var p = Points.find({'_id': this._id}).fetch();
      $('#'+this.ActuatorUUID).val("0");
      return p[0].value;
    }
  };

  /* Actuator Binary */

  Template.actuator_binary.rendered = function() {
    if (Meteor.isClient) {
      var p = Points.find({'uuid': this.data.uuid}).fetch();
      if (p[0].value === 0) {
        $('#'+this.data.ActuatorUUID).removeClass("pressed");
      } else {
        $('#'+this.data.ActuatorUUID).addClass("pressed");
      }
    }
  };

  Template.actuator_binary.value = function() {
    if (Meteor.isClient) {
      var p = Points.find({'_id': this._id}).fetch();
      if (p[0].value === 0) {
        $('#'+this.ActuatorUUID).removeClass("pressed");
      } else {
        $('#'+this.ActuatorUUID).addClass("pressed");
      }
      return p[0].value;
    }
  };

  Template.actuator_binary.events({
    'click': function () {
      if (this.value === 1) {
        $('#'+this.ActuatorUUID).removeClass("pressed");
        var act = getActuators(this.ActuatorUUID);
        Meteor.call("actuate", this.ServerPort, act.Path, "0", function(err, res) {
          if (err) {
            console.log("ERROR", err);
          }
        });
      } else {
        var act = getActuators(this.ActuatorUUID);
        Meteor.call("actuate", this.ServerPort, act.Path, "1", function(err, res) {
          if (err) {
            console.log("ERROR", err);
          }
        });
        $('#'+this.ActuatorUUID).addClass("pressed");
      }
    }
  });

}
