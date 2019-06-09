const NodeType = require('../nodeType');
const relationships = require('./parser-relationships');

const removeElementsNonDestructively = (doc, elementsArray) => {
  elementsArray.reverse().forEach(e => {
    Array.from(e.childNodes).reverse().forEach(cn => {
      e.parentNode.insertBefore(cn, e.nextSibling);
    });
    e.parentNode.removeChild(e);
  });
};

const getCloneWithAnchorsOnly = element => {
  const clone = element.cloneNode(true);
  const nonAnchors = Array.from(clone.querySelectorAll('*')).filter(e => e.tagName !== 'A');
  removeElementsNonDestructively(clone, nonAnchors);
  return clone;
};

const textContentTagsToPreserve = ['A', 'B', 'I', 'SUP', 'SUB'];

const customTextContent = (rootNode, doc, exclusions = []) => {
  if (!rootNode || !rootNode.childNodes) {
    return '';
  }
  const tagsToPreserve = textContentTagsToPreserve.filter(tag => !exclusions.includes(tag));
  return rootNode.childNodes
    // eslint-disable-next-line no-use-before-define
    .map(childNode => textFromNode(childNode, tagsToPreserve, doc))
    .join('');
};

const attributesToRemove = ['style','id','class','rel','about','data-mw','typeof'];
const pruneUnwantedAttributes =
  (element) => attributesToRemove.forEach(attribute => element.removeAttribute(attribute));

const textFromPreservedElementNode = (elementNode, doc) => {
  const clone = elementNode.cloneNode(true);
  pruneUnwantedAttributes(clone);
  let text = customTextContent(clone, doc);
  if (text.length === 0 && clone.tagName === 'A') {
    const fileName = clone.href.substring(clone.href.lastIndexOf('/') + 1);
    text = `[${fileName}]`;
  }
  clone.innerHTML = text;
  return clone.outerHTML;
};

const escapeHTML = text => text
  .replace(/&/g,'&amp;')
  .replace(/</g,'&lt;')
  .replace(/>/g,'&gt;');

const textFromTextNode = textNode => escapeHTML(textNode.nodeValue);

class WMFTagWrappingPair {
  constructor(fromTag, toTag) {
    this.fromTag = fromTag;
    this.toTag = toTag;
  }
  nodeTagNameIsFromTag(node) {
    return node.tagName === this.fromTag;
  }
  isElementNodeWrappable(elementNode) {
    if (elementNode.tagName !== this.fromTag) {
      return false;
    }
    const isAlreadyWrapped = relationships.getFamilyTree(elementNode)
      .find((e, i) => i > 0 && e.tagName === this.toTag);
    if (isAlreadyWrapped) {
      return false;
    }
    const alreadyContainsToTagElements = elementNode.querySelectorAll(this.toTag).length > 0;
    if (alreadyContainsToTagElements) {
      // Wrapping in this case would make the contained elements no longer stand out.
      return false;
    }
    return true;
  }
  textFromElementNodeWrappedInToTag(elementNode, doc) {
    const wrapper = doc.createElement(this.toTag);
    wrapper.innerHTML = customTextContent(elementNode, doc);
    return wrapper.outerHTML;
  }
}

const tagWrappingPairs = [
  new WMFTagWrappingPair('DT', 'B'),
  new WMFTagWrappingPair('CODE', 'B'),
  new WMFTagWrappingPair('BIG', 'B')
];

const textFromNode = (node, tagsToPreserve, doc) => {
  switch (node.nodeType) {
    case NodeType.TEXT_NODE:
      return textFromTextNode(node);
    case NodeType.ELEMENT_NODE: {
      if (tagsToPreserve.includes(node.tagName)) {
        return textFromPreservedElementNode(node, doc);
      }

      const pair = tagWrappingPairs
        .find(pair => pair.nodeTagNameIsFromTag(node) && pair.isElementNodeWrappable(node));

      if (pair) {
        return pair.textFromElementNodeWrappedInToTag(node, doc);
      }

      return customTextContent(node, doc);
    }
    default:
  }
  return '';
};

// If a parent element contains only a BR, replace the parent with just the BR.
const replaceElementsContainingOnlyOneBreakWithBreak = doc => {
  Array.from(doc.querySelectorAll('br'))
    .filter(br => br.parentElement.childNodes.length === 1)
    .forEach(br => removeElementsNonDestructively(doc, [br.parentElement]));
};

module.exports = {
  escapeHTML,
  customTextContent,
  textFromTextNode,
  pruneUnwantedAttributes,
  textFromPreservedElementNode,
  removeElementsNonDestructively,
  getCloneWithAnchorsOnly,
  replaceElementsContainingOnlyOneBreakWithBreak
};
