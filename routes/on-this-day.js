
'use strict';

const domino = require('domino');
const sUtil = require('../lib/util');
const router = sUtil.router();
const preq = require('preq');
const dateUtil = require('../lib/dateUtil');
const mUtil = require('../lib/mobile-util');
const BBPromise = require('bluebird');

let app;

/* eslint-disable arrow-parens */


// DAY PAGE TITLE

function titleForDayPageFromMonthDayNumberStrings(monthNumberString, dayNumberString) {
    return `${dateUtil.monthNames[parseInt(monthNumberString) - 1]}_${parseInt(dayNumberString)}`;
}


// DAY AND SELECTED URI

function uriForDayPageRequest(req) {
    const date = titleForDayPageFromMonthDayNumberStrings(req.params.mm, req.params.dd);
    return `https://${req.params.domain}/api/rest_v1/page/html/${date}`;
}

function uriForSelectedPageRequest(req) {
    const date = titleForDayPageFromMonthDayNumberStrings(req.params.mm, req.params.dd);
    return `https://${req.params.domain}/api/rest_v1/page/html/Wikipedia%3ASelected_anniversaries%2F${date}`; // eslint-disable max-len
}


// FETCHING

function getDayDocForRequest(req) {
    return preq.get(uriForDayPageRequest(req))
    .then(response => domino.createDocument(response.body));
}

function getSelectedDocForRequest(req) {
    return preq.get(uriForSelectedPageRequest(req))
    .then(response => domino.createDocument(response.body));
}


// MODELS
// Element constructors (anchor or list element) so we can do direct
// '.map' transforms - i.e. '.map(WMFEvent)' or '.map(WMFPage)' etc.
// See: http://stackoverflow.com/a/30180348/135557

function WMFPage(anchorElement) {
    return {
        title: anchorElement.title,
        isTopic: anchorElement.parentElement.tagName === 'B'
    };
}

function WMFEvent(listElement) {
    const text = listElement.textContent.trim();
    const dashSpace = '– ';
    const indexOfDashSpace = text.indexOf(dashSpace);
    const year = text.substring(0, indexOfDashSpace).trim();
    const textAfterYear = text.substring(indexOfDashSpace + dashSpace.length);

    function isAnchorNotForYearNumber(anchor) {
        return parseInt(anchor.title) !== parseInt(year);
    }

    const pages = Array.from(listElement.querySelectorAll('a'))
        .filter(isAnchorNotForYearNumber)
        .map(WMFPage);

    return {
        text: textAfterYear,
        pages,
        year
    };
}

function WMFHoliday(listElement) {
    return {
        text: listElement.textContent.trim(),
        pages: Array.from(listElement.querySelectorAll('a')).map(WMFPage)
    };
}


// "YEAR LIST ELEMENT" IDENTIFICATION

function isYearListElement(listElement) {
    // 'Year' list elements start with a year number followed by
    // a dash and a space - ie: ' 1974 - ' or ' 23 BC - '.
    return (listElement.textContent.match(/^\s*\d+\s*[BC|bc|BCE|bce]*\s*–\s/) !== null);
}


// BC AWARE WMFEvent COMPARATOR

function bcAwareEventComparator(eventA, eventB) {
    let yearA = eventA.year;
    let yearB = eventB.year;

    function isBC(year) {
        const upperCaseYear = year.toUpperCase();
        return (upperCaseYear.endsWith('BC') || upperCaseYear.endsWith('BCE'));
    }
    // For sorting treat BC years as negative numbers.
    yearA = isBC(yearA) ? -parseInt(yearA) : parseInt(yearA);
    yearB = isBC(yearB) ? -parseInt(yearB) : parseInt(yearB);

    if (yearB < yearA) {
        return -1;
    } else if (yearB > yearA) {
        return 1;
    } else {
        return 0;
    }
}


// TRANSFORMS FOR YEAR LIST ELEMENTS

function eventsForYearListElements(listElements) {
    return listElements
        .filter(isYearListElement)
        .map(WMFEvent)
        .sort(bcAwareEventComparator);
}


// TRANSFORMS FOR HOLIDAY LIST ELEMENTS

function holidaysForHolidayListElements(listElements) {
    return listElements.map(WMFHoliday);
}


// OUTPUT

const birthsInDoc = (document) => {
    return eventsForYearListElements(
        document.querySelectorAll('h2#Births + ul li')
    );
};

const deathsInDoc = (document) => {
    return eventsForYearListElements(
        document.querySelectorAll('h2#Deaths + ul li')
    );
};

const eventsInDoc = (document) => {
    return eventsForYearListElements(
        document.querySelectorAll('h2#Events + ul li')
    );
};

const holidaysInDoc = (document) => {
    return holidaysForHolidayListElements(
        document.querySelectorAll('h2#Holidays_and_observances + ul li')
    );
};

const selectedInDoc = (document) => {
    return eventsForYearListElements(
        document.querySelectorAll('body > ul li')
    );
};


// TITLE HYDRATION

function hasTitle(object) {
    return (
        Object.prototype.hasOwnProperty.call(object, 'title') &&
        typeof object.title === 'string'
    );
}

function hydrateTitle(object, domain) {
    const title = object.title;
    delete object.title;
    object.$merge = [ mUtil.getRbPageSummaryUrl(app.restbase_tpl, domain, title) ];
}

function hydrateAllTitles(object, domain) {
    for (const property in object) {
        if (Object.prototype.hasOwnProperty.call(object, property)) {
            if (typeof object[property] === 'object') {
                hydrateAllTitles(object[property], domain);
            } else if (hasTitle(object)) {
                hydrateTitle(object, domain);
            }
        }
    }
}


// RESPONSE FINALIZATION

const endResponseWithOutput = (req, res, output) => {
    // Hydrate titles just before responding. Otherwise you'd have to leak
    // 'domain' details all the way down to the WMFPage constructor (which
    // destroys promise chain simplicity).
    hydrateAllTitles(output, req.params.domain);

    res.status(200);
    mUtil.setContentType(res, mUtil.CONTENT_TYPES.onthisday);
    res.json(output).end();
};


// ENDPOINTS

// 'Births' from 'day' pages like: https://en.m.wikipedia.org/wiki/May_20
// http://localhost:6927/en.wikipedia.org/v1/onthisday/births/01/30
router.get('/births/:mm/:dd', (req, res) => {
    return getDayDocForRequest(req)
    .then(birthsInDoc)
    .then(output => [req, res, output])
    .spread(endResponseWithOutput);
});

// 'Deaths' from 'day' pages like: https://en.m.wikipedia.org/wiki/May_20
// http://localhost:6927/en.wikipedia.org/v1/onthisday/deaths/01/30
router.get('/deaths/:mm/:dd', (req, res) => {
    return getDayDocForRequest(req)
    .then(deathsInDoc)
    .then(output => [req, res, output])
    .spread(endResponseWithOutput);
});

// 'Events' from 'day' pages like: https://en.m.wikipedia.org/wiki/May_20
// http://localhost:6927/en.wikipedia.org/v1/onthisday/events/01/30
router.get('/events/:mm/:dd', (req, res) => {
    return getDayDocForRequest(req)
    .then(eventsInDoc)
    .then(output => [req, res, output])
    .spread(endResponseWithOutput);
});

// 'Holiday and observances' from 'day' pages like: https://en.m.wikipedia.org/wiki/May_20
// http://localhost:6927/en.wikipedia.org/v1/onthisday/holidays/01/30
router.get('/holidays/:mm/:dd', (req, res) => {
    return getDayDocForRequest(req)
    .then(holidaysInDoc)
    .then(output => [req, res, output])
    .spread(endResponseWithOutput);
});

// 'Selected' editor curated events from pages like: https://en.m.wikipedia.org/wiki/Wikipedia:On_this_day/Today
// http://localhost:6927/en.wikipedia.org/v1/onthisday/selected/01/30
router.get('/selected/:mm/:dd', (req, res) => {
    return getSelectedDocForRequest(req)
    .then(selectedInDoc)
    .then(output => [req, res, output])
    .spread(endResponseWithOutput);
});


// Everything (Births, Deaths, Events, Holidays and Selected) all in one go.
// http://localhost:6927/en.wikipedia.org/v1/onthisday/all/01/30
router.get('/all/:mm/:dd', (req, res) => {
    return BBPromise.all([
        getDayDocForRequest(req),
        getSelectedDocForRequest(req)
    ])
    .then(([dayDoc, selectionsDoc]) => {
        return {
            births: birthsInDoc(dayDoc),
            deaths: deathsInDoc(dayDoc),
            events: eventsInDoc(dayDoc),
            holidays: holidaysInDoc(dayDoc),
            selected: selectedInDoc(selectionsDoc)
        };
    })
    .then(output => [req, res, output])
    .spread(endResponseWithOutput);
});


module.exports = function(appObj) {
    app = appObj;
    return {
        path: '/onthisday',
        api_version: 1,
        router,
        testing: { // Testing namespace
            uriForDayPageRequest,
            uriForSelectedPageRequest,
            titleForDayPageFromMonthDayNumberStrings,
            getDayDocForRequest,
            getSelectedDocForRequest,
            WMFPage,
            WMFEvent,
            WMFHoliday,
            eventsForYearListElements,
            isYearListElement,
            bcAwareEventComparator
        }
    };
};

/* eslint-enable arrow-parens */
