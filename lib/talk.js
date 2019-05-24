const mUtil = require('./mobile-util');
const parsoidApi = require('./parsoid-access');
const crypto = require('crypto');
const fs = require('fs');
const NodeType = require('./nodeType');


/*

SHA CHANGES
WMFReply 
- sha: sha(`${this.index}${this.text}`)


WMFTopic
  shas:
  - text: sha(`${this.index}${this.text}`)
  - indicator: sha(`${this.text}${this.replies.map(reply => reply.sha).join('')}`)

indicator doesn't  include index to prevent any topic deletions from causing all messages from topics beneath current topic from showing as unread

 */




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
const shortenSha = sha => sha.substring(0, 7);

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

const getFamilyTree = (element) => {
  let elem = element;
  let tree = [element];
  while ((elem = elem.parentElement) !== null) {
    tree.push(elem);
  }
  return tree;
};

const depthIndicatingAncestorTags = ['DL', 'UL', 'OL'];
const getReplyDepth = (element) => {
  let familyTreeTags = getFamilyTree(element).map(e => e.tagName);
  let depth = familyTreeTags.filter(tag => depthIndicatingAncestorTags.includes(tag)).length;
  if (element.tagName === 'DT') {
    depth = depth - 1;
  }
  return depth;
};

const attributesToRemove = ['style','id','class','rel','about','data-mw','typeof'];
const pruneUnwantedAttributes =
  (element) => attributesToRemove.forEach(attribute => element.removeAttribute(attribute));

const escapeHTML = text => text
  .replace(/&/g,'&amp;')
  .replace(/</g,'&lt;')
  .replace(/>/g,'&gt;');

const textContentTagsToPreserve = ['A', 'B', 'I'];
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

const textFromTextNode = textNode => escapeHTML(textNode.nodeValue);

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
    const isAlreadyWrapped = getFamilyTree(elementNode)
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

const textFromPreElementNode =
  (elementNode, doc) => customTextContent(elementNode, doc).replace(/\n/g,'<br>');

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

      if (node.tagName === 'PRE') {
        return textFromPreElementNode(node, doc);
      }
      return customTextContent(node, doc);
    }
    default:
  }
  return '';
};

const signatureRegex = /.*\s+\d{4}\s+\(.*\)\s*$/;

class WMFReply {
  constructor(replyData, doc) {
    this.text = replyData.text;
    this.depth = replyData.depth;
    this.sha = createSha1(this.text);
  }
  shortenSha() {
    this.sha = shortenSha(this.sha);
  }
}

class WMFReplyData {
  constructor(element = null, doc) {
    this.depth = getReplyDepth(element);
    this.isList = false;
    this.isListItem = element.tagName === 'LI';
    this.isListItemOrdered = this.isListItem && element.parentElement.tagName === 'OL';


this.childIndex = !element.parentElement ? -1 : Array.from(element.parentElement.children).findIndex(obj => obj === element);
// this.hasSiblings = element.parentElement && element.parentElement.children && element.parentElement.children.length > 1;


this.isFirstListItem = this.isListItem && this.childIndex === 0;
 


    const fragment = doc.createDocumentFragment();
    fragment.appendChild(element);
    this.fragment = fragment;
    this.fragmentEndsWithSig = this.endsWithSig();

    this.text = customTextContent(this.fragment, doc).trim();
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
    this.isList = true;
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














const listItemCombinerOLD = doc => {
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

 






















const debugCombiner = doc => {
  return (accumulator, replyData, index, array) => {
    replyData.text = `${replyData.text} [${index}]`
    
    
    if (index === 49) {
      // replyData.text = `${replyData.text} ☎️`

      const addDebugString = (replyDataX, s) => replyDataX.text = `${replyDataX.text} [${s}]`
      addDebugString(replyData, 'SOUGHT')


      const parent = array[getParentIndex(index, array)]
      if (parent) {
        addDebugString(parent, 'PARENT')
      }
      
      const childIndices = getChildrenIndices(index, array)
      childIndices.forEach(thisIndex => {
        addDebugString(array[thisIndex], 'CHILD')
      })
      
      const siblingIndices = getSiblingIndices(index, array)
      siblingIndices.forEach(thisIndex => {
        addDebugString(array[thisIndex], 'SIBLING')
      })

      const inclusiveSiblingIndices = getInclusiveSiblingIndices(index, array)
      inclusiveSiblingIndices.forEach(thisIndex => {
        addDebugString(array[thisIndex], 'INCLUSIVE SIBLING')
      })



 

      const children = array.filter((thisReplyData, thisIndex) => {
        if (thisIndex >= index) {
          return false
        }
        thisReplyData.text = `${thisReplyData.text} 📺`
        
        return true
      })
      
    }

    
    
    
    accumulator.push(replyData)
    return accumulator
  }
} 




const getParentIndex = (replyDataIndex, reversedReplyDataArray) => {
  return reversedReplyDataArray.findIndex((thisReplyData, thisIndex) => {
    if (thisIndex < replyDataIndex) {
      return false
    }
    if (thisReplyData.depth >= reversedReplyDataArray[replyDataIndex].depth) {
      return false
    } 
    return true
  })  
}

const getChildrenIndices = (replyDataIndex, reversedReplyDataArray) => {
  return reversedReplyDataArray.reduce((ids, replyData, index) => {
    const thisParentIndex = getParentIndex(index, reversedReplyDataArray)
    if (!thisParentIndex) {
      return ids
    }
    if (thisParentIndex === replyDataIndex) {
      ids.push(index)
    }
    return ids
  }, [])
}

const getSiblingIndices = (replyDataIndex, reversedReplyDataArray) => {
  return getInclusiveSiblingIndices(replyDataIndex, reversedReplyDataArray).filter(index => index != replyDataIndex)
}

const getInclusiveSiblingIndices = (replyDataIndex, reversedReplyDataArray) => {
  const parentIndex = getParentIndex(replyDataIndex, reversedReplyDataArray)
  if(!parentIndex){
    return []
  }
  return getChildrenIndices(parentIndex, reversedReplyDataArray)
}


const getDescendentIndices = (replyDataIndex, reversedReplyDataArray) => {

}



/*
getParent
 - get next in array with depth one less than current item depth
getChildren
 - get items after current item that have depth one greater (until encountering equal depth) 
getSiblingsIncludingSelf
 - calls getParent, then on the parent calls getChildren
*/

//NEED TO also combine with items after firstSibling until item encountered which 
// is either: at lesser depth, is a list item or list
const testCombiner = doc => {
  return (accumulator, replyData, index, array) => {

    
    
    
    
    
    accumulator.push(replyData)
    return accumulator
  }
} 









const listItemCombiner = doc => {
  

// let lastIndex = 0
  
  return (accumulator, replyData, index, array) => {
    
    
    
    
    // Accumulate an array of arrays of indices of list items to be combined.
    // if (accumulator.length === 0) {
    //   accumulator.push([]);
    // }

    // const prevReplyData = (index > 0) ? array[index - 1] : null;
    // const nextReplyData = (index + 1 < array.length) ? array[index + 1] : null;


if (replyData.isListItem) {
//  accumulator[accumulator.length - 1].push({
  accumulator.push({
    index, 
    depth: replyData.depth,
    first: replyData.isFirstListItem//,
    //hasSiblings: false
    // hasSiblings: replyData.hasSiblings 
  });
}



// lastIndex = index


/*
    if (replyData.isListItemSiblingWith(nextReplyData)) {
      accumulator[accumulator.length - 1].push(index);
    } else if (replyData.isListItemFirstSibling(nextReplyData, prevReplyData)) {
      accumulator[accumulator.length - 1].push(index);
      accumulator.push([]);
    }
*/
    const isAtEnd = index === array.length - 1;
    if (!isAtEnd) {
      return accumulator;
    }
    
    
  
//    return array
    
    
  
let indicesToRemove2 = [];

    
console.log(accumulator)
const deepest = accumulator.reduce((deepest, obj, i) => Math.max(obj.depth, deepest), 0)
console.log(`deepest = ${deepest}`) 

let combineThese = []
for (depth = deepest; depth > 0; depth--) {
  // if(depth !== 2) {
  //   continue
  // }
  let atThisDepth = accumulator.filter(obj => obj.depth === depth).reduce((allAtDepth, obj, k) => {
      // console.log(`obj.depth ${obj.depth} index ${obj.index}`)
      allAtDepth[allAtDepth.length - 1].push(obj.index)
      if(obj.first) {
        allAtDepth.push([])
      }
      return allAtDepth
  }, [[]])
  //console.log(`at depth ${i} = ${atThisDepth.join('X')}`)
  // atThisDepth.forEach(item => console.log(`at depth ${depth}: ${item}`))
  combineThese.push(atThisDepth)  
//return 
}
//console.log(`combineThese = ${combineThese}`) 
combineThese.forEach(these => {
  console.log('\n\n') 
  these.forEach(arrayOfIndicesToCombine => console.log(`arrayOfIndicesToCombine ${arrayOfIndicesToCombine}`))
  // console.log(`these ${these}`) 

  these.forEach((arrayOfIndicesToCombine, ii) => { 
    // if (ii > 0){
      // return 
    // }
    if (arrayOfIndicesToCombine.length < 2){
      return
    }
    
    
    // 
     
    
    
    
    
    
    
    // console.log(`ii ${ii}`) 
    //console.log(`arrayOfIndicesToCombine ${arrayOfIndicesToCombine}`) 
//    console.log(`arrayOfIndicesToCombine.length ${arrayOfIndicesToCombine.length}`) 
    // indicesToRemove2 = indicesToRemove2.concat(arrayOfIndicesToCombine);

    // indicesToRemove2.push(arrayOfIndicesToCombine[0])
    // for (r = arrayOfIndicesToCombine[0]; r < arrayOfIndicesToCombine[arrayOfIndicesToCombine.length - 1]; r++) { 
    //   console.log(`r ${r}`) 
    //   indicesToRemove2.push(r) 
    // } 
      
    const indexOfFirstSibling = arrayOfIndicesToCombine.pop()
    indicesToRemove2 = indicesToRemove2.concat(arrayOfIndicesToCombine);

    //console.log(`indicesToRemove2 ${indicesToRemove2}`) 

    const firstSibling = array[indexOfFirstSibling];
    if (firstSibling.depth > 1) {
      indicesToRemove2.push(indexOfFirstSibling)
    }
    const siblingsToBeCombined = arrayOfIndicesToCombine.map(id => array[id]).reverse();
    // console.log(`\tindexOfFirstSibling ${indexOfFirstSibling}`) 
    // console.log(`\tarrayOfIndicesToCombine ${arrayOfIndicesToCombine}`) 
    // if (siblingsToBeCombined.length === 0){
    //     return
    // }



//siblingsToBeCombined.forEach(a => console.log(`\ta ${a.text}`))



    firstSibling.convertToListContainingSelfAndItems(siblingsToBeCombined, doc);
    
 
 
    const indexOfPreviousSibling = indexOfFirstSibling + 1
    if (indexOfPreviousSibling > -1) {
      const previousSibling = array[indexOfPreviousSibling];
      if (previousSibling && previousSibling.isListItem && previousSibling.depth < firstSibling.depth) {
      // if (previousSibling.isListItem) {
        previousSibling.combineWith(firstSibling, doc) 
        
        
// 2: 1,0
// 6: 5,4,3       
console.log(`\tA:${previousSibling.text}`)
console.log(`\tZ:${firstSibling.text}`)

//NEED TO also combine with items after firstSibling until item encountered which 
// is either: at lesser depth, is a list item or list
        
      // }
      }
    }
//indicesToRemove2 1,6,15,20,0,3,5,8,11,14,17,22,23,25,27,30
//                 1,2,6,7,15,16,20,21,0,3,4,5,8,9,11,12,14,17,18,22,23,24,25,26,27,28,30,31
 

  }) 
 //return 
})

 
// array[2].convertToListContainingSelfAndItems([array[1]], doc);
// array[3].combineWith(array[2], doc)
// array[4].convertToListContainingSelfAndItems([array[3], array[0]], doc);
// 
// 
// array[7].convertToListContainingSelfAndItems([array[6]], doc);
// array[8].combineWith(array[7], doc)
// array[9].convertToListContainingSelfAndItems([array[8], array[5]], doc);

  
//return array.filter((_, index) => ![0, 1, 2, 3, 5, 6, 7, 8].includes(index));
 
// console.log(`indicesToRemove2 sorted ${indicesToRemove2.sort((a, b)=> a - b)}`) 


return array.filter((_, index) => !indicesToRemove2.includes(index)); 


// return array 
    // When we get here the accumulator will contain an array of arrays of indices of list items to
    // be combined. Do the combinations, then filter out the items which were combined.
    // let indicesToRemove = [];
    // accumulator.forEach(listItemIndices => {
    //   if (listItemIndices.length > 0) {
    //     const indexOfFirstSibling = listItemIndices.pop();
    //     indicesToRemove = indicesToRemove.concat(listItemIndices);
    //     const firstSibling = array[indexOfFirstSibling];
    //     const siblingsToBeCombined = listItemIndices.map(id => array[id]).reverse();
    //     firstSibling.convertToListContainingSelfAndItems(siblingsToBeCombined, doc);
    //   }
    // });
    // Remove the sibling items which were merged into the firstSibling.
    // return array.filter((_, index) => !indicesToRemove.includes(index));
  };
};



 





/*
const combineLists = doc => {
  return (accumulator, replyData, index, array) => {

if(replyData.isList){
  console.log(`index = ${index}`)
}
return array; 

  };
};
*/

















 
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
    this.text = customTextContent(header, doc);
    this.shas = {
      text: createSha1(this.text),
      replies: createSha1(`${this.replies.map(reply => reply.sha).join('')}`)
    };
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
 

  

  /* 
  need to combine lists by adding list to last list item of previous list where appropriate
  when is appropriate?
  
  rename `listItemCombiner` to `combineListItemsIntoLists`? (and `replyCombiner` to `combineReplies`)
  
  add `combineLists` after ^
  
  */
 
 // TODO: ADD CLOSING LI TAGS!!!!

  repliesFromSectionElement (sectionElement, doc) {
    const replyDataForElement = element => new WMFReplyData(element, doc);
    const replyOrReplyDataIsNonBlank = replyOrReplyData => replyOrReplyData.text.length > 0;
    const replyForReplyData = replyData => new WMFReply(replyData, doc);
    const replies = soughtElementsInSection(sectionElement, doc)
      .reverse()
      .map(replyDataForElement)
      .filter(replyOrReplyDataIsNonBlank)
.reduce(debugCombiner(doc), [])
.reduce(testCombiner(doc), [])
      // .reduce(listItemCombiner(doc), [])
      // .reduce(replyCombiner(doc), []) 
      .reverse()
      .map(replyForReplyData)
      .filter(replyOrReplyDataIsNonBlank);

    this.normalizeReplyDepths(replies);
    return replies;
  }

  shortenShas() {
    this.shas.text = shortenSha(this.shas.text);
    this.shas.replies = shortenSha(this.shas.replies);
    this.replies.forEach(reply => reply.shortenSha());
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
  // .filter((e, i) => [1, 3, 13, 112].includes(i)) 
  .map(sectionElement => new WMFTopic(sectionElement, doc));

// Quick way to write output we can easily use to do `deepEqual` test to see if changes affect
// expected output for complicated pages.
const writeOutputToExpectedOutputFixture = (output, lang, title, revision) => {
  const json = JSON.stringify(output, null, 2);
  const cleanTitle = title.replace(/\W/g, '_');
  const fileName = `./test/features/talk/expected-output/${lang}.${cleanTitle}.${revision}.json`;
  fs.writeFile(fileName, json, err => {
    if (err) {
      throw err;
    }
  });
};

const fetchAndRespond = (app, req, res) => {
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
        //writeOutputToExpectedOutputFixture(output, lang, req.params.title, revision);
        endResponseWithOutput(app, res, output, req.params.domain, revision);
    });
};

module.exports = {
  fetchAndRespond,
  createSha1,
  shortenSha,
  getFamilyTree,
  getReplyDepth,
  escapeHTML,
  pruneUnwantedAttributes,
  textFromTextNode,
  textFromPreservedElementNode,
  textFromPreElementNode
};
