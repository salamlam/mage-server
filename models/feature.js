var mongoose = require('mongoose')
  , async = require('async')
  , moment = require('moment')
  , Layer = require('../models/layer');

var Schema = mongoose.Schema;

var StateSchema = new Schema({
  name: { type: String, required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User' }
});

var AttachmentSchema = new Schema({
  contentType: { type: String, required: false },  
  size: { type: Number, required: false },  
  name: { type: String, required: false },
  relativePath: { type: String, required: true },
  width: { type: Number, required: false },
  height: { type: Number, required: false},
  thumbnails: [ThumbnailSchema]
});

var ThumbnailSchema = new Schema({
  contentType: { type: String, required: false },  
  size: { type: Number, required: false },  
  name: { type: String, required: false },
  relativePath: { type: String, required: true },
  width: { type: Number, required: false },
  height: { type: Number, required: false}
});

// Creates the Schema for the Attachments object
var FeatureSchema = new Schema({
  type: {type: String, required: true},
  lastModified: {type: Date, required: false},
  userId: {type: Schema.Types.ObjectId, required: false, sparse: true},
  deviceId: {type: Schema.Types.ObjectId, required: false, sparse: true},
  geometry: Schema.Types.Mixed,
  properties: Schema.Types.Mixed,
  attachments: [AttachmentSchema],
  states: [StateSchema]
});

FeatureSchema.index({geometry: "2dsphere"});
FeatureSchema.index({'lastModified': 1});
FeatureSchema.index({'userId': 1});
FeatureSchema.index({'deviceId': 1});
FeatureSchema.index({'properties.type': 1});
FeatureSchema.index({'properties.timestamp': 1});
FeatureSchema.index({'states.name': 1});

var models = {};
var Attachment = mongoose.model('Attachment', AttachmentSchema);
var Thumbnail = mongoose.model('Thumbnail', ThumbnailSchema);
var State = mongoose.model('State', StateSchema);

// return a string for each property
var convertFieldForQuery = function(field, keys, fields) {
  keys = keys || [];
  fields = fields || {};

  for (var childField in field) {
    keys.push(childField);
    if (Object(field[childField]) === field[childField]) {
      convertFieldForQuery(field[childField], keys, fields);
    } else {
      var key = keys.join(".");
      if (field[childField]) fields[key] = field[childField];
      keys.pop();
    }
  }

  return fields;
}

var parseFields = function(fields) {
  if (fields) {
    var state = fields.state ? true : false;
    delete fields.state;

    fields = convertFieldForQuery(fields);
    if (fields.id === undefined) fields.id = true; // default is to return id if not specified
    if (fields.type === undefined) fields.type = true; // default is to return type if not specified

    if (state) {
      fields.states = {$slice: 1};
    }

    return fields;
  } else {
    return { states: {$slice: 1}, 'attachments.thumbnails': false };
  }
}

var featureModel = function(layer) {
  var name = layer.collectionName;
  var model = models[name];
  if (!model) {
    // Creates the Model for the Features Schema
    var model = mongoose.model(name, FeatureSchema, name);
    models[name] = model;
  }

  return model;
}

exports.featureModel = featureModel;

exports.getFeatures = function(layer, o, callback) {
  var conditions = {};
  var fields = parseFields(o.fields);
  console.log('fields', fields);

  var query = featureModel(layer).find(conditions, fields);

  var filter = o.filter || {};
  // Filter by geometry
  if (filter.geometry) {
    query.where('geometry').intersects.geometry(filter.geometry);
  }

  if (filter.startDate) {
    query.where('lastModified').gte(filter.startDate);
  }

  if (filter.endDate) {
    query.where('lastModified').lt(filter.endDate);
  }

  if (filter.states) {
    query.where('states.0.name').in(filter.states);
  }

  query.exec(function (err, features) {
    if (err) {
      console.log("Error finding features in mongo: " + err);
    }
    
    callback(features);
  });
}

exports.getFeatureById = function(layer, id, options, callback) {
  if (id !== Object(id)) {
    id = {id: id, field: '_id'};
  }

  var conditions = {};
  conditions[id.field] = id.id;

  var fields = parseFields(options.fields);

  featureModel(layer).findOne(conditions, fields).exec(function (err, feature) {
    if (err) {
      console.log("Error finding feature in mongo: " + err);
    }

    callback(feature);
  });
}

exports.createFeature = function(layer, feature, callback) {
  feature.lastModified = moment.utc().toDate();

  featureModel(layer).create(feature, function(err, newFeature) {
    if (err) {
      console.log(JSON.stringify(err));
    }

    callback(newFeature);
  });
}

exports.createFeatures = function(layer, features, callback) {
  features.forEach(function(feature) {
    feature.properties = feature.properties || {};
  });

  featureModel(layer).create(features, function(err) {
    callback(err, features);
  });
}

exports.createGeoJsonFeature = function(layer, feature, callback) {
  var properties = feature.properties ? feature.properties : {};

  featureModel(layer).create(feature, function(err, newFeature) {
    if (err) {
      console.log('Error creating feature', err);
      console.log('feature is: ', feature);
    }

    callback(err, newFeature);
  }); 
}

exports.updateFeature = function(layer, id, feature, callback) {
  if (id !== Object(id)) {
    id = {id: id, field: '_id'};
  }

  var query = {};
  query[id.field] = id.id;
  var update = {
    geometry: feature.geometry,
    properties: feature.properties || {}
  };
  update.lastModified = moment.utc().toDate();

  featureModel(layer).findOneAndUpdate(query, update, {new: true}, function (err, updatedFeature) {
    if (err) {
      console.log('Could not update feature', err);
    }

    callback(err, updatedFeature);
  });
}

exports.removeFeature = function(layer, id, callback) {
  if (id !== Object(id)) {
    id = {id: id, field: '_id'};
  }

  var query = {};
  query[id.field] = id.id;
  featureModel(layer).findOneAndRemove(query, function (err, feature) {
    if (err) {
      console.log('Could not remove feature', err);
    }

    callback(err, feature);
  });
}

exports.removeUser = function(user, callback) {
  var condition = { userId: user._id };
  var update = { '$unset': { userId: true } };
  var options = { multi: true };

  Layer.getLayers({type: 'Feature'}, function(err, layers) {
    async.each(layers, function(layer, done) {
      featureModel(layer).update(condition, update, options, function(err, numberAffected) {
        console.log('Remove deleted user from ' + numberAffected + ' documents for layer ' + layer.name);
        done();
      });
    },
    function(err){
      callback();
    });
  });
}

exports.removeDevice = function(device, callback) {
  var condition = { deviceId: device._id };
  var update = { '$unset': { deviceId: true } };
  var options = { multi: true };

  Layer.getLayers({type: 'Feature'}, function(err, layers) {
    async.each(layers, function(layer, done) {
      featureModel(layer).update(condition, update, options, function(err, numberAffected) {
        console.log('Remove deleted device from ' + numberAffected + ' documents for layer ' + layer.name);
        done();
      });
    },
    function(err){
      callback();
    });
  });
}

// IMPORTANT:
// This is a complete hack to get the new state to insert into
// the beginning of the array.  Once mongo 2.6 is released
// we can use the $push -> $each -> $position operator
exports.addState = function(layer, id, state, callback) {
  var condition = {_id: mongoose.Types.ObjectId(id), 'states.0.name': {'$ne': state.name}};

  state._id = mongoose.Types.ObjectId();
  var update = {
    '$set': {
      'states.-1': state, 
      lastModified: moment.utc().toDate()
    }
  };

  featureModel(layer).collection.update(condition, update, {upsert: true}, function(err) {
    callback(err, state);
  });
}

exports.getAttachments = function(layer, id, callback) {
  var query = {};
  query[id.field] = id.id;
  var fields = {attachments: 1};
  featureModel(layer).findOne(query, fields, function(err, feature) {
    callback(feature.attachments);
  });
}

exports.getAttachment = function(layer, id, attachmentId, callback) {
  var query = {};
  query[id.field] = id.id;
  var fields = {attachments: 1};
  featureModel(layer).findOne(query, fields, function(err, feature) {
    var attachments = feature.attachments.filter(function(attachment) {
      return (attachment.id == attachmentId);
    });

    var attachment = attachments.length ? attachments[0] : null;
    callback(attachment);
  });
}

exports.addAttachment = function(layer, id, file, callback) {  
  if (id !== Object(id)) {
    id = {id: id, field: '_id'};
  }

  var condition = {};
  condition[id.field] = id.id;
  var attachment = new Attachment({
    contentType: file.headers['content-type'],  
    size: file.size,
    name: file.name,
    relativePath: file.relativePath
  });

  var update = {'$push': { attachments: attachment }, 'lastModified': new Date()};
  featureModel(layer).update(condition, update, function(err, feature) {
    if (err) {
      console.log('Error updating attachments from DB', err);
    }

    callback(err, attachment);
  });
}

exports.updateAttachment = function(layer, attachmentId, file, callback) {
  var condition = {'attachments.id': attachmentId};
  var update = {
    '$set': {
      'attachments.$.name': filesname,
      'attachments.$.type': file.type,
      'attachments.$.size': file.size
    },
    lastModified: new Date()
  };

  featureModel(layer).update(condition, update, function(err, feature) {
    if (err) {
      console.log('Error updating attachments from DB', err);
    }

    callback(err);
  });
}

exports.removeAttachment = function(feature, id, callback) {
  var attachments = {};
  attachments[id.field] = id.id;
  feature.update({'$pull': {attachments: attachments}}, function(err, number, raw) {
    if (err) {
      console.log('Error pulling attachments from DB', err);
    }

    callback(err);
  });
}

exports.addAttachmentThumbnail = function(layer, featureId, attachmentId, thumbnail, callback) {
  var thumb = new Thumbnail(thumbnail);
  var condition = {'attachments._id': attachmentId};
  var update = {'$push': { 'attachments.$.thumbnails': thumbnail }};
  featureModel(layer).update(condition, update, function(err, feature) {
    if (err) {
      console.log('Error updating thumbnails to DB', err);
    }
    callback(err);
  });

}