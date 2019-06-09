const mUtil = require('../mobile-util');
const parsoidApi = require('../parsoid-access');
const translations = require('./parser-translations');
const removal = require('./parser-removal');
const WMFTopic = require('./WMFTopic').WMFTopic;
// const debugging = require('./parser-debugging');

/**
 * The main application object reported when this module is required.
 */
let app;

const endResponseWithOutput = (app, res, output, domain, revision) => {
    res.status(200);
    mUtil.setETag(res, revision);
    mUtil.setContentType(res, mUtil.CONTENT_TYPES.talk);
    res.json(output).end();
};

const fetchParsoidHtmlForTitle = (app, req, title) => {
    const parsoidReq = Object.create(req);
    parsoidReq.params.title = title;
    return parsoidApi.getParsoidHtml(app, parsoidReq);
};

const fetchDocAndRevision = (app, req) => {
    let revision;
    return fetchParsoidHtmlForTitle(app, req, req.params.title)
    .then((response) => {
        revision = parsoidApi.getRevisionFromEtag(response.headers);
        return response.body;
    })
    .then(mUtil.createDocument)
    .then(doc => [doc, revision]);
};

const sectionWithoutSubsections = section => {
  Array.from(section.querySelectorAll('section')).forEach(subSection => {
    subSection.parentNode.removeChild(subSection);
  });
  return section;
};

const sectionsInDoc = (doc, translations) => Array.from(doc.querySelectorAll('section'))
  .map(sectionWithoutSubsections)
  .map(sectionElement => new WMFTopic(sectionElement, doc, translations));

const fetchAndRespond = (app, req, res) => {
  const lang = req.params.domain.split('.')[0];

  return fetchDocAndRevision(app, req)
    .then((docAndRevision) => {
        const doc = docAndRevision[0];
        const revision = docAndRevision[1];

        removal.replaceElementsContainingOnlyOneBreakWithBreak(doc);
        /*
        Array.from(doc.querySelectorAll('section')).forEach(s => {
          if (![187, 214, 250].includes(parseInt(s.getAttribute('data-mw-section-id')))){
            s.parentNode.removeChild(s)
          }
        })
        */
        const sections = sectionsInDoc(doc, translations.translationsForLang(lang));
        sections.forEach((section, i) => {
          section.id = i;
          // ^ after T222419 is fixed can set `id` with the value from the section
          // element's `data-mw-section-id` (in `WMFTopic` constructor).
          section.addShas();
        });
        const nonEmptySections = sections
          .filter(section => !section.isEmpty());
          // .filter(section => [6, 7, 37, 65, 150].includes(section.id));
        const output = { topics: nonEmptySections };
        // debugging.writeOutputToExpectedOutputFixture(output, lang, req.params.title, revision);
        endResponseWithOutput(app, res, output, req.params.domain, revision);
    });
};

module.exports = {
  fetchAndRespond
};
