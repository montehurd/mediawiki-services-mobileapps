const mUtil = require('../../lib/mobile-util');
const parsoidApi = require('../../lib/parsoid-access');
const router = require('../../lib/util').router();
const crypto = require('crypto');

/**
 * The main application object reported when this module is require()d
 */
let app;

const createSha1 = (input) => {
  const shasum = crypto.createHash('sha1');
  shasum.update(input);
  return shasum.digest('hex');
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
const attributesToRemove = ['style','id','class','rel','about'];
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
      results.push(textContent(childNode, doc));
    }
  });
  return results.join('').trim();
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

    this.text = textContent(this.fragment, doc);
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

// if a fragment's content text ends in 4 digits followed by parenthetical content
// ( ie: '2018 (CEST)' ) then we're considering it a separate reply. (`fragmentEndsWithSig` can be
// checked to make this determination.) replies that do not end with such a signature need to be
// combined with either the next or previous reply with such a signature. This `combiner` uses an
// `accumulator` to buffer such signature-less fragments so they can be moved. returns false when
// an reply with a signature is encountered - as such can be used with array 'filter' so it both
// does the desired combination but also removes fragments from the array when their contents are
// appended to other fragments.
const replyAccumulator = [];
const replyCombiner = (replyData, index, array, doc) => {
  if (index === 0) {
    replyAccumulator.length = 0;
  }

  let stopAccumulating = false;
  if (index + 1 === array.length) {
    stopAccumulating = true;
  } else {
    const nextReplyData = array[index + 1];

    if (replyData.fragmentEndsWithSig) {
      stopAccumulating =
        nextReplyData.fragmentEndsWithSig === replyData.fragmentEndsWithSig;
    } else {
      stopAccumulating =
        nextReplyData.fragmentEndsWithSig !== replyData.fragmentEndsWithSig;
    }
  }

  if (stopAccumulating) {
    replyAccumulator.forEach(accumulatedReplyData => {
      replyData.combineWith(accumulatedReplyData, doc);
    });
    replyAccumulator.length = 0;
  } else {
    replyAccumulator.unshift(replyData);
  }
  return stopAccumulating;
};

const listItemReducerWithDoc = doc => {
  return (accumulator, replyData, index, array) => {

    const nextReplyData = (index > 0) ? array[index - 1] : null;
    const prevReplyData = (index + 1 < array.length) ? array[index + 1] : null;

    if (replyData.isListItemFirstSibling(prevReplyData, nextReplyData)) {

      const siblingListItemsIds = [];
      let lastF = replyData;
      for (var j = accumulator.length - 1; j > -1; j--) {
        const thisF = accumulator[j];
        if (thisF.isListItemSiblingWith(lastF)) {
          siblingListItemsIds.push(j);
        } else {
          break;
        }
        lastF = thisF;
      }

      const listItems = accumulator
        .filter((item, index) => siblingListItemsIds.includes(index))
        .reverse();

      replyData.convertToListContainingSelfAndItems(listItems, doc);

      accumulator = accumulator.filter((item, index) => !siblingListItemsIds.includes(index));
    }

    accumulator.push(replyData);
    return accumulator;
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
  Array.from(sectionElement.querySelectorAll('p,li,dt,dd,th,td,pre,div,blockquote,br,center'))
    .forEach(element => {

      if (!['LI', 'DT', 'DD'].includes(element.tagName)) {
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

// Reduce section or reply sha to first 7 chars.
const shortenSha = sectionOrReply => {
  sectionOrReply.sha = sectionOrReply.sha.substring(0, 7);
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
    const replies = soughtElementsInSection(sectionElement, doc)
      .reverse()
      .map(item => new WMFReplyData(item, doc))
      .filter(replyData => replyData.text.length > 0)
      .reduce(listItemReducerWithDoc(doc), [])
      .filter(
        (replyData, index, array) => replyCombiner(replyData, index, array, doc)
      )
      .reverse()
      .map(replyData => new WMFReply(replyData, doc))
      .filter(m => m.text.length > 0);

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
  // .filter((e, i) => [37, 113].includes(i))
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

/**
 * GET {domain}/v1/page/talk/{title}{/revision}{/tid}
 * Gets talk page info.
 */
router.get('/talk/:title/:revision?/:tid?', (req, res) => {
  return fetchAndRespond(app, req, res);
});

module.exports = function(appObj) {
    app = appObj;
    return {
        path: '/page',
        api_version: 1,
        router
    };
};
