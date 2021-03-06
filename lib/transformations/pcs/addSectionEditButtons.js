'use strict';

const EditTransform = require('wikimedia-page-library').EditTransform;
const addHrefToEditButton = require('./addHrefToEditButton');
const domUtil = require('../../domUtil');

const CLASS = EditTransform.CLASS;

/**
 * Wraps section heading into a div if found.
 * @param {!Document} document Parsoid DOM document
 * @param {!Element} sectionElement the <section> element
 * @return {?HTMLDivElement} new header wrapper or undefined if no heading was found
 */
const wrapSectionHeader = (document, sectionElement) => {
    const headingElement = sectionElement.querySelector('h1,h2,h3,h4,h5,h6');
    if (!headingElement) {
        return;
    }

    // TODO: HEADER would probably be more appropriate, but keeping in sync with page lib for now
    const divElement = document.createElement('div');
    divElement.className = CLASS.SECTION_HEADER;

    // Make new <div> the first child element of this section
    sectionElement.insertBefore(divElement, headingElement);
    // Move heading (<h?>) under <div>
    divElement.appendChild(headingElement);
    // TODO: currently only here for CSS. Consider removing and changing the CSS selector instead
    headingElement.classList.add(CLASS.TITLE);

    return divElement;
};

/**
 * Sets the inline style to the element to float left or right.
 * This makes the lead section text wrap about the element.
 * @param {!Element} element
 * @param {?boolean} floatLeft to float left; else right.
 */
function floatElement(element, floatLeft) {
    const floatValue = floatLeft ? 'left' : 'right';
    element.setAttribute('style', `float: ${floatValue};`);
}

/**
 * Adds the section edit button for one section.
 * For the lead section:
 *   Don't set headerWrapper. Will add the button as first child of section.
 * For other sections:
 *   Set the headerWrapper. Will add the button to the end of headerWrapper.
 * @param {!Document} document Parsoid DOM document
 * @param {!Element} sectionElement the <section> element
 * @param {!number} index the zero-based index of the section
 * @param {?Element} headerWrapper
 */
const addOneSectionEditButton = (document, sectionElement, index, headerWrapper) => {
    const button = EditTransform.newEditSectionButton(document, index);
    if (headerWrapper) {
        headerWrapper.appendChild(button);
    } else {
        // lead section:
        sectionElement.insertBefore(button, sectionElement.firstChild);
        floatElement(button, domUtil.isRTL(sectionElement));
    }
};

/**
 * Adds section headings for sections with id > 0.
 * @param {!Document} doc Parsoid DOM document
 */
module.exports = (doc) => {
    const title = domUtil.getParsoidLinkTitle(doc);
    const sections = Array.from(doc.querySelectorAll('section'));
    sections.forEach((sectionElement) => {
        const sectionID = sectionElement.getAttribute('data-mw-section-id');
        if (sectionID > 0) {
            const headerWrapper = wrapSectionHeader(doc, sectionElement);
            addOneSectionEditButton(doc, sectionElement, sectionID, headerWrapper);
            if (title) {
                addHrefToEditButton(sectionElement, sectionID, title);
            }
        }
    });
};
