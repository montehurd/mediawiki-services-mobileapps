'use strict';

const server = require('../../utils/server.js');
const assert = require('../../utils/assert.js');
const preq = require('preq');
const sample = require('./User_talk_Brion_VIBBER_895522398');
const talk = require('../../../lib/talk');
const domino = require('domino');

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

    it('fetches some results', () => {
        return fetchAndVerifyNonZeroResultsForEndpoint();
    });

    it('produces expected topics and replies for a revision of a complex talk page', () => {
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
    describe('createSha1', () => {
        it('generates expected sha for string', () => {
            assert.equal(
                talk.createSha1('Some string'),
                '3febe4d69db2a2d620fa73388dbd3aed38be5575'
            );
        });
    });
    describe('shortenSha', () => {
        it('shortens sha to first 7 chars', () => {
            const sha = '3febe4d69db2a2d620fa73388dbd3aed38be5575';
            assert.deepEqual(
                talk.shortenSha(sha),
                '3febe4d'
            );
        });
    });
    describe('getFamilyTree', () => {
        it('gets expected family tree', () => {
          const LI = domino.createDocument(`
            <html>
              <body>
                <div>
                  <ul>
                    <li id='yo'>Hi
                  </ul>
                </div>
              </body>
            </html>`).querySelector('#yo');
          const tree = talk.getFamilyTree(LI);
          assert.deepEqual(
              tree.map(e => e.tagName), ['LI', 'UL', 'DIV', 'BODY', 'HTML']
          );
        });
    });
    describe('getReplyDepth', () => {
        it('expected depth in list', () => {
          const el = domino.createDocument(`
            <html>
              <body>
                <div>
                  <ul>
                    <li><div id='sought'>Hi</div>
                  </ul>
                </div>
              </body>
            </html>`).querySelector('#sought');
          const depth = talk.getReplyDepth(el);
          assert.equal(
              depth, 1
          );
        });
        it('expected depth in list nested in list', () => {
          const el = domino.createDocument(`
            <html>
              <body>
                <div>
                  <ol>
                    <li>
                      <ul>
                        <li><div id='sought'>Hi</div>
                      </ul>
                  </ol>
                </div>
              </body>
            </html>`).querySelector('#sought');
          const depth = talk.getReplyDepth(el);
          assert.equal(
              depth, 2
          );
        });
        it('expected depth in div', () => {
          const el = domino.createDocument(`
            <html>
              <body>
                <div id='sought'>Hi</div>
              </body>
            </html>`).querySelector('#sought');
          const depth = talk.getReplyDepth(el);
          assert.equal(
              depth, 0
          );
        });
        it('expected depth in dl', () => {
          const el = domino.createDocument(`
            <html>
              <body>
                <div>
                  <dl>
                    <dt>Coffee</dt>
                    <dd id='sought'>Black</dd>
                    <dt>Milk</dt>
                    <dd>White</dd>
                  </dl>
                </div>
              </body>
            </html>`).querySelector('#sought');
          const depth = talk.getReplyDepth(el);
          assert.equal(
              depth, 1
          );
        });
        it('expected depth in list nested in list nested in dl', () => {
          const el = domino.createDocument(`
            <html>
              <body>
                <div>
                  <dl>
                    <dt>Coffee</dt>
                    <dd>
                      <ol>
                        <li>
                          <ul>
                            <li><div id='sought'>Hi</div>
                          </ul>
                      </ol>
                    </dd>
                    <dt>Milk</dt>
                    <dd>White</dd>
                  </dl>
                </div>
              </body>
            </html>`).querySelector('#sought');
          const depth = talk.getReplyDepth(el);
          assert.equal(
              depth, 3
          );
        });
    });
    describe('escapeHTML', () => {
        it('escapes tags', () => {
            const sha = 'This <i>is</i> fine.';
            assert.deepEqual(
                talk.escapeHTML(sha),
                'This &lt;i&gt;is&lt;/i&gt; fine.'
            );
        });
        it('escapes ampersands', () => {
            const sha = 'This&nbsp;is&nbsp;fine.';
            assert.deepEqual(
                talk.escapeHTML(sha),
                'This&amp;nbsp;is&amp;nbsp;fine.'
            );
        });
    });
});
