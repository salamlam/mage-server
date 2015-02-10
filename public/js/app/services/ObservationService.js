'use strict';

angular.module('mage').factory('ObservationService', ['$q', 'Observation', 'ObservationAttachment', 'ObservationState',
  function ($q, Observation, ObservationAttachment, ObservationState) {
    var ***REMOVED*** = {};

    function transformObservations(observations, event) {
      if (!_.isArray(observations)) observations = [observations];

      _.each(observations, function(observation) {
        observation.eventId = event.id;
        observation.iconUrl = "/api/events/" + event.id + "/form/icons/" + observation.properties.type + "/" + observation.properties[event.form.variantField];
      });
    }

    ***REMOVED***.getObservationsForEvent = function(event) {
      var deferred = $q.defer();

      Observation.query({eventId: event.id, states: 'active'}, function(observations) {
        transformObservations(observations, event);

        deferred.resolve(observations);
      });

      return deferred.promise;
    }

    ***REMOVED***.saveObservationForEvent = function(event, observation) {
      var deferred = $q.defer();

      var observationId = observation.id;
      observation.$save({}, function(updatedObservation) {
        transformObservations(updatedObservation, event);

        deferred.resolve(updatedObservation);
      });

      return deferred.promise;
    }

    ***REMOVED***.archiveObservationForEvent = function(event, observation) {
      var deferred = $q.defer();

      ObservationState.save({eventId: event.id, observationId: observation.id}, {name: 'archive'}, function(state) {
        transformObservations(observation, event);

        observation.state = state;
        deferred.resolve(observation);
      });

      return deferred.promise;
    }

    ***REMOVED***.addAttachmentToObservationForEvent = function(event, observation, attachment) {
      observation.attachments.push(attachment);
    }

    ***REMOVED***.deleteAttachmentInObservationForEvent = function(event, observation, attachment) {
      var deferred = $q.defer();

      var eventId = observation.eventId;
      var observationId = observation.id;
      ObservationAttachment.delete({eventId: event.id, observationId: observation.id, id: attachment.id}, function(success) {
        observation.attachments = _.reject(observation.attachments, function(a) { return attachment.id === a.id});

        deferred.resolve(observation);
      });

      return deferred.promise;
    }

    return ***REMOVED***;
  }
]);
