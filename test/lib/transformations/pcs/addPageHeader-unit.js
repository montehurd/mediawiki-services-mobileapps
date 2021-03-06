'use strict';

const domino = require('domino');
const assert = require('../../../utils/assert.js');
const addPageHeader = require('../../../../lib/transformations/pcs/addPageHeader');
const testUtil = require('../../../utils/testUtil');

describe('lib:addPageHeader', () => {
    it('addPageHeader should add header element with description', () => {
        const document = testUtil.readTestFixtureDoc('Dog.html');

        addPageHeader(document, {
            mw: {
                displaytitle: 'Dog',
                description: 'short desc',
                description_source: 'central',
            },
            parsoid: {
                meta: { pronunciation: { url: 'foo' } }
            }
        });

        const header = document.body.querySelector('header');
        assert.ok(header);
        const pronunciationLink = header.querySelector('#pagelib_edit_section_title_pronunciation');
        assert.ok(pronunciationLink);
        assert.ok(pronunciationLink.getAttribute('data-action', 'title_pronunciation'));
        const editLink = header.querySelector('a.pagelib_edit_section_link');
        assert.deepEqual(editLink.href, '/w/index.php?title=Dog&action=edit&section=0');
        assert.deepEqual(editLink.getAttribute('data-action'), 'edit_section');
        assert.deepEqual(editLink.getAttribute('data-id'), '0');
        assert.deepEqual(header.querySelector('#pagelib_edit_section_title_description').innerHTML,
            'short desc');
        assert.ok(header.querySelector('#pagelib_edit_section_divider'));
    });

    it('addPageHeader handles documents with no section elements', () => {
        const doc = domino.createDocument();
        const meta = { mw: {}, parsoid: { meta: {} } };
        try {
            addPageHeader(doc, meta);
            assert.ok(true);
        } catch (e) {
            assert.fail(e);
        }
    });
});
