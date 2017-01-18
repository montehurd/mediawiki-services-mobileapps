
'use strict';

const domino = require('domino');
const sUtil = require('../lib/util');
const router = sUtil.router();
const mUtil = require('../lib/mobile-util');
const parsoid = require('../lib/parsoid-access');
const BBPromise = require('bluebird');
const languages = require('../lib/on-this-day.languages').languages;

let app;

/**
 * Gets day page titles, which are formatted as follows: 'May_20'
 * @param  {!String} monthNumberString String for month number ranging from '1' to '12'
 * @param  {!String} dayNumberString   String number for day of month
 * @param  {!String} lang              String for project language code
 * @return {!String}                   Day page title. Example, inputs ('5', '20') returns 'May_20'
 */
function titleForDayPageFromMonthDayNumberStrings(monthNumberString, dayNumberString, lang) {
    const monthName = languages[lang].monthNames[parseInt(monthNumberString) - 1];
    const dayNumber = parseInt(dayNumberString);
    return languages[lang].dayPage.nameFormatter(monthName, dayNumber);
}

/**
 * Gets day page Parsoid title for day pages such as https://en.m.wikipedia.org/wiki/May_20
 * @param  {!Request} req Request containing month (req.params.mm) and day (req.params.dd) number
 * string params
 * @return {!String}      Day page title for month and day number. Example, input mm '5' dd '20
 * returns 'May_20'
 */
function dayTitleForRequest(req) {
    const lang = req.params.domain.split('.')[0];
    return titleForDayPageFromMonthDayNumberStrings(req.params.mm, req.params.dd, lang);
}

/**
 * Gets selected page titles, which are formatted as follows:
 *  'Wikipedia:Selected_anniversaries/May_20'
 * @param  {!String} monthNumberString String for month number ranging from '1' to '12'
 * @param  {!String} dayNumberString   String number for day of month
 * @param  {!String} lang              String for project language code
 * @return {!String}                   Selected page title. Example, inputs ('5', '20') returns
 * 'Wikipedia:Selected_anniversaries/May_20'
 */
function titleForSelectedPageFromMonthDayNumberStrings(monthNumberString, dayNumberString, lang) {
    const monthName = languages[lang].monthNames[parseInt(monthNumberString) - 1];
    const dayNumber = parseInt(dayNumberString);
    return languages[lang].selectedPage.nameFormatter(monthName, dayNumber);
}

/**
 * Gets selected page Parsoid title for selected pages such as
 * https://en.m.wikipedia.org/wiki/Wikipedia:Selected_anniversaries/May_20 ( These pages are
 * also where 'Today' page https://en.m.wikipedia.org/wiki/Wikipedia:On_this_day/Today content comes
 * from )
 * @param  {!Request} req Request containing month (req.params.mm) and day (req.params.dd) number
 * string params
 * @return {!String}      Selected page title for month and day number. Example, input mm '5' dd '20
 * returns 'Wikipedia:Selected_anniversaries/May_20'
 */
function selectedTitleForRequest(req) {
    const lang = req.params.domain.split('.')[0];
    return titleForSelectedPageFromMonthDayNumberStrings(req.params.mm, req.params.dd, lang);
}

/**
 * WMFPage models a link to a page
 * @param  {!String}     title   Page title, i.e. 'Goat'
 * @param  {!Boolean}    isTopic Events can have multiple links to pages, if this particular link is
 * bolded, such as those seen on https://en.m.wikipedia.org/wiki/Wikipedia:On_this_day/Today,
 * isTopic will be true.
 */
class WMFPage {
    constructor(title, isTopic) {
        this.title = title;
        if (isTopic) {
            this.isTopic = isTopic;
        }
    }
}

/**
 * WMFEvent models an historical event
 * @param  {!String}     text    Event description
 * @param  {!Array}      pages   Array of WMFPage's for the event
 * @param  {!Integer}    year    Year. A negative number indicates the event occured 'BC' (sometimes
 * also denoted 'BCE' - i.e. '32 BC' or '200 BCE)'
 */
class WMFEvent {
    constructor(text, pages, year) {
        this.text = text;
        this.pages = pages;
        this.year = year;
    }
}

/**
 * WMFHoliday models an annually occuring holiday
 * @param  {!String} text    Event description
 * @param  {!Array}  pages   Array of WMFPage's for the event
 */
class WMFHoliday {
    constructor(text, pages) {
        this.text = text;
        this.pages = pages;
    }
}

/**
 * Get a valid 'dbTitle' from a Parsoid anchor element ( No need to use 'getDbTitle' promise since
 * we already have the 'dbTitle' in Parsoid anchor 'href' )
 * @param  {!AnchorElement} anchorElement    Anchor to examine
 * @return {!String}                         A valid 'dbTitle' - i.e. title with underscores instead
 * of spaces (and other changes)
 */
function dbTitleFromParsoidAnchorElement(anchorElement) {
    const hrefStartsWithSlash = anchorElement.href.startsWith('/');
    return hrefStartsWithSlash ? anchorElement.href.substring(1) : anchorElement.href;
}

/**
 * Converts document anchor element to WMFPage model
 * @param   {!AnchorElement} anchorElement Anchor to convert
 * @return  {!WMFPage}                     A WMFPage
*/
function wmfPageFromAnchorElement(anchorElement) {
    const title = dbTitleFromParsoidAnchorElement(anchorElement);
    const isTopic = anchorElement.parentElement.tagName === 'B';
    return new WMFPage(title, isTopic);
}

/**
 * Converts document list element to WMFEvent model
 *
 * A regular expression determines valid "year list elements" and separating their components.
 *  For example:    '399 BC - Death of Socrates'
 *    RegEx Capture groups:
 *    1st - entire match (will be non-null if the string looks like a year list element)
 *                  '399 BC - Death of Socrates'
 *    2nd - year number, required
 *                  '399'
 *    3rd - 'BC' indication string, optional
 *                  'BC'
 *    4th - event description string, required
 *                  'Death of Socrates'
 *
 * @param   {!ListElement} listElement List element to convert
 * @param   {!String} lang             String for project language code
 * @return  {?WMFEvent}                A WMFEvent or null if the list element isn't formatted as an
 * event
*/
function wmfEventFromListElement(listElement, lang) {
    const regEx = languages[lang].yearListElementRegEx;
    const match = listElement.textContent.match(regEx);
    if (match === null) {
        return null;
    }

    let year = parseInt(match[1]);

    // Negate BC years so they sort correctly
    const isBC = (match[2] !== undefined);
    if (isBC) {
        year = -year;
    }

    const textAfterYear = match[3].trim();

    function isAnchorNotForYear(anchor) {
        return Math.abs(parseInt(anchor.title)) !== Math.abs(year);
    }

    const pages = Array.from(listElement.querySelectorAll('a'))
        .filter(isAnchorNotForYear)
        .map(wmfPageFromAnchorElement);

    return new WMFEvent(textAfterYear, pages, year);
}

/**
 * Converts document list element to WMFHoliday model
 * @param   {!ListElement} listElement List element to convert
 * @return  {!WMFHoliday}              A WMFHoliday
 */
function wmfHolidayFromListElement(listElement) {
    const text = listElement.textContent.trim();
    const pages = Array.from(listElement.querySelectorAll('a')).map(wmfPageFromAnchorElement);
    return new WMFHoliday(text, pages);
}

/**
 * WMFEvent comparator which properly handles negative 'BC'/'BCE' years
 * @param  {!WMFEvent} eventA First event
 * @param  {!WMFEvent} eventB Second event
 * @return {!Integer}         Number of years between eventB and eventA ( yearB - yearA ).
 */
function reverseChronologicalWMFEventComparator(eventA, eventB) {
    // Reminder: BC years are negative numbers.
    return eventB.year - eventA.year;
}

/**
 * Gets chronologically sorted array of WMFEvent models from an array of list elements.
 * @param  {!Array}     listElements    Array of document list elements
 * @param  {!String}    lang            String for project language code
 * @return {!Array}                     Sorted array of WMFEvent models, one for each year list
 * element found in 'listElements' argument
 */
function eventsForYearListElements(listElements, lang) {
    return listElements
        .map((element) => wmfEventFromListElement(element, lang))
        .filter((possibleEvent) => possibleEvent instanceof WMFEvent)
        .sort(reverseChronologicalWMFEventComparator);
}

/**
 * Gets array of WMFHoliday models from an array of list elements.
 * @param  {!Array} listElements Array of document list elements
 * @return {!Array}              Array of WMFHoliday models, one for each list element in
 * 'listElements' argument
 */
function holidaysForHolidayListElements(listElements) {
    return listElements.map(wmfHolidayFromListElement);
}

/**
 * Gets list elements grouped under a given heading. Couldn't use pure CSS selector syntax for
 * extracting these - this is because some languages use further sub-headings under, say, 'births',
 * for things like 'Births before 1900' and so forth. We want *all* births, in this case - that is,
 * we want all list elements after the h2 'births' heading up until the next h2 heading.
 * @param  {!Document}  document    Document to examine
 * @param  {!String}    headingId   String for heading id
 * @return {!Array}                 Array of list elements
 */
function listElementsByHeadingID(document, headingId) {
    const elements = Array.from(document.querySelectorAll('h2,ul li'));
    const listElements = [];
    let grab = false;
    for (const element of elements) {
        if (element.tagName === 'H2') {
            grab = (element.id === headingId);
        } else if (element.tagName === 'LI' && grab) {
            listElements.push(element);
        }
    }
    return listElements;
}

/**
 * Gets array of WMFEvent models of births found in a document
 * @param  {!Document} document  Document to examine
 * @param  {!String}   lang      String for project language code
 * @return {!Array}              Array of WMFEvent models of births
 */
const birthsInDoc = (document, lang) => {
    const selector = languages[lang].dayPage.headingIds.births;
    return eventsForYearListElements(
        listElementsByHeadingID(document, selector),
        lang
    );
};

/**
 * Gets array of WMFEvent models of deaths found in a document
 * @param  {!Document} document  Document to examine
 * @param  {!String}   lang      String for project language code
 * @return {!Array}              Array of WMFEvent models of deaths
 */
const deathsInDoc = (document, lang) => {
    const selector = languages[lang].dayPage.headingIds.deaths;
    return eventsForYearListElements(
        listElementsByHeadingID(document, selector),
        lang
    );
};

/**
 * Gets array of WMFEvent models of events found in a document
 * @param  {!Document} document  Document to examine
 * @param  {!String}   lang      String for project language code
 * @return {!Array}              Array of WMFEvent models of events
 */
const eventsInDoc = (document, lang) => {
    const selector = languages[lang].dayPage.headingIds.events;
    return eventsForYearListElements(
        listElementsByHeadingID(document, selector),
        lang
    );
};

/**
 * Gets array of WMFEvent models of holidays and observances found in a document
 * @param  {!Document} document  Document to examine
 * @param  {!String}   lang      String for project language code
 * @return {!Array}              Array of WMFEvent models of holidays and observances
 */
const holidaysInDoc = (document, lang) => {
    const selector = languages[lang].dayPage.headingIds.holidays;
    return holidaysForHolidayListElements(
        listElementsByHeadingID(document, selector)
    );
};

/**
 * Gets array of WMFEvent models of editor curated selected events found in a document
 * @param  {!Document} document  Document to examine
 * @param  {!String}   lang      String for project language code
 * @return {!Array}              Array of WMFEvent models of selections
 */
const selectionsInDoc = (document, lang) => {
    const selector = languages[lang].selectedPage.listElementSelector;
    return eventsForYearListElements(
        document.querySelectorAll(selector),
        lang
    );
};

/**
 * Gets dictionary of arrays of WMFEvent models of all types: 'births', 'deaths', 'events',
 * 'holidays' and 'selected'
 * @param  {!Document} dayDoc        Document of events on a given day
 * @param  {!Document} selectionsDoc Document of editor curated events for a given day
 * @param  {!String}   lang          String for project language code
 * @return {!Dictionary}             Dictionary with keys for arrays of 'births', 'deaths',
 * 'events', 'holidays' and 'selected'
 */
const everythingInDayAndSelectionsDocs = (dayDoc, selectionsDoc, lang) => {
    return {
        selected: selectionsInDoc(selectionsDoc, lang),
        births: birthsInDoc(dayDoc, lang),
        deaths: deathsInDoc(dayDoc, lang),
        events: eventsInDoc(dayDoc, lang),
        holidays: holidaysInDoc(dayDoc, lang)
    };
};

/**
 * Determines whether a dom object has a 'title' propery
 * @param  {!Object}  object Dom object to examine
 * @return {!Boolean}        True if the object has a 'title' property
 */
function hasTitle(object) {
    return (
        object.hasOwnProperty('title') && // eslint-disable-line no-prototype-builtins
        typeof object.title === 'string'
    );
}

/**
 * Replaces 'title' property of a dom object with a '$merge' property set to the restbase url for
 * that title
 * @param  {!Object} object Dom object to examine
 * @param  {!String} domain Domain
 */
function hydrateTitle(object, domain) {
    const title = object.title;
    delete object.title;
    object.$merge = [ mUtil.getRbPageSummaryUrl(app.restbase_tpl, domain, title) ];
}

/**
 * Recursively hydrates all 'title' properties found in a dom object hierarchy
 * @param  {!Object} object Dom object to examine
 * @param  {!String} domain Domain
 */
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

/**
 * Ends a response. Hydrates titles and sets eTags, status etc.
 * @param  {!Object} res         Response to end
 * @param  {!Object} output      Payload to JSONify and deliver
 * @param  {!String} domain      Domain
 * @param  {!String} revision    Revision
 */
const endResponseWithOutput = (res, output, domain, revision) => {
    // Hydrate titles just before responding. Otherwise you'd have to leak
    // 'domain' details all the way down to the WMFPage constructor (which
    // destroys promise chain simplicity).
    hydrateAllTitles(output, domain);

    res.status(200);
    mUtil.setETag(res, revision);
    mUtil.setContentType(res, mUtil.CONTENT_TYPES.onthisday);
    res.json(output).end();
};

/**
 * Promises to get Parsoid html for a title
 * @param  {!Object}     req     Request
 * @param  {!String}     title   Title to fetch
 * @return {!Promise}            Promise resolving to a response
 */
function fetchParsoidHtmlForTitle(req, title) {
    const parsoidReq = Object.create(req);
    parsoidReq.params.title = title;
    return parsoid.getParsoidHtml(app, parsoidReq);
}

/**
 * Fetches document and revision for URI
 * @param  {!Object}     req             Request
 * @param  {!Function}   titleFunction   Function reference for getting source page title from
 * request
 * @return {!Promise}                    Promise resolving to array containing [document, revision]
 * for URI
 */
function fetchDocAndRevision(req, titleFunction) {
    let revision;
    return fetchParsoidHtmlForTitle(req, titleFunction(req))
    .then((response) => {
        revision = parsoid.getRevisionFromEtag(response.headers);
        return response.body;
    })
    .then(domino.createDocument)
    .then((doc) => [doc, revision]);
}

/**
 * Fetches document for URI, extracts sought elements, responds
 * @param  {!Object} req                     Request
 * @param  {!Object} res                     Response
 * @param  {!Function} titleFunction         Function reference for getting source page title from
 * request
 * @param  {!Function} extractionFunction    Function reference for extracting sought elements
 * (births, deaths, holidays, etc)
 * @return {!Promise}                        Promise resolving when response has completed
 */
function fetchAndRespond(req, res, titleFunction, extractionFunction) {
    const lang = req.params.domain.split('.')[0];
    return fetchDocAndRevision(req, titleFunction)
    .then((docAndRevision) => {
        const doc = docAndRevision[0];
        const revision = docAndRevision[1];
        const output = extractionFunction(doc, lang);
        endResponseWithOutput(res, output, req.params.domain, revision);
    });
}

/**
 * ENDPOINT for 'births' from 'Births' section of 'day' pages like:
 * https://en.m.wikipedia.org/wiki/May_20 Example:
 * http://localhost:6927/en.wikipedia.org/v1/onthisday/births/01/30
 */
router.get('/births/:mm/:dd', (req, res) => {
    return fetchAndRespond(req, res, dayTitleForRequest, birthsInDoc);
});

/**
 * ENDPOINT for 'deaths' from 'Deaths' section of 'day' pages like:
 * https://en.m.wikipedia.org/wiki/May_20 Example:
 * http://localhost:6927/en.wikipedia.org/v1/onthisday/deaths/01/30
 */
router.get('/deaths/:mm/:dd', (req, res) => {
    return fetchAndRespond(req, res, dayTitleForRequest, deathsInDoc);
});

/**
 * ENDPOINT for 'events' from 'Events' section of 'day' pages like:
 * https://en.m.wikipedia.org/wiki/May_20 Example:
 * http://localhost:6927/en.wikipedia.org/v1/onthisday/events/01/30
 */
router.get('/events/:mm/:dd', (req, res) => {
    return fetchAndRespond(req, res, dayTitleForRequest, eventsInDoc);
});

/**
 * ENDPOINT for 'holidays' from 'Holiday and observances' section of 'day' pages like:
 * https://en.m.wikipedia.org/wiki/May_20 Example:
 * http://localhost:6927/en.wikipedia.org/v1/onthisday/holidays/01/30
 */
router.get('/holidays/:mm/:dd', (req, res) => {
    return fetchAndRespond(req, res, dayTitleForRequest, holidaysInDoc);
});

/**
 * ENDPOINT for 'selected' editor curated events from pages like:
 * https://en.m.wikipedia.org/wiki/Wikipedia:On_this_day/Today Example:
 * http://localhost:6927/en.wikipedia.org/v1/onthisday/selected/01/30
 */
router.get('/selected/:mm/:dd', (req, res) => {
    return fetchAndRespond(req, res, selectedTitleForRequest, selectionsInDoc);
});

/**
 * ENDPOINT for 'all' - everything ('births', 'deaths', 'events', 'holidays' and 'selected') all in
 * one go Example: http://localhost:6927/en.wikipedia.org/v1/onthisday/all/01/30
 */
router.get('/all/:mm/:dd', (req, res) => {
    const lang = req.params.domain.split('.')[0];
    return BBPromise.all([
        fetchDocAndRevision(req, dayTitleForRequest),
        fetchDocAndRevision(req, selectedTitleForRequest)
    ])
    .then((docsAndRevisions) => {
        const dayDocAndRevision = docsAndRevisions[0];
        const dayDoc = dayDocAndRevision[0];
        const dayRevision = dayDocAndRevision[1];

        const selectionsDocAndRevision = docsAndRevisions[1];
        const selectionsDoc = selectionsDocAndRevision[0];
        const selectionsRevision = selectionsDocAndRevision[1];

        const revision = Math.max(dayRevision, selectionsRevision);
        const output = everythingInDayAndSelectionsDocs(dayDoc, selectionsDoc, lang);
        endResponseWithOutput(res, output, req.params.domain, revision);
    });
});

module.exports = function(appObj) {
    app = appObj;
    return {
        path: '/onthisday',
        api_version: 1,
        router,
        testing: { // Testing namespace
            dayTitleForRequest,
            selectedTitleForRequest,
            titleForDayPageFromMonthDayNumberStrings,
            WMFPage,
            WMFEvent,
            WMFHoliday,
            wmfHolidayFromListElement,
            wmfEventFromListElement,
            wmfPageFromAnchorElement,
            eventsForYearListElements,
            reverseChronologicalWMFEventComparator,
            hydrateAllTitles,
            listElementsByHeadingID
        }
    };
};
