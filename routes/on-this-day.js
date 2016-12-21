
'use strict';

const domino = require('domino');
const sUtil = require('../lib/util');
const router = sUtil.router();
const preq = require('preq');
const dateUtil = require('../lib/dateUtil');
const mUtil = require('../lib/mobile-util');
const BBPromise = require('bluebird');


// DAY PAGE TITLE

function dayPageTitleFromMonthAndDayNumberStrings(monthNumberString, dayNumberString) {
    return `${dateUtil.monthNames[parseInt(monthNumberString) - 1]}_${parseInt(dayNumberString)}`;
}


// DAY AND SELECTED URI

function dayURIForRequest(req) {
    const date = dayPageTitleFromMonthAndDayNumberStrings(req.params.mm, req.params.dd);
    const domain = req.params.domain;
    return `https://${domain}/api/rest_v1/page/html/${date}`;
}

function selectedURIForRequest(req) {
    const date = dayPageTitleFromMonthAndDayNumberStrings(req.params.mm, req.params.dd);
    const domain = req.params.domain;
    return `https://${domain}/api/rest_v1/page/html/Wikipedia%3ASelected_anniversaries%2F${date}`;
}


// FETCHING

function getDayHTMLForRequest(req) {
    return preq.get(dayURIForRequest(req))
    .then((response) => {
        return response.body;
    });
}

function getSelectedHTMLForRequest(req) {
    return preq.get(selectedURIForRequest(req))
    .then((response) => {
        return response.body;
    });
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


// TRANSFORMS FOR YEAR LIST ELEMENTS

function eventsForYearListElements(listElements) {

    function isYearListElement(listElement) {
        // 'Year' list elements start with a year number followed by
        // a dash and a space - ie: ' 1974 - ' or ' 23 BC - '.
        return (listElement.textContent.match(/^\s*\d+\s*[BC|bc|BCE|bce]*\s*–\s/) !== null);
    }

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

    return listElements
        .filter(isYearListElement)
        .map(WMFEvent)
        .sort(bcAwareEventComparator);
}


// TRANSFORMS FOR HOLIDAY LIST ELEMENTS

function holidaysForHolidayListElements(listElements) {
    return listElements.map(WMFHoliday);
}


// QUERY SELECTORS

const QUERYSELECTOR_EVENTS = 'h2#Events + ul li';
const QUERYSELECTOR_BIRTHS = 'h2#Births + ul li';
const QUERYSELECTOR_DEATHS = 'h2#Deaths + ul li';
const QUERYSELECTOR_HOLIDAYS = 'h2#Holidays_and_observances + ul li';
const QUERYSELECTOR_SELECTED = 'body > ul li';


// OUTPUT

function outputForEventsInDocument(document) {
    return eventsForYearListElements(
        document.querySelectorAll(QUERYSELECTOR_EVENTS)
    );
}

function outputForBirthsInDocument(document) {
    return eventsForYearListElements(
        document.querySelectorAll(QUERYSELECTOR_BIRTHS)
    );
}

function outputForDeathsInDocument(document) {
    return eventsForYearListElements(
        document.querySelectorAll(QUERYSELECTOR_DEATHS)
    );
}

function outputForHolidaysInDocument(document) {
    return holidaysForHolidayListElements(
        document.querySelectorAll(QUERYSELECTOR_HOLIDAYS)
    );
}

function outputForSelectedInDocument(document) {
    return eventsForYearListElements(
        document.querySelectorAll(QUERYSELECTOR_SELECTED)
    );
}


// RESPONSE

function endResponseWithOutput(res, output) {
    res.status(200);
    mUtil.setContentType(res, mUtil.CONTENT_TYPES.onthisday);
    res.json(output).end();
}


// ENDPOINTS

// "Births", "Deaths" and "Events" style results for a given day as seen on "day" pages like: https://en.m.wikipedia.org/wiki/May_20
router.get('/births/:mm/:dd', (req, res) => {
    getDayHTMLForRequest(req)
    .then(domino.createDocument)
    .then(outputForBirthsInDocument)
    .then((output) => {
        endResponseWithOutput(res, output);
    });
});

router.get('/deaths/:mm/:dd', (req, res) => {
    getDayHTMLForRequest(req)
    .then(domino.createDocument)
    .then(outputForDeathsInDocument)
    .then((output) => {
        endResponseWithOutput(res, output);
    });
});

router.get('/events/:mm/:dd', (req, res) => {
    getDayHTMLForRequest(req)
    .then(domino.createDocument)
    .then(outputForEventsInDocument)
    .then((output) => {
        endResponseWithOutput(res, output);
    });
});


// "Holiday and observances" style results for a given day as seen on "day" pages like: https://en.m.wikipedia.org/wiki/May_20
router.get('/holidays/:mm/:dd', (req, res) => {
    getDayHTMLForRequest(req)
    .then(domino.createDocument)
    .then(outputForHolidaysInDocument)
    .then((output) => {
        endResponseWithOutput(res, output);
    });
});


// "Selected" style results for a given day like those seen here: https://en.m.wikipedia.org/wiki/Wikipedia:On_this_day/Today
router.get('/selected/:mm/:dd', (req, res) => {
    getSelectedHTMLForRequest(req)
    .then(domino.createDocument)
    .then(outputForSelectedInDocument)
    .then((output) => {
        endResponseWithOutput(res, output);
    });
});


// Everything (Births, Deaths, Events, Holidays and Selected) all in one go.
router.get('/all/:mm/:dd', (req, res) => {
    BBPromise.all([
        getDayHTMLForRequest(req),
        getSelectedHTMLForRequest(req)
    ])
    .map(domino.createDocument)
    .then(([dayDoc, selectedDoc]) => {
        endResponseWithOutput(res, {
            births: outputForBirthsInDocument(dayDoc),
            deaths: outputForDeathsInDocument(dayDoc),
            events: outputForEventsInDocument(dayDoc),
            holidays: outputForHolidaysInDocument(dayDoc),
            selected: outputForSelectedInDocument(selectedDoc)
        });
    });
});


module.exports = function(appObj) {
    return {
        path: '/onthisday',
        api_version: 1,
        router,
        testing: { // Exposed for testing:
            dayURIForRequest,
            dayPageTitleFromMonthAndDayNumberStrings,
            selectedURIForRequest,
            getDayHTMLForRequest,
            getSelectedHTMLForRequest,
            WMFPage,
            WMFEvent,
            WMFHoliday
        }
    };
};
