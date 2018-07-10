'use strict';

const assert = require('../../utils/assert.js');
const headers = require('../../utils/headers.js');
const preq = require('preq');

exports.shouldBehaveLikeMobileSections = function(localUri) {
    it('should respond to GET request with expected headers, incl. CORS and CSP headers', () => {
        const uri = localUri('Foobar');
        return headers.checkHeaders(uri);
    });

    it('Supports revision number in request URL', () => {
        const title = '%2Fr%2FThe_Donald';
        const rev = 764101607;
        const uri = localUri(`${title}/${rev}`);
        return preq.get({ uri })
        .then((res) => {
            assert.equal(res.body.lead.revision, rev,
                'the requested revision should be returned');
        });
    });

    it('Supports revision number and tid string in request URL', () => {
        const title = '%2Fr%2FThe_Donald';
        const rev = 764101607;
        const tid = 'b24de3d0-ecde-11e6-a863-ed5fc1010eed';
        const uri = localUri(`${title}/${rev}/${tid}`);
        return preq.get({ uri })
        .then((res) => {
            assert.equal(res.body.lead.revision, rev,
                'We return the page with requested revision and tid');
        });
    });

    it('Mixmatch valid title and valid revision id gives 404', () => {
        const title = '%2Fr%2FThe_Donald';
        const rev = 752758357; // belongs to Roald Dahl
        const uri = localUri(`${title}/${rev}`);
        return preq.get({ uri })
        .catch((res) => {
            assert.equal(res.status, 404);
        });
    });

    it('Bad revision id gives bad request', () => {
        const title = '%2Fr%2FThe_Donald'; // belongs to Roald Dahl
        const rev = 'Reddit';
        const uri = localUri(`${title}/${rev}`);
        return preq.get({ uri })
        .catch((res) => {
            assert.equal(res.status, 400, 'Should be integer');
        });
    });

    it('Check content of fixed revision', () => {
        const title = 'Leonard_Cohen';
        const rev = 747517267; // revision before his death.
        const uri = localUri(`${title}/${rev}`);
        return preq.get({ uri })
        .then((res) => {
            let hasDeathSection = false;
            res.body.remaining.sections.forEach((section) => {
                if (section.line === 'Death') {
                    hasDeathSection = true;
                }
            });
            assert.ok(!hasDeathSection, 'Leonard Cohen did not use to be dead. RIP dear man...');
        });
    });

    it('Missing title should respond with 404', () => {
        const uri = localUri('weoiuyrxcmxn', 'test.wikipedia.org');
        return preq.get({ uri })
        .then(() => {
            assert.fail("expected an exception to be thrown");
        }).catch((res) => {
            assert.equal(res.status, 404);
        });
    });

    it('Redirects should not be followed in MCS', () => {
        // The following page has a redirect but we don't want MCS to follow it
        // since RESTBase already takes care of redirects.
        const title = `User:BSitzmann_%28WMF%29%2FMCS%2FTest%2Fredirect_test2`;
        const normalizedTitle = 'User:BSitzmann (WMF)/MCS/Test/redirect test2';
        const uri = localUri(title, 'test.wikipedia.org');
        return preq.get({ uri })
        .then((res) => {
            assert.equal(res.status, 200);
            assert.equal(res.body.lead.normalizedtitle, normalizedTitle);
            assert.equal(res.body.lead.displaytitle, normalizedTitle);
            assert.ok(res.body.lead.redirect === true);
        });
    });
};
