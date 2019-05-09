const mUtil = require('./mobile-util');
const parsoidApi = require('./parsoid-access');
const crypto = require('crypto');

/**
 * The main application object reported when this module is required.
 */
let app;

const createSha1 = (input) => {
  const shasum = crypto.createHash('sha1');
  shasum.update(input);
  return shasum.digest('hex');
};

// Reduce section or reply sha to first 7 chars.
const shortenSha = sectionOrReply => {
  sectionOrReply.sha = sectionOrReply.sha.substring(0, 7);
};

const endResponseWithOutput = (app, res, output, domain, revision) => {
    res.status(200);
    mUtil.setETag(res, revision);
    mUtil.setContentType(res, mUtil.CONTENT_TYPES.talk);
    res.json(output).end();
};

function fetchParsoidHtmlForTitle(app, req, title) {
    const parsoidReq = Object.create(req);
    parsoidReq.params.title = title;
    return parsoidApi.getParsoidHtml(app, parsoidReq);
}

function fetchDocAndRevision(app, req) {
    let revision;
    return fetchParsoidHtmlForTitle(app, req, req.params.title)
    .then((response) => {
        revision = parsoidApi.getRevisionFromEtag(response.headers);
        return response.body;
    })
    .then(mUtil.createDocument)
    .then(doc => [doc, revision]);
}

const getFamilyTree = (element) => {
  let elem = element;
  let tree = [element];
  while ((elem = elem.parentElement) !== null) {
    tree.push(elem);
  }
  return tree;
};

const depthIndicatingAncestorTags = ['DL', 'UL', 'OL'];
function getDepth(element) {
  let familyTreeTags = getFamilyTree(element).map(e => e.tagName);
  let depth = familyTreeTags.filter(tag => depthIndicatingAncestorTags.includes(tag)).length;
  if (element.tagName === 'DT') {
    depth = depth - 1;
  }
  return depth;
}

function removeAttributes(node, attributes) {
  attributes.forEach(attribute => node.removeAttribute(attribute));
}

const escapeHTML = text => {
  return text
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
};

const textContentTagsToPreserve = ['A', 'B', 'I'];
const textContentTagsToConvertToBold = ['DT'];
const attributesToRemove = ['style','id','class','rel','about','data-mw','typeof'];
function textContent(rootNode, doc, exclusions = []) {
  if (!rootNode) {
    return '';
  }
  const childNodes = rootNode.childNodes;
  if (!childNodes) {
    return '';
  }
  const results = [];
  const tagsToPreserve = textContentTagsToPreserve.filter(tag => !exclusions.includes(tag));
  childNodes.forEach(childNode => {
    if (childNode.nodeType === 3) {
      results.push(escapeHTML(childNode.nodeValue));
    } else if (childNode.nodeType === 1) {
      // Everything should be text except `tagsToPreserve`
      if (tagsToPreserve.includes(childNode.tagName)) {
        const clone = childNode.cloneNode(true);
        removeAttributes(clone, attributesToRemove);

        let text = textContent(clone, doc);
        if (text.length === 0 && clone.tagName === 'A') {
          const fileName = clone.href.substring(clone.href.lastIndexOf('/') + 1);
          text = `[${fileName}]`;
        }

        clone.innerHTML = text;
        results.push(clone.outerHTML);
        return;
      }
      // Convert `textContentTagsToConvertToBold` to bold
      if (textContentTagsToConvertToBold.includes(childNode.tagName)) {
        const b = doc.createElement('B');
        b.innerHTML = textContent(childNode, doc);
        results.push(b.outerHTML);
        return;
      }
      if (['PRE'].includes(childNode.tagName)) {
        results.push(textContent(childNode, doc).replace(/\n/g,'<br>'));
        return;
      }
      results.push(textContent(childNode, doc));
    }
  });
  return results.join('').replace(/&nbsp;/g,' ');
}

const signatureRegex = /.*\s+\d{4}\s+\(.*\)\s*$/;

class WMFReply {
  constructor(replyData, doc) {
    this.text = replyData.text;
    this.depth = replyData.depth;
    this.sha = createSha1(this.text);
  }
}

class WMFReplyData {
  constructor(element = null, doc) {
    this.depth = getDepth(element);
    this.isListItem = element.tagName === 'LI';
    this.isListItemOrdered = this.isListItem && element.parentElement.tagName === 'OL';

    const fragment = doc.createDocumentFragment();
    fragment.appendChild(element);
    this.fragment = fragment;
    this.fragmentEndsWithSig = this.endsWithSig();

    this.text = textContent(this.fragment, doc).trim();
  }

  isListItemFirstSibling(prevReplyData, nextReplyData) {
    return nextReplyData
      && nextReplyData.isListItemSiblingWith(this)
      && !this.isListItemSiblingWith(prevReplyData);
  }

  isListItemSiblingWith(otherReplyData) {
    if (!otherReplyData) {
      return false;
    }
    return this.isListItem
      && otherReplyData.isListItem
      && this.depth === otherReplyData.depth
      && this.isListItemOrdered === otherReplyData.isListItemOrdered
      && this.fragmentEndsWithSig === false
      && otherReplyData.fragmentEndsWithSig === false;
  }

  endsWithSig() {
    if (this.fragment === null) {
      return false;
    }
    return signatureRegex.test(this.fragment.textContent);
  }

  shouldCombineWith(otherReplyData) {
    if (!otherReplyData) {
      return false;
    }
    return !otherReplyData.fragmentEndsWithSig;
  }

  combineWith(otherReplyData, doc) {
    const stringStartsWithListTagHTML = string => string.startsWith('<ol>') || string.startsWith('<ul>');
    const stringEndsWithListTagHTML = string => string.endsWith('</ol>') || string.endsWith('</ul>');
    let separator = '';
    if (
      otherReplyData.text.length > 0
      &&
      !stringStartsWithListTagHTML(otherReplyData.text)
      &&
      !stringEndsWithListTagHTML(this.text)
    ) {
      separator = `<br><br>${'&#8195;'.repeat(otherReplyData.depth)}`;
    }
    this.text = `${this.text}${separator}${otherReplyData.text}`;
  }

  convertToListContainingSelfAndItems(replyDataArray, doc) {
    if (replyDataArray.length < 1) {
      return;
    }
    const newText = [];
    newText.push(this.isListItemOrdered ? '<ol>' : '<ul>');
    newText.push('<li>');
    newText.push(this.text);
    replyDataArray.forEach(replyData => {
      newText.push('<li>');
      newText.push(replyData.text);
    });
    newText.push(this.isListItemOrdered ? '</ol>' : '</ul>');
    this.text = newText.join('');
  }
}

const replyCombiner = doc => {
  return (accumulator, replyData, index, array) => {
    const nextReplyData = (index + 1 < array.length) ? array[index + 1] : null;
    if (replyData.shouldCombineWith(nextReplyData)) {
      nextReplyData.combineWith(replyData, doc);
    } else {
      accumulator.push(replyData);
    }
    return accumulator;
  };
};

const listItemCombiner = doc => {
  return (accumulator, replyData, index, array) => {
    // Accumulate an array of arrays of indices of list items to be combined.
    if (accumulator.length === 0) {
      accumulator.push([]);
    }

    const prevReplyData = (index > 0) ? array[index - 1] : null;
    const nextReplyData = (index + 1 < array.length) ? array[index + 1] : null;
    if (replyData.isListItemSiblingWith(nextReplyData)) {
      accumulator[accumulator.length - 1].push(index);
    } else if (replyData.isListItemFirstSibling(nextReplyData, prevReplyData)) {
      accumulator[accumulator.length - 1].push(index);
      accumulator.push([]);
    }

    const isAtEnd = index === array.length - 1;
    if (!isAtEnd) {
      return accumulator;
    }

    // When we get here the accumulator will contain an array of arrays of indices of list items to
    // be combined. Do the combinations, then filter out the items which were combined.
    let indicesToRemove = [];
    accumulator.forEach(listItemIndices => {
      if (listItemIndices.length > 0) {
        const indexOfFirstSibling = listItemIndices.pop();
        indicesToRemove = indicesToRemove.concat(listItemIndices);
        const firstSibling = array[indexOfFirstSibling];
        const siblingsToBeCombined = listItemIndices.map(id => array[id]).reverse();
        firstSibling.convertToListContainingSelfAndItems(siblingsToBeCombined, doc);
      }
    });
    // Remove the sibling items which were merged into the firstSibling.
    return array.filter((_, index) => !indicesToRemove.includes(index));
  };
};

const arraysOfNodesAroundBreaksReducer = (resultArray, item, index) => {
  const isBR = item.tagName && item.tagName === 'BR';
  if (isBR || index === 0) {
    resultArray.push([]);
  }
  if (!isBR) {
    resultArray[resultArray.length - 1].push(item);
  }
  return resultArray;
};

const arraysOfNodesAroundSignaturesReducer = (resultArray, item, index) => {
  if (index === 0) {
    resultArray.push([]);
  }
  if (item.textContent.length > 0) {
    resultArray[resultArray.length - 1].push(item);
  }
  const isSigned = signatureRegex.test(item.textContent);
  if (isSigned) {
    resultArray.push([]);
  }
  return resultArray;
};

const pContainingArrayOfNodes = (nodeArray, doc) => {
  const p = doc.createElement('p');
  nodeArray.forEach(p.appendChild, p);
  return p;
};

const soughtElementsInSection = (sectionElement, doc) => {
  let elements = [];
  Array.from(sectionElement.querySelectorAll('p,li,dt,dd,th,td,pre,div,blockquote,center'))
    .forEach(element => {

      if (!['PRE', 'LI', 'DT', 'DD'].includes(element.tagName)) {
        element.childNodes
          .reduce(arraysOfNodesAroundBreaksReducer, [])
          .map(nodes => pContainingArrayOfNodes(nodes, doc))
          .forEach(p => {
            p.childNodes
              .reduce(arraysOfNodesAroundSignaturesReducer, [])
              .map(nodes => pContainingArrayOfNodes(nodes, doc))
              .forEach(p => elements.push(p));
          });
      } else {
        elements.push(element);
      }

    });
  return elements;
};

class WMFTopic {
  constructor(sectionElement, doc) {
    this.id = 0;
    this.replies = this.repliesFromSectionElement(sectionElement, doc);
    const header = sectionElement.querySelector('h1,h2,h3,h4,h5,h6');
    this.depth = header ? parseInt(header.tagName.replace(/[^0-9]/g, ''), 10) : 1;
    this.text = textContent(header, doc);
    // Section sha on section title and replies sha's.
    this.sha = createSha1(`${this.text}${this.replies.map(reply => reply.sha).join('')}`);
  }

  // Occasionally the first reply is at a non-zero depth.
  // Reduce all reply depths by first reply depth.
  normalizeReplyDepths(replies) {
    if (replies.length === 0) {
      return;
    }
    const initialReplyDepth = replies[0].depth;
    if (initialReplyDepth === 0) {
      return;
    }
    replies.forEach(reply => {
      const newDepth = reply.depth - initialReplyDepth;
      reply.depth = newDepth > -1 ? newDepth : 0;
    });
  }

  repliesFromSectionElement (sectionElement, doc) {
    const replyDataForElement = element => new WMFReplyData(element, doc);
    const replyOrReplyDataIsNonBlank = replyOrReplyData => replyOrReplyData.text.length > 0;
    const replyForReplyData = replyData => new WMFReply(replyData, doc);
    const replies = soughtElementsInSection(sectionElement, doc)
      .reverse()
      .map(replyDataForElement)
      .filter(replyOrReplyDataIsNonBlank)
      .reduce(listItemCombiner(doc), [])
      .reduce(replyCombiner(doc), [])
      .reverse()
      .map(replyForReplyData)
      .filter(replyOrReplyDataIsNonBlank);

    this.normalizeReplyDepths(replies);
    return replies;
  }

  shortenShas() {
    shortenSha(this);
    this.replies.forEach(shortenSha);
  }

  isEmpty() {
    return this.text.length === 0 && this.replies.length === 0;
  }
}

const sectionWithoutSubsections = section => {
  Array.from(section.querySelectorAll('section')).forEach(subSection => {
    subSection.parentNode.removeChild(subSection);
  });
  return section;
};

const sectionsInDoc = doc => Array.from(doc.querySelectorAll('section'))
  .map(sectionWithoutSubsections)
  // .filter((e, i) => [65].includes(i))
  .map(sectionElement => new WMFTopic(sectionElement, doc));

function fetchAndRespond(app, req, res) {
  const lang = req.params.domain.split('.')[0];
  return fetchDocAndRevision(app, req)
    .then((docAndRevision) => {
        const doc = docAndRevision[0];
        const revision = docAndRevision[1];
        const sections = sectionsInDoc(doc)
          .filter(section => !section.isEmpty());
        sections.forEach((section, i) => {
          section.shortenShas();
          section.id = i;
        });
        const output = { topics: sections };
        endResponseWithOutput(app, res, output, req.params.domain, revision);
    });
}

module.exports = {
  fetchAndRespond,
  createSha1,
  shortenSha,
  getFamilyTree
};
