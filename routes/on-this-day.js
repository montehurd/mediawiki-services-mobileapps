
'use strict';

const domino = require('domino');
const sUtil = require('../lib/util');
const router = sUtil.router();
const preq = require('preq');
const dateUtil = require('../lib/dateUtil');
const mUtil = require('../lib/mobile-util');


// DAY PAGE TITLE

function dayPageTitleFromMonthAndDayNumberStrings(monthNumberString, dayNumberString) {
    return `${dateUtil.monthNames[parseInt(monthNumberString) - 1]}_${parseInt(dayNumberString)}`;
}


// DAY AND ANNIVERSARIES URI

function dayURIForRequest(req) {
    const date = dayPageTitleFromMonthAndDayNumberStrings(req.params.mm, req.params.dd);
    const domain = req.params.domain;
    return `https://${domain}/api/rest_v1/page/html/${date}`;
}

function anniversariesURIForRequest(req) {
    const date = dayPageTitleFromMonthAndDayNumberStrings(req.params.mm, req.params.dd);
    const domain = req.params.domain;
    return `https://${domain}/api/rest_v1/page/html/Wikipedia%3ASelected_anniversaries%2F${date}`;
}


// FETCHING

function getDayHTMLForRequest(req) {
    return preq.get(dayURIForRequest(req));
}

function getAnniversariesHTMLForRequest(req) {
    return preq.get(anniversariesURIForRequest(req));
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
        return (listElement.textContent.match(/^\s*\d+\s*[BC|bc]*\s*–\s/) !== null);
    }

    function bcAwareEventComparator(eventA, eventB) {
        let yearA = eventA.year;
        let yearB = eventB.year;

        // For sorting treat BC years as negative numbers.
        yearA = yearA.toUpperCase().endsWith('BC') ? -parseInt(yearA) : parseInt(yearA);
        yearB = yearB.toUpperCase().endsWith('BC') ? -parseInt(yearB) : parseInt(yearB);

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


// OUTPUT

function outputForEventsInDocument(document) {
    return eventsForYearListElements(
        document.querySelectorAll('h2#Events + ul li')
    );
}

function outputForBirthsInDocument(document) {
    return eventsForYearListElements(
        document.querySelectorAll('h2#Births + ul li')
    );
}

function outputForDeathsInDocument(document) {
    return eventsForYearListElements(
        document.querySelectorAll('h2#Deaths + ul li')
    );
}

function outputForHolidaysInDocument(document) {
    return holidaysForHolidayListElements(
        document.querySelectorAll('h2#Holidays_and_observances + ul li')
    );
}

function outputForSelectedInDocument(document) {
    return eventsForYearListElements(
        document.querySelectorAll('body > ul li')
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
    return getDayHTMLForRequest(req)
    .then((onThisDayResponse) => {
        endResponseWithOutput(res,
            outputForBirthsInDocument(domino.createDocument(onThisDayResponse.body))
        );
    });
});

router.get('/deaths/:mm/:dd', (req, res) => {
    return getDayHTMLForRequest(req)
    .then((onThisDayResponse) => {
        endResponseWithOutput(res,
            outputForDeathsInDocument(domino.createDocument(onThisDayResponse.body))
        );
    });
});

router.get('/events/:mm/:dd', (req, res) => {
    return getDayHTMLForRequest(req)
    .then((onThisDayResponse) => {
        endResponseWithOutput(res,
            outputForEventsInDocument(domino.createDocument(onThisDayResponse.body))
        );
    });
});


// "Holiday and observances" style results for a given day as seen on "day" pages like: https://en.m.wikipedia.org/wiki/May_20
router.get('/holidays/:mm/:dd', (req, res) => {
    return getDayHTMLForRequest(req)
    .then((onThisDayResponse) => {
        endResponseWithOutput(res,
            outputForHolidaysInDocument(domino.createDocument(onThisDayResponse.body))
        );
    });
});


// "Selected" style results for a given day like those seen here: https://en.m.wikipedia.org/wiki/Wikipedia:On_this_day/Today
router.get('/selected/:mm/:dd', (req, res) => {
    return getAnniversariesHTMLForRequest(req)
    .then((selectedAnniversariesResponse) => {
        endResponseWithOutput(res,
            outputForSelectedInDocument(domino.createDocument(selectedAnniversariesResponse.body))
        );
    });
});


// Everything (Births, Deaths, Events, Holidays and Selected) all in one go.
router.get('/all/:mm/:dd', (req, res) => {
    Promise.all([
        getDayHTMLForRequest(req),
        getAnniversariesHTMLForRequest(req)
    ])
    .then(([onThisDayResponse, selectedAnniversariesResponse]) => {
        const onThisDayDoc = domino.createDocument(onThisDayResponse.body);
        const selectedAnniversariesDoc = domino.createDocument(selectedAnniversariesResponse.body);
        endResponseWithOutput(res, {
            births: outputForBirthsInDocument(onThisDayDoc),
            deaths: outputForDeathsInDocument(onThisDayDoc),
            events: outputForEventsInDocument(onThisDayDoc),
            holidays: outputForHolidaysInDocument(onThisDayDoc),
            selected: outputForSelectedInDocument(selectedAnniversariesDoc)
        });
    });
});


module.exports = function(appObj) {
    return {
        path: '/onthisday',
        api_version: 1,
        router,
        // Exposed for testing:
        dayURIForRequest,
        dayPageTitleFromMonthAndDayNumberStrings,
        anniversariesURIForRequest,
        getDayHTMLForRequest,
        getAnniversariesHTMLForRequest
    };
};
