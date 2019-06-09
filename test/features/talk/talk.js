'use strict';

const server = require('../../utils/server.js');
const assert = require('../../utils/assert.js');
const preq = require('preq');
const complexExpectedOutput = require('./expected-output/en.User_talk_Brion_VIBBER.895522398.json');
const complexListItemNestingExpectedOutput = require('./expected-output/en.User_talk_Montehurd.899425787.json');
const complexNonEnglishExpectedOutput = require('./expected-output/fr.User_talk_Brion_VIBBER.51609364.json');
const talk = require('../../../lib/talk/parser');
const domino = require('domino');
const replyData = require('../../../lib/talk/WMFReplyData');
const relationships = require('../../../lib/talk/parser-relationships');
const removal = require('../../../lib/talk/parser-removal');
const topic = require('../../../lib/talk/WMFTopic');

describe('talk-complex', function() {
  describe('ensure output produced matches expectations', () => {
    this.timeout(20000); // eslint-disable-line no-invalid-this

    before(() => server.start());

    function endpointResponse() {
        return preq.get(`${server.config.uri}en.wikipedia.org/v1/page/talk/User_talk:Brion_VIBBER/895522398/`);
    }

    function verifyNonZeroEndpointResults(response) {
        assert.equal(response.status, 200);
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

    it('produces expected topics and replies for revision of a complex user talk page', () => {
        return endpointResponse()
        .then((response) => {
            assert.equal(response.body.topics.length, 156);
            complexExpectedOutput.topics.forEach(function (topic, index) {
              assert.deepEqual(response.body.topics[index], topic);
            });
        });
    });

    it('produces expected topics and replies for revision of a talk page with complex list item nesting', () => {
        return preq.get(`${server.config.uri}en.wikipedia.org/v1/page/talk/User_talk:Montehurd/899425787/`)
        .then((response) => {
            assert.equal(response.body.topics.length, 1);
            complexListItemNestingExpectedOutput.topics.forEach(function (topic, index) {
              assert.deepEqual(response.body.topics[index], topic);
            });
        });
    });

    it('produces expected topics and replies for revision of a non-EN talk page', () => {
        return preq.get(`${server.config.uri}fr.wikipedia.org/v1/page/talk/User_talk:Brion_VIBBER/51609364/`)
        .then((response) => {
            assert.equal(response.body.topics.length, 12);
            complexNonEnglishExpectedOutput.topics.forEach(function (topic, index) {
              assert.deepEqual(response.body.topics[index], topic);
            });
        });
    });
  });
});

describe('talk-unit', () => {
    describe('createSha256', () => {
        it('generates expected sha for string', () => {
            assert.equal(
                topic.createSha256('Some string'),
                '2beaf0548e770c4c392196e0ec8e7d6d81cc9280ac9c7f3323e4c6abc231e95a'
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
          const tree = relationships.getFamilyTree(LI);
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
          const depth = replyData.getReplyDepth(el);
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
          const depth = replyData.getReplyDepth(el);
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
          const depth = replyData.getReplyDepth(el);
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
          const depth = replyData.getReplyDepth(el);
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
          const depth = replyData.getReplyDepth(el);
          assert.equal(
              depth, 3
          );
        });
    });
    describe('escapeHTML', () => {
        it('escapes tags', () => {
            const sha = 'This <i>is</i> fine.';
            assert.equal(
                removal.escapeHTML(sha),
                'This &lt;i&gt;is&lt;/i&gt; fine.'
            );
        });
        it('escapes ampersands', () => {
            const sha = 'This&nbsp;is&nbsp;fine.';
            assert.equal(
                removal.escapeHTML(sha),
                'This&amp;nbsp;is&amp;nbsp;fine.'
            );
        });
    });
    describe('pruneUnwantedAttributes', () => {
      const el = domino.createDocument(`
        <html>
          <body>
            <div style='a' id='b' class='c' rel='d' about='e' data-mw='f' typeof='g' bleep='h' bloop='i'>Hi</div>
          </body>
        </html>`).querySelector('div');

        removal.pruneUnwantedAttributes(el);

        it('removes style', () => {
            assert.equal(el.hasAttribute('style'), false);
        });
        it('removes id', () => {
            assert.equal(el.hasAttribute('id'), false);
        });
        it('removes class', () => {
            assert.equal(el.hasAttribute('class'), false);
        });
        it('removes rel', () => {
            assert.equal(el.hasAttribute('rel'), false);
        });
        it('removes about', () => {
            assert.equal(el.hasAttribute('about'), false);
        });
        it('removes data-mw', () => {
            assert.equal(el.hasAttribute('data-mw'), false);
        });
        it('removes typeof', () => {
            assert.equal(el.hasAttribute('typeof'), false);
        });
        it('leaves bleep', () => {
            assert.equal(el.hasAttribute('bleep'), true);
        });
        it('leaves bloop', () => {
            assert.equal(el.hasAttribute('bloop'), true);
        });
    });
    describe('textFromTextNode', () => {
      const doc = domino.createDocument('');
      it('gets text', () => {
        const node = doc.createTextNode('Hi there');
        assert.equal(
            removal.textFromTextNode(node),
            'Hi there'
        );
      });
      it('escapes tags and ampersands', () => {
        const node = doc.createTextNode('Some <i>tags</i> and&nbsp;ampersands.');
        assert.equal(
            removal.textFromTextNode(node),
            'Some &lt;i&gt;tags&lt;/i&gt; and&amp;nbsp;ampersands.'
        );
      });
    });
    describe('textFromPreservedElementNode', () => {
      it('preserve nested bold, italic and anchor', () => {
        const elementHTML = '' +
        '<b>' + // bold is a preserved element
          'keep nested <b>bold</b> and <i>italic</i> and <a href="test">anchor</a> tags' +
        '</b>';
        const el = domino.createDocument(elementHTML).querySelector('b');

        const expectedOutput = '' +
        '<b>' +
          'keep nested <b>bold</b> and <i>italic</i> and <a href="test">anchor</a> tags' +
        '</b>';

        assert.equal(removal.textFromPreservedElementNode(el), expectedOutput);
      });
      it('removes img and other tags', () => {
        const elementHTML = '' +
        '<b>' +
          'do not keep image tags <img src="">' +
          '<other>do not keep other tags, but keep their text content</other>' +
        '</b>';
        const el = domino.createDocument(elementHTML).querySelector('b');
        const expectedOutput = '' +
        '<b>' +
          'do not keep image tags ' +
          'do not keep other tags, but keep their text content' +
        '</b>';
        assert.equal(removal.textFromPreservedElementNode(el), expectedOutput);
      });
      it('handle deep nesting', () => {
        const elementHTML = '' +
        '<b>' +
          'handle deep nesting' +
          '<i>italic' +
            '<a href="test">anchor' +
              '<other>' +
                'other' +
                '<b>' +
                  'bold' +
                '</b>' +
              '</other>' +
              '<img src="">' +
              'bla' +
            '</a>' +
          '</i>' +
        '</b>';
        const el = domino.createDocument(elementHTML).querySelector('b');
        const expectedOutput = '' +
        '<b>' +
          'handle deep nesting' +
          '<i>italic' +
            '<a href="test">anchor' +
                'other' +
                '<b>' +
                  'bold' +
                '</b>' +
              'bla' +
            '</a>' +
          '</i>' +
        '</b>';
        assert.equal(removal.textFromPreservedElementNode(el), expectedOutput);
      });
      it('shows file name from href in brackets if anchor has no text', () => {
        const elementHTML = '' +
        '<a href="test/someFileName">' +
        '</a>';
        const el = domino.createDocument(elementHTML).querySelector('a');
        const expectedOutput = '' +
        '<a href="test/someFileName">' +
        '[someFileName]' +
        '</a>';
        assert.equal(removal.textFromPreservedElementNode(el), expectedOutput);
      });
    });
});
