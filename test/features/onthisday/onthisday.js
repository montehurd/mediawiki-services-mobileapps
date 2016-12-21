'use strict';

/* eslint-disable max-len */

const server = require('../../utils/server.js');
const onThisDay = require('../../../routes/on-this-day.js')();
const assert = require('../../utils/assert.js');


// MOCKS

const REQUEST_FOR_EN_01_30 = {
    params: {
        mm: '01',
        dd: '30',
        domain: 'en.wikipedia.org'
    }
};

const REQUEST_FOR_EN_12_01 = {
    params: {
        mm: '12',
        dd: '01',
        domain: 'en.wikipedia.org'
    }
};

const REQUEST_FOR_EN_1_1 = {
    params: {
        mm: '1',
        dd: '1',
        domain: 'en.wikipedia.org'
    }
};


// TESTS

describe('onthisday', function() {

    this.timeout(20000); // eslint-disable-line no-invalid-this

    before(() => { return server.start(); });


    // FIXME: these tests fail because onthisday etags are not yet in place...
    /*
    it('"births" should respond to GET request with expected headers, incl. CORS and CSP headers', () => {
        return headers.checkHeaders(`${server.config.uri}en.wikipedia.org/v1/onthisday/births/01/01`);
    });
    it('"deaths" should respond to GET request with expected headers, incl. CORS and CSP headers', () => {
        return headers.checkHeaders(`${server.config.uri}en.wikipedia.org/v1/onthisday/deaths/01/01`);
    });
    it('"events" should respond to GET request with expected headers, incl. CORS and CSP headers', () => {
        return headers.checkHeaders(`${server.config.uri}en.wikipedia.org/v1/onthisday/events/01/01`);
    });
    it('"selected" should respond to GET request with expected headers, incl. CORS and CSP headers', () => {
        return headers.checkHeaders(`${server.config.uri}en.wikipedia.org/v1/onthisday/selected/01/01`);
    });
    it('"all" should respond to GET request with expected headers, incl. CORS and CSP headers', () => {
        return headers.checkHeaders(`${server.config.uri}en.wikipedia.org/v1/onthisday/all/01/01`);
    });
    */


    it('dayPageTitleFromMonthAndDayNumberStrings returns expected title for 1 digit month and 1 digit day', () => {
        assert.deepEqual(onThisDay.dayPageTitleFromMonthAndDayNumberStrings('1', '1'), 'January_1');
    });
    it('dayPageTitleFromMonthAndDayNumberStrings returns expected title for 0 padded month and 1 digit day', () => {
        assert.deepEqual(onThisDay.dayPageTitleFromMonthAndDayNumberStrings('01', '1'), 'January_1');
    });
    it('dayPageTitleFromMonthAndDayNumberStrings returns expected title for 0 padded month and 0 padded day', () => {
        assert.deepEqual(onThisDay.dayPageTitleFromMonthAndDayNumberStrings('01', '01'), 'January_1');
    });


    it('dayURIForRequest returns expected URI for 0 padded month and 2 digit day', () => {
        assert.deepEqual(onThisDay.dayURIForRequest(REQUEST_FOR_EN_01_30), 'https://en.wikipedia.org/api/rest_v1/page/html/January_30');
    });
    it('dayURIForRequest returns expected URI for 2 digit month and 0 padded day', () => {
        assert.deepEqual(onThisDay.dayURIForRequest(REQUEST_FOR_EN_12_01), 'https://en.wikipedia.org/api/rest_v1/page/html/December_1');
    });
    it('dayURIForRequest returns expected URI for 1 digit month and 1 digit day', () => {
        assert.deepEqual(onThisDay.dayURIForRequest(REQUEST_FOR_EN_1_1), 'https://en.wikipedia.org/api/rest_v1/page/html/January_1');
    });


    it('anniversariesURIForRequest returns expected URI for 0 padded month and 2 digit day', () => {
        assert.deepEqual(onThisDay.anniversariesURIForRequest(REQUEST_FOR_EN_01_30), 'https://en.wikipedia.org/api/rest_v1/page/html/Wikipedia%3ASelected_anniversaries%2FJanuary_30');
    });
    it('anniversariesURIForRequest returns expected URI for 2 digit month and 0 padded day', () => {
        assert.deepEqual(onThisDay.anniversariesURIForRequest(REQUEST_FOR_EN_12_01), 'https://en.wikipedia.org/api/rest_v1/page/html/Wikipedia%3ASelected_anniversaries%2FDecember_1');
    });
    it('anniversariesURIForRequest returns expected URI for 1 digit month and 1 digit day', () => {
        assert.deepEqual(onThisDay.anniversariesURIForRequest(REQUEST_FOR_EN_1_1), 'https://en.wikipedia.org/api/rest_v1/page/html/Wikipedia%3ASelected_anniversaries%2FJanuary_1');
    });


    it('getDayHTMLForRequest can fetch a day page', () => {
        return onThisDay.getDayHTMLForRequest(REQUEST_FOR_EN_01_30)
            .then(res => {
                assert.status(res, 200);
            });
    });
    it('getAnniversariesHTMLForRequest can fetch an anniversaries page', () => {
        return onThisDay.getAnniversariesHTMLForRequest(REQUEST_FOR_EN_01_30)
            .then(res => {
                assert.status(res, 200);
            });
    });




});


/*
Command to run only this file's tests:
    mocha --grep onthisday
    Also, add .only after "it" or "describe" to temporarily cause just those to run (don't forget to remove .only when done!)
        http://jaketrent.com/post/run-single-mocha-test/
    can also use this to just run our lint check:
        mocha --grep eslint

Add tests for:
- [ ] Model constructors
- [ ] BC year (with flexibility for spaces around dash)
- [ ] test that fetching a known day page and parsing it appears to result in multiple event/holidays - doens't have to be
        specific number, just non zero
- [ ] ...

- [ ] Update comments to use normal format

*/

/* eslint-enable max-len */
