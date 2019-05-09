'use strict';

const server = require('../../utils/server.js');
const assert = require('../../utils/assert.js');
const preq = require('preq');
const sample = require('./User_talk_Brion_VIBBER_895522398');
const talk = require('../../../lib/talk');

describe('talk', function() {
    this.timeout(20000); // eslint-disable-line no-invalid-this

    before(() => server.start());

    function endpointUri() {
        return `${server.config.uri}en.wikipedia.org/v1/page/talk/User_talk:Brion_VIBBER/895522398/`;
    }

    function endpointResponse() {
        return preq.get(endpointUri());
    }

    function verifyNonZeroEndpointResults(response) {
        assert.deepEqual(response.status, 200);
        assert.ok(response.body.topics.length > 0,
            'Should have fetched some results');
    }

    function fetchAndVerifyNonZeroResultsForEndpoint() {
        return endpointResponse()
        .then((response) => {
            verifyNonZeroEndpointResults(response);
        });
    }

    it('Fetches some results', () => {
        return fetchAndVerifyNonZeroResultsForEndpoint();
    });

    it('Fetches expected topics for revision', () => {
        return endpointResponse()
        .then((response) => {
            assert.equal(response.body.topics.length, 156);
            sample.topics.forEach(function (topic, index) {
              assert.deepEqual(response.body.topics[index], topic);
            });
        });
    });
});

describe('talk-unit', () => {
    describe('sha', () => {
        it('generates sha for string', () => {
            assert.equal(
                talk.createSha1('Some string'),
                '3febe4d69db2a2d620fa73388dbd3aed38be5575'
            );
        });
    });
});
