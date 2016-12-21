'use strict';

/* eslint-disable max-len, arrow-parens, new-cap */

const server = require('../../utils/server.js');
const onThisDay = require('../../../routes/on-this-day.js')();
const assert = require('../../utils/assert.js');
const domino = require('domino');
const preq = require('preq');


// MOCK REQUESTS

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


// MOCK ANCHORS

// Events on selected anniversary pages (like https://en.wikipedia.org/wiki/Wikipedia:Selected_anniversaries/January_30 ) often
// have certain anchors bolded to signify they refer to the main "topic" of the event. We mock a document here with a topical and
// a non-topical anchor for testing our model objects.
const DOCUMENT_WITH_TOPIC_AND_NON_TOPIC_ANCHORS = domino.createDocument(
    '<html><body>' +
        '<b><a href="TOPIC_ANCHOR_URL" title="TOPIC_ANCHOR_TITLE">TOPIC_ANCHOR_TEXT</a></b>' +
        '<a href="NON_TOPIC_ANCHOR_URL" title="NON_TOPIC_ANCHOR_TITLE">NON_TOPIC_ANCHOR_TEXT</a>' +
    '</body></html>'
);
const MOCK_ANCHORS = Array.from(DOCUMENT_WITH_TOPIC_AND_NON_TOPIC_ANCHORS.querySelectorAll('a'));
const TOPIC_ANCHOR = MOCK_ANCHORS[0];
const NON_TOPIC_ANCHOR = MOCK_ANCHORS[1];


// MOCK LIST ELEMENTS

const DOCUMENT_WITH_EVENT_AND_HOLIDAY_LIST_ELEMENTS = domino.createDocument(
    '<html><body><ul>' +
        // From: https://en.wikipedia.org/wiki/Wikipedia:Selected_anniversaries/January_3
        '<li><a href="/wiki/1946" title="1946">1946</a> – Canadian-American <a href="/wiki/Jockey" title="Jockey">jockey</a> <b><a href="/wiki/George_Woolf" title="George Woolf">George Woolf</a></b>, who rode <a href="/wiki/Seabiscuit" title="Seabiscuit">Seabiscuit</a> to a famous victory over <a href="/wiki/War_Admiral" title="War Admiral">War Admiral</a> in 1938, was fatally injured when he fell from his horse during a race.</li>' +
        // From: https://en.wikipedia.org/wiki/January_30#Births
        '<li><a href="/wiki/58_BC" title="58 BC">58 BC</a>– <a href="/wiki/Livia" title="Livia">Livia</a>, Roman wife of <a href="/wiki/Augustus" title="Augustus">Augustus</a> (d. 29)</li>' +
        // From: https://en.wikipedia.org/wiki/January_30#Events
        '<li><a href="/wiki/516_BCE" class="mw-redirect" title="516 BCE">516 BCE</a> – The <a href="/wiki/Second_Temple" title="Second Temple">Second Temple</a> of Jerusalem finishes construction.</li>' +
        // From: https://en.wikipedia.org/wiki/January_30#Deaths
        '<li>1948 – <a href="/wiki/Mahatma_Gandhi" title="Mahatma Gandhi">Mahatma Gandhi</a>, Indian lawyer, philosopher, and activist (b. 1869)</li>' +
        // From: https://en.wikipedia.org/wiki/January_30#Holidays_and_observances
        '<li>Martyrdom of <a href="/wiki/Mahatma_Gandhi" title="Mahatma Gandhi">Mahatma Gandhi</a>-related observances:' +
            '<ul>' +
            '\n <li><a href="/wiki/Martyrs%27_Day_(India)" title="Martyrs Day (India)">Martyrs Day (India)</a></li>' +
            '\n <li><a href="/wiki/School_Day_of_Non-violence_and_Peace" title="School Day of Non-violence and Peace">School Day of Non-violence and Peace</a> (<a href="/wiki/Spain" title="Spain">Spain</a>)</li>' +
            '\n <li>Start of the <a href="/wiki/Season_for_Nonviolence" title="Season for Nonviolence">Season for Nonviolence</a> January 30-April 4</li>' +
            '</ul>' +
        '</li>' +
    '</ul></body></html>'
);
const MOCK_EVENT_LIST_ELEMENTS = Array.from(DOCUMENT_WITH_EVENT_AND_HOLIDAY_LIST_ELEMENTS.querySelectorAll('li'));
const SEABISCUIT_SELECTED_LIST_ELEMENT = MOCK_EVENT_LIST_ELEMENTS[0];
const LIVIA_BIRTH_LIST_ELEMENT = MOCK_EVENT_LIST_ELEMENTS[1];
const TEMPLE_EVENT_LIST_ELEMENT = MOCK_EVENT_LIST_ELEMENTS[2];
const GANDHI_DEATH_LIST_ELEMENT = MOCK_EVENT_LIST_ELEMENTS[3];
const MARTYRDOM_HOLIDAY_LIST_ELEMENT = MOCK_EVENT_LIST_ELEMENTS[4];


// TESTS

describe('onthisday', function() {

    this.timeout(20000); // eslint-disable-line no-invalid-this

    before(() => { return server.start(); });


    // FIXME: these tests fail because onthisday etags are not yet in place...
    /*
    it('"births" should respond to GET request with expected headers, incl. CORS and CSP headers', () => {
        headers.checkHeaders(`${server.config.uri}en.wikipedia.org/v1/onthisday/births/01/01`);
    });
    it('"deaths" should respond to GET request with expected headers, incl. CORS and CSP headers', () => {
        headers.checkHeaders(`${server.config.uri}en.wikipedia.org/v1/onthisday/deaths/01/01`);
    });
    it('"events" should respond to GET request with expected headers, incl. CORS and CSP headers', () => {
        headers.checkHeaders(`${server.config.uri}en.wikipedia.org/v1/onthisday/events/01/01`);
    });
    it('"selected" should respond to GET request with expected headers, incl. CORS and CSP headers', () => {
        headers.checkHeaders(`${server.config.uri}en.wikipedia.org/v1/onthisday/selected/01/01`);
    });
    it('"all" should respond to GET request with expected headers, incl. CORS and CSP headers', () => {
        headers.checkHeaders(`${server.config.uri}en.wikipedia.org/v1/onthisday/all/01/01`);
    });
    */


    // TEST PAGE TITLE GENERATION

    it('titleForDayPageFromMonthDayNumberStrings returns expected title for 1 digit month and 1 digit day', () => {
        assert.deepEqual(onThisDay.testing.titleForDayPageFromMonthDayNumberStrings('1', '1'), 'January_1');
    });
    it('titleForDayPageFromMonthDayNumberStrings returns expected title for 0 padded month and 1 digit day', () => {
        assert.deepEqual(onThisDay.testing.titleForDayPageFromMonthDayNumberStrings('01', '1'), 'January_1');
    });
    it('titleForDayPageFromMonthDayNumberStrings returns expected title for 0 padded month and 0 padded day', () => {
        assert.deepEqual(onThisDay.testing.titleForDayPageFromMonthDayNumberStrings('01', '01'), 'January_1');
    });


    // TEST DAY PAGE URI GENERATION

    it('uriForDayPageRequest returns expected URI for 0 padded month and 2 digit day', () => {
        assert.deepEqual(onThisDay.testing.uriForDayPageRequest(REQUEST_FOR_EN_01_30), 'https://en.wikipedia.org/api/rest_v1/page/html/January_30');
    });
    it('uriForDayPageRequest returns expected URI for 2 digit month and 0 padded day', () => {
        assert.deepEqual(onThisDay.testing.uriForDayPageRequest(REQUEST_FOR_EN_12_01), 'https://en.wikipedia.org/api/rest_v1/page/html/December_1');
    });
    it('uriForDayPageRequest returns expected URI for 1 digit month and 1 digit day', () => {
        assert.deepEqual(onThisDay.testing.uriForDayPageRequest(REQUEST_FOR_EN_1_1), 'https://en.wikipedia.org/api/rest_v1/page/html/January_1');
    });


    // TEST SELECTED PAGE URI GENERATION

    it('uriForSelectedPageRequest returns expected URI for 0 padded month and 2 digit day', () => {
        assert.deepEqual(onThisDay.testing.uriForSelectedPageRequest(REQUEST_FOR_EN_01_30), 'https://en.wikipedia.org/api/rest_v1/page/html/Wikipedia%3ASelected_anniversaries%2FJanuary_30');
    });
    it('uriForSelectedPageRequest returns expected URI for 2 digit month and 0 padded day', () => {
        assert.deepEqual(onThisDay.testing.uriForSelectedPageRequest(REQUEST_FOR_EN_12_01), 'https://en.wikipedia.org/api/rest_v1/page/html/Wikipedia%3ASelected_anniversaries%2FDecember_1');
    });
    it('uriForSelectedPageRequest returns expected URI for 1 digit month and 1 digit day', () => {
        assert.deepEqual(onThisDay.testing.uriForSelectedPageRequest(REQUEST_FOR_EN_1_1), 'https://en.wikipedia.org/api/rest_v1/page/html/Wikipedia%3ASelected_anniversaries%2FJanuary_1');
    });


    // TEST URI FETCH

    it('getDayDocForRequest can fetch a day page doc', () => {
        return onThisDay.testing.getDayDocForRequest(REQUEST_FOR_EN_01_30)
        .then(doc => assert.ok(doc !== null));
    });
    it('getSelectedDocForRequest can fetch an selected anniversaries page doc', () => {
        return onThisDay.testing.getSelectedDocForRequest(REQUEST_FOR_EN_01_30)
        .then(doc => assert.ok(doc !== null));
    });


    // TEST ANCHOR TO WMFPage TRANSFORMS

    it('WMFPage model object is correctly created from a topic anchor', () => {
        assert.deepEqual(onThisDay.testing.WMFPage(TOPIC_ANCHOR), {
            title: 'TOPIC_ANCHOR_TITLE',
            isTopic: true
        });
    });

    it('WMFPage model object is correctly created from a non-topic anchor', () => {
        assert.deepEqual(onThisDay.testing.WMFPage(NON_TOPIC_ANCHOR), {
            title: 'NON_TOPIC_ANCHOR_TITLE',
            isTopic: false
        });
    });


    // TEST LIST ELEMENT TO WMFEvent TRANSFORMS

    it('WMFEvent model object is correctly created from a selected list element', () => {
        assert.deepEqual(onThisDay.testing.WMFEvent(SEABISCUIT_SELECTED_LIST_ELEMENT), {
            "text": "Canadian-American jockey George Woolf, who rode Seabiscuit to a famous victory over War Admiral in 1938, was fatally injured when he fell from his horse during a race.",
            "pages": [
                {
                    "title": "Jockey",
                    "isTopic": false
                },
                {
                    "title": "George Woolf",
                    "isTopic": true
                },
                {
                    "title": "Seabiscuit",
                    "isTopic": false
                },
                {
                    "title": "War Admiral",
                    "isTopic": false
                }
            ],
            "year": "1946"
        });
    });

    it('WMFEvent model object is correctly created from a birth list element', () => {
        assert.deepEqual(onThisDay.testing.WMFEvent(LIVIA_BIRTH_LIST_ELEMENT), {
            "text": "Livia, Roman wife of Augustus (d. 29)",
            "pages": [
                {
                    "title": "Livia",
                    "isTopic": false
                },
                {
                    "title": "Augustus",
                    "isTopic": false
                }
            ],
            "year": "58 BC"
        });
    });

    it('WMFEvent model object is correctly created from an event list element', () => {
        assert.deepEqual(onThisDay.testing.WMFEvent(TEMPLE_EVENT_LIST_ELEMENT), {
            "text": "The Second Temple of Jerusalem finishes construction.",
            "pages": [
                {
                    "title": "Second Temple",
                    "isTopic": false
                }
            ],
            "year": "516 BCE"
        });
    });

    it('WMFEvent model object is correctly created from a death list element', () => {
        assert.deepEqual(onThisDay.testing.WMFEvent(GANDHI_DEATH_LIST_ELEMENT), {
            "text": "Mahatma Gandhi, Indian lawyer, philosopher, and activist (b. 1869)",
            "pages": [
                {
                    "title": "Mahatma Gandhi",
                    "isTopic": false
                }
            ],
            "year": "1948"
        });
    });

    it('WMFHoliday model object is correctly created from a holiday list element', () => {
        assert.deepEqual(onThisDay.testing.WMFHoliday(MARTYRDOM_HOLIDAY_LIST_ELEMENT), {
            "text": "Martyrdom of Mahatma Gandhi-related observances:\n Martyrs Day (India)\n School Day of Non-violence and Peace (Spain)\n Start of the Season for Nonviolence January 30-April 4",
            "pages": [
                {
                    "title": "Mahatma Gandhi",
                    "isTopic": false
                },
                {
                    "title": "Martyrs Day (India)",
                    "isTopic": false
                },
                {
                    "title": "School Day of Non-violence and Peace",
                    "isTopic": false
                },
                {
                    "title": "Spain",
                    "isTopic": false
                },
                {
                    "title": "Season for Nonviolence",
                    "isTopic": false
                }
            ]
        });
    });


    // LIVE TEST ENDPOINT INTERNALS PRODUCE AT LEAST SOME RESULTS FOR A GIVEN DAY.
    // DO NOT TEST FOR EXACT RESULT COUNT - THESE CHANGE AS PAGES ARE EDITED.
    // INSTEAD TEST THAT AT LEAST SOME RESULTS ARE RETURNED.

    function january30uriForEndpointName(endpointName) {
        return `${server.config.uri}en.wikipedia.org/v1/onthisday/${endpointName}/01/30/`;
    }
    function getJanuary30ResponseForEndpointName(endpointName) {
        return preq.get(january30uriForEndpointName(endpointName));
    }
    function verifyNonZeroEndpointResults(response, endpointName) {
        assert.ok(response.body.length > 0, `${endpointName} should have fetched some results`);
    }
    function fetchAndVerifyNonZeroResultsForEndpointName(endpointName) {
        return getJanuary30ResponseForEndpointName(endpointName)
         .then((response) => {
             verifyNonZeroEndpointResults(response, endpointName);
         });
    }
    it('BIRTHS fetches some results', () => {
        return fetchAndVerifyNonZeroResultsForEndpointName('births');
    });

    it('DEATHS fetches some results', () => {
        return fetchAndVerifyNonZeroResultsForEndpointName('deaths');
    });

    it('EVENTS fetches some results', () => {
        return fetchAndVerifyNonZeroResultsForEndpointName('events');
    });

    it('HOLIDAYS fetches some results', () => {
        return fetchAndVerifyNonZeroResultsForEndpointName('holidays');
    });

    it('SELECTED fetches some results', () => {
        return fetchAndVerifyNonZeroResultsForEndpointName('selected');
    });

    it('ALL fetches some results for births, deaths, events, holidays and selected', () => {
        return getJanuary30ResponseForEndpointName('all')
         .then((response) => {
             assert.ok(response.body.births.length > 0, 'ALL should return some births');
             assert.ok(response.body.deaths.length > 0, 'ALL should return some deaths');
             assert.ok(response.body.events.length > 0, 'ALL should return some events');
             assert.ok(response.body.holidays.length > 0, 'ALL should return some holidays');
             assert.ok(response.body.selected.length > 0, 'ALL should return some selected');
         });
    });


    it('eventsForYearListElements returns a WMFEvent for only year list elements', () => {
        assert.ok(onThisDay.testing.eventsForYearListElements(MOCK_EVENT_LIST_ELEMENTS).length === 4, 'Should return WMFEvent for each of 4 year list elements');
    });


    it('Correct year list element determination', () => {
        assert.ok(onThisDay.testing.isYearListElement(SEABISCUIT_SELECTED_LIST_ELEMENT));
    });
    it('Correct year list element determination', () => {
        assert.ok(onThisDay.testing.isYearListElement(LIVIA_BIRTH_LIST_ELEMENT));
    });
    it('Correct year list element determination', () => {
        assert.ok(onThisDay.testing.isYearListElement(TEMPLE_EVENT_LIST_ELEMENT));
    });
    it('Correct year list element determination', () => {
        assert.ok(onThisDay.testing.isYearListElement(GANDHI_DEATH_LIST_ELEMENT));
    });
    it('Correct year list element determination', () => {
        assert.ok(!onThisDay.testing.isYearListElement(MARTYRDOM_HOLIDAY_LIST_ELEMENT));
    });


    it('Sort year list events in correct BC[E] aware manner', () => {
        const sortedEvents = [
            onThisDay.testing.WMFEvent(SEABISCUIT_SELECTED_LIST_ELEMENT),
            onThisDay.testing.WMFEvent(LIVIA_BIRTH_LIST_ELEMENT),
            onThisDay.testing.WMFEvent(TEMPLE_EVENT_LIST_ELEMENT),
            onThisDay.testing.WMFEvent(GANDHI_DEATH_LIST_ELEMENT)
        ].sort(onThisDay.testing.bcAwareEventComparator);

        assert.ok(sortedEvents[0].year === '1948');
        assert.ok(sortedEvents[1].year === '1946');
        assert.ok(sortedEvents[2].year === '58 BC');
        assert.ok(sortedEvents[3].year === '516 BCE');
    });

});


/* eslint-enable max-len, arrow-parens, new-cap */
