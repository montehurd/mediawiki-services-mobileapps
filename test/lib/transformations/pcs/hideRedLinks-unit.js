'use strict';

const domino = require('domino');
const fs = require('fs');
const path = require('path');
const assert = require('../../../utils/assert');
const hideRedLinks = require('../../../../lib/transforms').pcsHideRedLinks;
const FIXTURES = 'test/fixtures/';

describe('lib:pcsHideRedLinks', () => {
    /**
     * @param {!string} fileName name of the fixture file to load
     * @return {!Document}
     */
    const readTestDoc = (fileName) => {
        const html = fs.readFileSync(path.resolve(FIXTURES, fileName));
        return domino.createDocument(html);
    };

    it('hideRedLinks should drop <a> elements with class="new" ', () => {
        const document = readTestDoc('Dog.html');
        assert.selectorExistsNTimes(document, 'a.new', 1, 'pre transform');

        hideRedLinks(document);

        assert.selectorExistsNTimes(document, 'a.new', 0,
            'post transform');
    });
});
