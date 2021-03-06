'use strict';

const BBPromise = require('bluebird');
const domUtil = require('../../lib/domUtil');
const mwapi = require('../../lib/mwapi');
const mUtil = require('../../lib/mobile-util');
const mobileviewHtml = require('../../lib/mobileview-html');
const apiUtil = require('../../lib/api-util');
const parsoidApi = require('../../lib/parsoid-access');
const preprocessParsoidHtml = require('../../lib/processing');
const sUtil = require('../../lib/util');
const transforms = require('../../lib/transforms');

/**
 * The main router object
 */
const router = sUtil.router();

/**
 * The main application object reported when this module is require()d
 */
let app;

/**
 * GET {domain}/v1/page/mobile-compat-html/{title}{/revision}{/tid}
 * Gets in HTML. This is based on Parsoid with some minor modifications more
 * suitable for the reading use cases.
 */
router.get('/page/mobile-compat-html/:title/:revision?/:tid?', (req, res) => {
    return parsoidApi.pageDocumentPromise(app, req, false)
    .then((response) => {
        res.status(200);
        mUtil.setContentType(res, mUtil.CONTENT_TYPES.mobileHtml);
        mUtil.setETag(res, response.meta.revision);
        mUtil.setLanguageHeaders(res, response.meta._headers);
        mUtil.setContentSecurityPolicy(res, app.conf.mobile_html_csp);
        // Don't poison the client response with the internal _headers object
        delete response.meta._headers;
        res.send(response.document.outerHTML).end();
    });
});

function getMobileHtmlFromPOST(req, res) {
    const html = req.body && req.body.html || req.body;
    return BBPromise.props({
        parsoid: parsoidApi.preprocessedDocumentPromise(app, req, html, true),
        mw: mwapi.getMetadataForMobileHtml(req)
    }).then((response) => {
        return BBPromise.props({
            // run another processing script after we've retrieved the metadata response from MW API
            processedParsoidResponse: preprocessParsoidHtml(response.parsoid.document,
                app.conf.processing_scripts['mobile-html-post-meta'],
                { mw: response.mw, parsoid: response.parsoid }),
            parsoid: BBPromise.resolve(response.parsoid),
            mw: BBPromise.resolve(response.mw)
        });
    }).then((response) => {
        res.status(200);
        mUtil.setContentType(res, mUtil.CONTENT_TYPES.mobileHtml);
        mUtil.setLanguageHeaders(res, response.parsoid.meta._headers);
        mUtil.setContentSecurityPolicy(res, app.conf.mobile_html_csp);
        // Don't poison the client response with the internal _headers object
        delete response.parsoid.meta._headers;

        res.send(response.processedParsoidResponse.outerHTML).end();
    });
}

function getMobileHtmlFromParsoid(req, res) {
    return BBPromise.props({
        parsoid: parsoidApi.pageDocumentPromise(app, req, true),
        mw: mwapi.getMetadataForMobileHtml(req)
    }).then((response) => {
        return BBPromise.props({
            // run another processing script after we've retrieved the metadata response from MW API
            processedParsoidResponse: preprocessParsoidHtml(response.parsoid.document,
                app.conf.processing_scripts['mobile-html-post-meta'],
                { mw: response.mw, parsoid: response.parsoid }),
            parsoid: BBPromise.resolve(response.parsoid),
            mw: BBPromise.resolve(response.mw)
        });
    }).then((response) => {
        res.status(200);
        mUtil.setContentType(res, mUtil.CONTENT_TYPES.mobileHtml);
        mUtil.setETag(res, response.parsoid.meta.revision);
        mUtil.setLanguageHeaders(res, response.parsoid.meta._headers);
        mUtil.setContentSecurityPolicy(res, app.conf.mobile_html_csp);
        // Don't poison the client response with the internal _headers object
        delete response.parsoid.meta._headers;

        res.send(response.processedParsoidResponse.outerHTML).end();
    });
}

function getMobileHtmlFromMobileview(req, res) {
    const scripts = app.conf.processing_scripts['mobile-html'];
    const baseURI = app.conf.mobile_html_rest_api_base_uri;
    mobileviewHtml.requestAndProcessPage(req, scripts, baseURI).then((result) => {
        res.status(200);
        mUtil.setContentType(res, mUtil.CONTENT_TYPES.mobileHtml);
        mUtil.setETag(res, result.meta.revision);
        // mUtil.setLanguageHeaders(res, response.parsoid.meta._headers);
        mUtil.setContentSecurityPolicy(res, app.conf.mobile_html_csp);

        res.send(result.doc.outerHTML).end();
    });
}

/**
 * GET {domain}/v1/page/mobile-html/{title}{/revision}{/tid}
 * Gets page content in HTML. This is a more optimized for direct consumption by reading
 * clients.
 */
router.get('/page/mobile-html/:title/:revision?/:tid?', (req, res) => {
    if (!mobileviewHtml.shouldUseMobileview(req)) {
        return getMobileHtmlFromParsoid(req, res);
    } else {
        return getMobileHtmlFromMobileview(req, res);
    }
});

/**
 * POST {domain}/v1/transform/html/to/mobile-html/{title}
 * Previews page content in HTML. POST body should be Parsoid HTML
 */
router.post('/transform/html/to/mobile-html/:title', (req, res) => {
    return getMobileHtmlFromPOST(req, res);
});

router.get('/page/mobile-html-offline-resources/:title/:revision?/:tid?', (req, res) => {
    res.status(200);
    mUtil.setContentType(res, mUtil.CONTENT_TYPES.mobileHtmlOfflineResources);
    mUtil.setContentSecurityPolicy(res, app.conf.mobile_html_csp);

    // Get external API URI
    let externalApiUri = apiUtil.getExternalRestApiUri(req.params.domain);
    // make it  schemeless
    externalApiUri = externalApiUri.replace(new RegExp('https://'), '//');
    let metawikiApiUri = app.conf.mobile_html_rest_api_base_uri
        .replace(new RegExp('(https|http)://'), '//');
    const offlineResources = [
        `${metawikiApiUri}data/css/mobile/base`,
        `${metawikiApiUri}data/css/mobile/pagelib`,
        `${metawikiApiUri}data/javascript/mobile/pagelib`,
        `${externalApiUri}data/css/mobile/site`,
    ];

    res.send(offlineResources).end();
});

module.exports = function(appObj) {
    app = appObj;
    return {
        path: '/',
        api_version: 1,
        router
    };
};
