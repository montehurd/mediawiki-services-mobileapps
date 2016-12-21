
'use strict';

const domino = require('domino');
const sUtil = require('../lib/util');
const router = sUtil.router();
const preq = require('preq');
const dateUtil = require('../lib/dateUtil');
const mUtil = require('../lib/mobile-util');
const parsoid = require('../lib/parsoid-access');

let app;

/* eslint-disable arrow-parens */


// DAY PAGE TITLE
// ie 'January_30'

function titleForDayPageFromMonthDayNumberStrings(monthNumberString, dayNumberString) {
    return `${dateUtil.monthNames[parseInt(monthNumberString) - 1]}_${parseInt(dayNumberString)}`;
}

// DAY PAGE URI
// Parsoid URI for data for day pages such as https://en.m.wikipedia.org/wiki/May_20

function uriForDayPageRequest(req) {
    const date = titleForDayPageFromMonthDayNumberStrings(req.params.mm, req.params.dd);
    return `https://${req.params.domain}/api/rest_v1/page/html/${date}`;
}

// SELECTIONS PAGE URI
// Parsoid URI for data for selected pages such as https://en.m.wikipedia.org/wiki/Wikipedia%3ASelected_anniversaries%2FMay_20
// ( these are also where 'Today' page content comes from: https://en.m.wikipedia.org/wiki/Wikipedia:On_this_day/Today )

function uriForSelectedPageRequest(req) {
    const date = titleForDayPageFromMonthDayNumberStrings(req.params.mm, req.params.dd);
    return `https://${req.params.domain}/api/rest_v1/page/html/Wikipedia%3ASelected_anniversaries%2F${date}`; // eslint-disable max-len
}


// MODELS

class WMFPage {
    constructor(title, isTopic) {
        this.title = title;
        this.isTopic = isTopic;
    }
}

class WMFEvent {
    constructor(text, pages, year) {
        this.text = text;
        this.pages = pages;
        this.year = year;
    }
}

class WMFHoliday {
    constructor(text, pages) {
        this.text = text;
        this.pages = pages;
    }
}


// DOC ELEMENT TO MODEL OBJECT TRANSFORMS

function WMFPageFromAnchorElement(anchorElement) {
    const title = anchorElement.title;
    const isTopic = anchorElement.parentElement.tagName === 'B';
    return new WMFPage(title, isTopic);
}

function WMFEventFromListElement(listElement) {
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
        .map(WMFPageFromAnchorElement);

    return new WMFEvent(textAfterYear, pages, year);
}

function WMFHolidayFromListElement(listElement) {
    const text = listElement.textContent.trim();
    const pages = Array.from(listElement.querySelectorAll('a')).map(WMFPageFromAnchorElement);
    return new WMFHoliday(text, pages);
}


// 'YEAR LIST ELEMENT' IDENTIFICATION

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
        .map(WMFEventFromListElement)
        .sort(bcAwareEventComparator);
}


// TRANSFORMS FOR HOLIDAY LIST ELEMENTS

function holidaysForHolidayListElements(listElements) {
    return listElements.map(WMFHolidayFromListElement);
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

const selectionsInDoc = (document) => {
    return eventsForYearListElements(
        document.querySelectorAll('body > ul li')
    );
};

const everythingInDayAndSelectionsDocs = (dayDoc, selectionsDoc) => {
    return {
        selected: selectionsInDoc(selectionsDoc),
        births: birthsInDoc(dayDoc),
        deaths: deathsInDoc(dayDoc),
        events: eventsInDoc(dayDoc),
        holidays: holidaysInDoc(dayDoc)
    };
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

const endResponseWithOutput = (res, output, domain, etag) => {
    // Hydrate titles just before responding. Otherwise you'd have to leak
    // 'domain' details all the way down to the WMFPage constructor (which
    // destroys promise chain simplicity).
    hydrateAllTitles(output, domain);

    res.status(200);
    mUtil.setETag(res, etag);
    mUtil.setContentType(res, mUtil.CONTENT_TYPES.onthisday);
    res.json(output).end();
};


// FETCHER

function fetchDocAndEtagRevision(req, res, uriFunction) {
    let etagRevision;
    return preq.get(uriFunction(req))
    .then(response => {
        etagRevision = parsoid.getRevisionFromEtag(response.headers);
        return response.body;
    })
    .then(domino.createDocument)
    .then(doc => [doc, etagRevision]);
}


// FETCH AND RESPOND CONVENIENCE

function fetchAndRespond(req, res, uriFunction, extractionFunction) {
    return fetchDocAndEtagRevision(req, res, uriFunction)
    .then(([doc, etagRevision]) => {
        const output = extractionFunction(doc);
        endResponseWithOutput(res, output, req.params.domain, etagRevision);
    });
}


// ENDPOINTS

// 'Births' from 'day' pages like: https://en.m.wikipedia.org/wiki/May_20
// http://localhost:6927/en.wikipedia.org/v1/onthisday/births/01/30
router.get('/births/:mm/:dd', (req, res) => {
    return fetchAndRespond(req, res, uriForDayPageRequest, birthsInDoc);
});

// 'Deaths' from 'day' pages like: https://en.m.wikipedia.org/wiki/May_20
// http://localhost:6927/en.wikipedia.org/v1/onthisday/deaths/01/30
router.get('/deaths/:mm/:dd', (req, res) => {
    return fetchAndRespond(req, res, uriForDayPageRequest, deathsInDoc);
});

// 'Events' from 'day' pages like: https://en.m.wikipedia.org/wiki/May_20
// http://localhost:6927/en.wikipedia.org/v1/onthisday/events/01/30
router.get('/events/:mm/:dd', (req, res) => {
    return fetchAndRespond(req, res, uriForDayPageRequest, eventsInDoc);
});

// 'Holiday and observances' from 'day' pages like: https://en.m.wikipedia.org/wiki/May_20
// http://localhost:6927/en.wikipedia.org/v1/onthisday/holidays/01/30
router.get('/holidays/:mm/:dd', (req, res) => {
    return fetchAndRespond(req, res, uriForDayPageRequest, holidaysInDoc);
});

// 'Selected' editor curated events from pages like: https://en.m.wikipedia.org/wiki/Wikipedia:On_this_day/Today
// http://localhost:6927/en.wikipedia.org/v1/onthisday/selected/01/30
router.get('/selected/:mm/:dd', (req, res) => {
    return fetchAndRespond(req, res, uriForSelectedPageRequest, selectionsInDoc);
});


// Everything (Births, Deaths, Events, Holidays and Selected) all in one go.
// http://localhost:6927/en.wikipedia.org/v1/onthisday/all/01/30
router.get('/all/:mm/:dd', (req, res) => {
    return Promise.all([
        fetchDocAndEtagRevision(req, res, uriForDayPageRequest),
        fetchDocAndEtagRevision(req, res, uriForSelectedPageRequest)
    ])
    .then(([[dayDoc, dayEtagRevision], [selectionsDoc, selectionsEtagRevision]]) => {
        const etag = Math.max(dayEtagRevision, selectionsEtagRevision);
        const output = everythingInDayAndSelectionsDocs(dayDoc, selectionsDoc);
        endResponseWithOutput(res, output, req.params.domain, etag);
    });
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
            WMFPage,
            WMFEvent,
            WMFHoliday,
            WMFHolidayFromListElement,
            WMFEventFromListElement,
            WMFPageFromAnchorElement,
            eventsForYearListElements,
            isYearListElement,
            bcAwareEventComparator,
            hydrateAllTitles
        }
    };
};


/* eslint-enable arrow-parens */
