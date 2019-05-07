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

// const consecutiveWhitespaceLinesRegex = /\n\s*\n/g;
const signatureRegex = /.*\s+\d{4}\s+\(.*\)\s*$/;

class WMFReply {
  constructor(fragmentAndDepth, doc) {
    this.text = fragmentAndDepth.text;
    this.depth = fragmentAndDepth.depth;
    this.sha = createSha1(this.text);
  }
}

class WMFReplyFragmentAndDepth {
  constructor(element = null, doc) {
    this.depth = getDepth(element);
    this.isListItem = element.tagName === 'LI';
    this.isListItemOrdered = this.isListItem && element.parentElement.tagName === 'OL';

    const fragment = doc.createDocumentFragment();
    fragment.appendChild(element);
//do i still need fragment? if not can fragmentEndsWithSig go against text and just be endsWithSig?
    this.fragment = fragment;
    this.fragmentEndsWithSig = this.endsWithSig();
    
    this.text = textContent(this.fragment, doc)
      // .replace(consecutiveWhitespaceLinesRegex, '\n')
      // .trim()

      // .replace(/\t/g,'&#8195;')
      // .replace(/\n/g,'<br><br>');
//        ^ last 2 replaces not needed?
  }


// setText(text) {
//   this.text = text
//     .replace(consecutiveWhitespaceLinesRegex, '\n')
//     .trim()
// }

  // text(doc) {
  //   return textContent(this.fragment, doc)
  //     .replace(consecutiveWhitespaceLinesRegex, '\n')
  //     .trim()
  //     .replace(/\t/g,'&#8195;')
  //     .replace(/\n/g,'<br><br>');
  // }

  endsWithSig() {
    if (this.fragment === null) {
      return false;
    }
    return signatureRegex.test(this.fragment.textContent);
  }

  combineWith(otherReplyFragmentAndDepth, doc) {
    

    
    // const tabsTextNode = doc.createTextNode(`\n${'\t'.repeat(otherReplyFragmentAndDepth.depth)}`);
    // this.fragment.appendChild(tabsTextNode);
    
//XXX    this.fragment.appendChild(otherReplyFragmentAndDepth.fragment);
    
const stringStartsWithListTagHTML = string => string.startsWith('<OL>') || string.startsWith('<UL>') 
const stringEndsWithListTagHTML = string => string.endsWith('</OL>') || string.endsWith('</UL>') 

    
let separator = ''
if (
  otherReplyFragmentAndDepth.text.length > 0 
  && 
  !stringStartsWithListTagHTML(otherReplyFragmentAndDepth.text)
  &&
  !stringEndsWithListTagHTML(this.text)  
) {
  separator = `<br><br>${'&#8195;'.repeat(otherReplyFragmentAndDepth.depth)}`
}


const otherText = otherReplyFragmentAndDepth.text
//.replace(/^(&#8195;)/g, 'T')


this.text = `${this.text}${separator}${otherText}`
  // .replace(consecutiveWhitespaceLinesRegex, '\n')
  // .trim()

  }
  
  
  
  
  
  
  convertToListContainingItems(replyFragmentAndDepthArray, doc) {
    if(replyFragmentAndDepthArray.length < 1) { 
      return
    }

    const newText = []
    newText.push(this.isListItemOrdered ? '<OL>' : '<UL>')

    newText.push('<LI>')
    newText.push(this.text)
    
    replyFragmentAndDepthArray.forEach(replyFragmentAndDepth => {
      newText.push('<LI>')
      newText.push(replyFragmentAndDepth.text)
    })
        
    newText.push(this.isListItemOrdered ? '</OL>' : '</UL>') 
    this.text = newText.join('')
    
    
    // .replace(consecutiveWhitespaceLinesRegex, '\n')
    // .trim()

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
const accumulator = [];
const combiner = (fragmentAndDepth, index, array, doc) => {
  if (index === 0) {
    accumulator.length = 0;
  }

  let stopAccumulating = false;
  if (index + 1 === array.length) {
    stopAccumulating = true;
  } else {
    const nextFragmentAndDepth = array[index + 1];

    if (fragmentAndDepth.fragmentEndsWithSig) {
      stopAccumulating =
        nextFragmentAndDepth.fragmentEndsWithSig === fragmentAndDepth.fragmentEndsWithSig;
    } else {
      stopAccumulating =
        nextFragmentAndDepth.fragmentEndsWithSig !== fragmentAndDepth.fragmentEndsWithSig;
    }
  }

  if (stopAccumulating) {
    accumulator.forEach(accumulatedFragmentAndDepth => {
      fragmentAndDepth.combineWith(accumulatedFragmentAndDepth, doc);
    });
    accumulator.length = 0;
  } else {
    accumulator.unshift(fragmentAndDepth);
  }
  return stopAccumulating;
};















 
const accumulator2 = [];
const combiner2 = (fragmentAndDepth, index, array, doc) => {
  // return true
  if (index === 0) {
    accumulator2.length = 0;
  }

  let stopAccumulating = false;
  if (index + 1 === array.length) {
    stopAccumulating = true;
  } else {
    const nextFragmentAndDepth = array[index + 1];

    const continueAccumulating =
      fragmentAndDepth.isListItem && nextFragmentAndDepth.isListItem
      && fragmentAndDepth.depth === nextFragmentAndDepth.depth
      && fragmentAndDepth.isListItemOrdered === nextFragmentAndDepth.isListItemOrdered
      && fragmentAndDepth.fragmentEndsWithSig === false
      && nextFragmentAndDepth.fragmentEndsWithSig === false


// if (fragmentAndDepth.isListItem) {
//   fragmentAndDepth.text = fragmentAndDepth.text + 'FART'
// }

   
    stopAccumulating = !continueAccumulating  
  }
  





  if (stopAccumulating) {


// if (accumulator2.length > 0){
//   const tn = doc.createTextNode('AAA')
//   fragmentAndDepth.fragment.appendChild(tn)    
// }


fragmentAndDepth.convertToListContainingItems(accumulator2, doc);

    // accumulator2.forEach(accumulatedFragmentAndDepth => {
      // fragmentAndDepth.combineWith(accumulatedFragmentAndDepth, doc);
    // });
    accumulator2.length = 0;
  } else {
    accumulator2.unshift(fragmentAndDepth);
  }
//return true
  return stopAccumulating;
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
  repliesFromSectionElement (sectionElement, doc) {
    return soughtElementsInSection(sectionElement, doc)
      .reverse()
      .map(item => new WMFReplyFragmentAndDepth(item, doc))
      .filter(fragmentAndDepth => fragmentAndDepth.text.length > 0)
.filter((fragmentAndDepth, index, array) => combiner2(fragmentAndDepth, index, array, doc))
      .filter((fragmentAndDepth, index, array) => combiner(fragmentAndDepth, index, array, doc))
      .reverse() 
      .map(fragmentAndDepth => new WMFReply(fragmentAndDepth, doc))
      .filter(m => m.text.length > 0);
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
  // .filter((e, i) => [1, 13].includes(i))
  .map(sectionElement => new WMFTopic(sectionElement, doc));

function fetchAndRespond(app, req, res) {
  const lang = req.params.domain.split('.')[0];
  // assertLanguage(lang);
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
