const mUtil = require('../../lib/mobile-util');
const parsoidApi = require('../../lib/parsoid-access');
const router = require('../../lib/util').router();
const crypto = require('crypto');

/**
 * The main application object reported when this module is require()d
 */
let app;

/**
 * GET {domain}/v1/page/talk/{title}{/revision}{/tid}
 * Gets talk page info.
 */

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

const depthIndicatingAncestorTags = ['DL', 'UL', 'OL']
function getDepth(element) {
  let elem = element
  let familyTreeTags = [element.tagName] 
  while(elem = elem.parentElement) { 
    familyTreeTags.push(elem.tagName) 
  }
  let depth = familyTreeTags.filter(tag => depthIndicatingAncestorTags.includes(tag)).length
  if (element.tagName === 'DT') {
    depth = depth - 1
  }
  return depth
}

const consecutiveWhitespaceLinesRegex = /\n\s*\n/g 
const signatureRegex = /.*\s+\d{4}\s+\(.*\)\s*$/

class WMFMessage {
  constructor(text = '', depth = 0) {
    this.text = text.replace(consecutiveWhitespaceLinesRegex, '\n').trim() 
    this.depth = depth
    this.sha = createSha1(this.text)
  }
}

class WMFMessageFragmentAndDepth {
  constructor(fragment = null, depth = 0) {
    this.fragment = fragment
    this.depth = depth
    this.fragmentEndsWithSig = this.endsWithSig()
  }
  endsWithSig() {
    if (this.fragment === null) {
      return false
    }
    return signatureRegex.test(this.fragment.textContent)
  }
  appendChildren(children) {
    children.forEach(child => this.fragment.appendChild(child))
  }
  prependChildren(children) {
    children.forEach(child => this.fragment.insertBefore(child, this.fragment.firstChild))
  }
}

// if a fragment's content text ends in 4 digits followed by parenthetical content 
// ( ie: '2018 (CEST)' ) then we're considering it a separate item. (`fragmentEndsWithSig` can be
// checked to make this determination.) items that do not end with such a signature need to be
// combined with either the next or previous item with such a signature. This `combiner` uses an
// `accumulator` to buffer such signature-less fragments so they can be moved. returns false when
// an item with a signature is encountered - as such can be used with array 'filter' so it both
// does the desired combination but also removes fragments from the array when their contents are
// appended to other fragments.
const accumulator = []
let firstItemEndsWithSig = false
const combiner = (fragmentAndDepth, index, array, doc) => {
  if (index === 0) {
    accumulator.length = 0
    firstItemEndsWithSig = fragmentAndDepth.fragmentEndsWithSig 
  }
  
  let stopAccumulating = false
  if (index + 1 === array.length) {
    stopAccumulating = true
  } else {
    const nextFragmentAndDepth = array[index + 1]
    
    if (fragmentAndDepth.fragmentEndsWithSig){
      stopAccumulating = nextFragmentAndDepth.fragmentEndsWithSig === fragmentAndDepth.fragmentEndsWithSig
    } else {
      stopAccumulating = nextFragmentAndDepth.fragmentEndsWithSig != fragmentAndDepth.fragmentEndsWithSig
    }
  } 
  
  if (stopAccumulating) {
    accumulator.forEach(accumulatedFragmentAndDepth => { 
      const tabsTextNode = doc.createTextNode(`\n${'\t'.repeat(accumulatedFragmentAndDepth.depth)}`)
      fragmentAndDepth.appendChildren([tabsTextNode, accumulatedFragmentAndDepth.fragment])
    })
    accumulator.length = 0
  } else {
    accumulator.unshift(fragmentAndDepth)
  } 
  return stopAccumulating
} 

function removeAttributes(node, attributes) {
  attributes.forEach(attribute => node.removeAttribute(attribute))
}

const textContentTagsToPreserve = ['A', 'B', 'I']
const textContentTagsToConvertToBold = ['DT']
const attributesToRemove = ['style','id','class','rel','about']
function textContent(rootNode, doc, exclusions = []) {
  if (!rootNode) {
    return ''
  }
  const childNodes = rootNode.childNodes;
  if (!childNodes) {
    return ''
  }
  const results = [];
  const tagsToPreserve = textContentTagsToPreserve.filter(tag => !exclusions.includes(tag))
  childNodes.forEach(childNode => {
    if (childNode.nodeType === 3) {
      const text = childNode.nodeValue
      const escapedText = text
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
      results.push(escapedText)
    } else if (childNode.nodeType === 1) {
      // Everything should be text except `tagsToPreserve`
      if(tagsToPreserve.includes(childNode.tagName)) {
        const clone = childNode.cloneNode(true)
        removeAttributes(clone, attributesToRemove)

        let text = textContent(clone, doc) 
        if (text.length === 0 && clone.tagName === 'A') {
          const fileName = clone.href.substring(clone.href.lastIndexOf('/') + 1)
          text = `[${fileName}]`
        }

        clone.innerHTML = text
        results.push(clone.outerHTML)
        return
      }
      // Convert `textContentTagsToConvertToBold` to bold  
      if(textContentTagsToConvertToBold.includes(childNode.tagName)) {
        const b = doc.createElement('B')
        b.innerHTML = textContent(childNode, doc)
        results.push(b.outerHTML)
        return
      }
      results.push(textContent(childNode, doc));
    }
  })
  return results.join(''); 
}

const arraysOfNodesAroundSignaturesReducer = (resultArray, item, index) => {
  if (index === 0) {
    resultArray.push([])
  }
  if (item.textContent.length > 0) {
    resultArray[resultArray.length - 1].push(item)  
  }
  const isSigned = signatureRegex.test(item.textContent)
  if (isSigned) {
    resultArray.push([])
  }
  return resultArray
}

const pContainingArrayOfNodes = (nodeArray, doc) => {
  const p = doc.createElement('p')
  nodeArray.forEach(p.appendChild, p)
  return p 
}

const soughtElementsInSection = (sectionElement, doc) => {
  let elements = []
  Array.from(sectionElement.querySelectorAll('p,li,dt,dd'))
    .forEach(element => {
      if (element.tagName === 'P'){
        // Sometimes inside 'p' tags we see responses only separated by break tags, so wrap these
        // responses in 'p' elements so they are treated like 'p' wrapped responses.
        element.childNodes
          .reduce(arraysOfNodesAroundSignaturesReducer, [])
          .map(nodes => pContainingArrayOfNodes(nodes, doc))
          .forEach(p => elements.push(p))
      }else{
        elements.push(element)  
      }
    })  
  return elements
}

class WMFSection {
  constructor(sectionElement, doc) {
    this.id = sectionElement.getAttribute('data-mw-section-id')
    this.items = this.itemsFromSectionElement(sectionElement, doc)
    // Question: h2 only?
    const h2 = sectionElement.querySelector('h2')
    // this.text = h2 ? h2.textContent : ''
    const titleHTMLExclusions = ['A']
    this.text = textContent(h2, doc, titleHTMLExclusions)
    // Section sha on section title and items sha's.
    this.sha = createSha1(`${this.text}${this.items.map(item => item.sha).join('')}`)
  }
  itemsFromSectionElement (sectionElement, doc) {
    return soughtElementsInSection(sectionElement, doc)
      .reverse()
      .map(item => {
          const fragment = doc.createDocumentFragment()
          const depth = getDepth(item)
          fragment.appendChild(item)
          return new WMFMessageFragmentAndDepth(fragment, depth)
      })
      .filter((fragmentAndDepth, index, array) => combiner(fragmentAndDepth, index, array, doc))
      .reverse()
      .map(fragmentAndDepth => new WMFMessage(textContent(fragmentAndDepth.fragment, doc), fragmentAndDepth.depth))
      .filter(m => m.text.length > 0)
  }
  shortenShas() {
    shortenSha(this)
    this.items.forEach(shortenSha)  
  }
}

// Reduce section or item sha to first 7 chars.
const shortenSha = sectionOrItem => sectionOrItem.sha = sectionOrItem.sha.substring(0, 7)

const sectionsInDoc = doc => Array.from(doc.querySelectorAll('section'))
  //.filter((e, i) => i === 37) // Debugging a single section by index 
  .map(sectionElement => new WMFSection(sectionElement, doc))

function fetchAndRespond(app, req, res) {
  const lang = req.params.domain.split('.')[0];
  // assertLanguage(lang); 
  return fetchDocAndRevision(app, req)
    .then((docAndRevision) => {
        const doc = docAndRevision[0];
        const revision = docAndRevision[1];
        const sections = sectionsInDoc(doc)
        sections.forEach(section => section.shortenShas())
        endResponseWithOutput(app, res, sections, req.params.domain, revision);
    });
}

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
