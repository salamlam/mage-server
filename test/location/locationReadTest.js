var request = require('supertest')
  , sinon = require('sinon')
  , mongoose = require('mongoose')
  , moment = require('moment')
  , should = require('chai').should()
  , MockToken = require('../mockToken')
  , app = require('../../express')
  , TokenModel = mongoose.model('Token');

require('sinon-mongoose');

require('../../models/team');
var TeamModel = mongoose.model('Team');

require('../../models/event');
var EventModel = mongoose.model('Event');

require('../../models/location');
var LocationModel = mongoose.model('Location');

require('../../models/cappedLocation');
var CappedLocationModel = mongoose.model('CappedLocation');

describe("location read tests", function() {

  var sandbox;
  before(function() {
    sandbox = sinon.sandbox.create();
  });

  beforeEach(function() {
    var mockEvent = new EventModel({
      _id: 1,
      name: 'Event 1',
      collectionName: 'observations1',
      teams: [{
        name: 'Team 1'
      }]
    });

    sandbox.mock(EventModel)
      .expects('findById')
      .yields(null, mockEvent);
  });

  afterEach(function() {
    sandbox.restore();
  });

  var userId = mongoose.Types.ObjectId();
  function mockTokenWithPermission(permission) {
    sandbox.mock(TokenModel)
      .expects('findOne')
      .withArgs({token: "12345"})
      .chain('populate', 'userId')
      .chain('exec')
      .yields(null, MockToken(userId, [permission]));
  }

  it("should get locations with read all permission", function(done) {
    mockTokenWithPermission('READ_LOCATION_ALL');

    sandbox.mock(TeamModel)
      .expects('find')
      .yields(null, [{ name: 'Team 1' }]);

    sandbox.mock(EventModel)
      .expects('populate')
      .yields(null, {
        name: 'Event 1',
        teamIds: [{
          name: 'Team 1',
          userIds: [userId]
        }]
      });

    sandbox.mock(LocationModel)
      .expects('find')
      .yields(null, [{
        "eventId": 1,
        "geometry": {
          "type": "Point",
          "coordinates": [0, 0]
        },
        "properties": {
          "timestamp": Date.now(),
          "accuracy": 39
        }
      }]);

    request(app)
      .get('/api/events/1/locations')
      .set('Accept', 'application/json')
      .set('Authorization', 'Bearer 12345')
      .expect(200)
      .expect(function(res) {
        var locations = res.body;
        should.exist(locations);
        locations.should.be.an('array');
        locations.should.have.length(1);
      })
      .end(done);
  });

  it("should get locations with event read permission", function(done) {
    mockTokenWithPermission('READ_LOCATION_EVENT');

    sandbox.mock(TeamModel)
      .expects('find')
      .yields(null, [{ name: 'Team 1' }]);

    sandbox.mock(EventModel)
      .expects('populate')
      .yields(null, {
        name: 'Event 1',
        teamIds: [{
          name: 'Team 1',
          userIds: [userId]
        }]
      });

    sandbox.mock(LocationModel)
      .expects('find')
      .yields(null, [{
        "eventId": 1,
        "geometry": {
          "type": "Point",
          "coordinates": [0, 0]
        },
        "properties": {
          "timestamp": Date.now(),
          "accuracy": 39
        }
      }]);

    request(app)
      .get('/api/events/1/locations')
      .set('Accept', 'application/json')
      .set('Authorization', 'Bearer 12345')
      .expect(200)
      .expect(function(res) {
        var locations = res.body;
        should.exist(locations);
        locations.should.be.an('array');
        locations.should.have.length(1);
      })
      .end(done);
  });

  it("should get locations grouped by user", function(done) {
    mockTokenWithPermission('READ_LOCATION_EVENT');

    sandbox.mock(TeamModel)
      .expects('find')
      .yields(null, [{ name: 'Team 1' }]);

    sandbox.mock(EventModel)
      .expects('populate')
      .yields(null, {
        name: 'Event 1',
        teamIds: [{
          name: 'Team 1',
          userIds: [userId]
        }]
      });

    sandbox.mock(CappedLocationModel)
      .expects('find')
      .chain('lean')
      .chain('exec')
      .yields(null, [{
        locations:[{
          type: "Feature",
          userId: "56a8d5be03c39d15241f86df",
          properties: {
            timestamp: "2016-02-02T14:42:13.811Z",
            accuracy: 39,
            deviceId: "56a8d5b81db0452f4d7ec6a0"
          },
          eventId: 1,
          geometry: {
            type: "Point",
            coordinates: [0, 0]
          },
          teamIds: ["56a8eabc1205e577246e3f36"]
        }]
      }]);

    request(app)
      .get('/api/events/1/locations/users')
      .set('Accept', 'application/json')
      .set('Authorization', 'Bearer 12345')
      .expect(200)
      .expect(function(res) {
        var users = res.body;
        should.exist(users);
        users.should.be.an('array').and.have.length(1);
        var user = users[0];
        user.should.have.property('locations');
      })
      .end(done);
  });

  it("should filter locations on startDate/endDate with event read permission", function(done) {
    mockTokenWithPermission('READ_LOCATION_EVENT');

    sandbox.mock(TeamModel)
      .expects('find')
      .yields(null, [{ name: 'Team 1' }]);

    sandbox.mock(EventModel)
      .expects('populate')
      .yields(null, {
        name: 'Event 1',
        teamIds: [{
          name: 'Team 1',
          userIds: [userId]
        }]
      });

    var startDate = moment("2016-01-01T00:00:00");
    var endDate = moment("2016-02-01T00:00:00");
    sandbox.mock(LocationModel)
      .expects('find')
      .withArgs({
        eventId: 1,
        'properties.timestamp': {
          $gte: startDate.toDate(),
          $lt: endDate.toDate()
        }
      })
      .yields(null, [{
        "eventId": 1,
        "geometry": {
          "type": "Point",
          "coordinates": [0, 0]
        },
        "properties": {
          "timestamp": Date.now(),
          "accuracy": 39
        }
      }]);

    request(app)
      .get('/api/events/1/locations')
      .query({startDate: startDate.toISOString(), endDate: endDate.toISOString()})
      .set('Accept', 'application/json')
      .set('Authorization', 'Bearer 12345')
      .expect(200)
      .expect(function(res) {
        var locations = res.body;
        should.exist(locations);
        locations.should.be.an('array');
        locations.should.have.length(1);
      })
      .end(done);
  });

  it("should page locations with event read permission", function(done) {
    mockTokenWithPermission('READ_LOCATION_EVENT');

    sandbox.mock(TeamModel)
      .expects('find')
      .yields(null, [{ name: 'Team 1' }]);

    sandbox.mock(EventModel)
      .expects('populate')
      .yields(null, {
        name: 'Event 1',
        teamIds: [{
          name: 'Team 1',
          userIds: [userId]
        }]
      });

    var startDate = moment("2016-01-01T00:00:00");
    var endDate = moment("2016-02-01T00:00:00");
    var lastLocationId = mongoose.Types.ObjectId();
    sandbox.mock(LocationModel)
      .expects('find')
      .withArgs({
        $or: [{
          _id: { $gt: lastLocationId.toString() },
          'properties.timestamp': startDate.toDate()
        },{
          'properties.timestamp': {
            $gt: startDate.toDate()
          }
        }],
        eventId: 1,
        'properties.timestamp': {
          $lt: endDate.toDate()
        }
      })
      .yields(null, [{
        "eventId": 1,
        "geometry": {
          "type": "Point",
          "coordinates": [0, 0]
        },
        "properties": {
          "timestamp": Date.now(),
          "accuracy": 39
        }
      }]);

    request(app)
      .get('/api/events/1/locations')
      .query({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        lastLocationId: lastLocationId.toString()
      })
      .set('Accept', 'application/json')
      .set('Authorization', 'Bearer 12345')
      .expect(200)
      .expect(function(res) {
        var locations = res.body;
        should.exist(locations);
        locations.should.be.an('array');
        locations.should.have.length(1);
      })
      .end(done);
  });

  it("should limit locations with event read permission", function(done) {
    mockTokenWithPermission('READ_LOCATION_EVENT');

    sandbox.mock(TeamModel)
      .expects('find')
      .yields(null, [{ name: 'Team 1' }]);

    sandbox.mock(EventModel)
      .expects('populate')
      .yields(null, {
        name: 'Event 1',
        teamIds: [{
          name: 'Team 1',
          userIds: [userId]
        }]
      });

    sandbox.mock(LocationModel)
      .expects('find')
      .withArgs(sinon.match.any, sinon.match.any, { limit: 10, sort: { _id: 1, 'properties.timestamp': 1 } })
      .yields(null, [{
        "eventId": 1,
        "geometry": {
          "type": "Point",
          "coordinates": [0, 0]
        },
        "properties": {
          "timestamp": Date.now(),
          "accuracy": 39
        }
      }]);

    request(app)
      .get('/api/events/1/locations')
      .query({limit: 10})
      .set('Accept', 'application/json')
      .set('Authorization', 'Bearer 12345')
      .expect(200)
      .expect(function(res) {
        var locations = res.body;
        should.exist(locations);
        locations.should.be.an('array');
        locations.should.have.length(1);
      })
      .end(done);
  });

  it("should deny locations with read event permission when not in event", function(done) {
    mockTokenWithPermission('READ_LOCATION_EVENT');

    sandbox.mock(TeamModel)
      .expects('find')
      .yields(null, [{ name: 'Team 1' }]);

    sandbox.mock(EventModel)
      .expects('populate')
      .yields(null, {
        name: 'Event 1',
        teamIds: [{
          name: 'Team 1',
          userIds: [mongoose.Types.ObjectId()]
        }]
      });

    sandbox.mock(LocationModel)
      .expects('find')
      .yields(null, [{
        "eventId": 1,
        "geometry": {
          "type": "Point",
          "coordinates": [0, 0]
        },
        "properties": {
          "timestamp": Date.now(),
          "accuracy": 39
        }
      }]);

    request(app)
      .get('/api/events/1/locations')
      .set('Accept', 'application/json')
      .set('Authorization', 'Bearer 12345')
      .expect(403)
      .end(done);
  });
});
