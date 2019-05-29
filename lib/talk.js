const mUtil = require('./mobile-util');
const parsoidApi = require('./parsoid-access');
const crypto = require('crypto');
const fs = require('fs');
const NodeType = require('./nodeType');

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
    this.sha = '';
  }
}

class WMFReplyData {
  constructor(element = null, doc) {
    this.depth = getReplyDepth(element);
    this.isListItem = element.tagName === 'LI' || element.tagName === 'DD';
    this.isListItemOrdered = this.isListItem && element.parentElement.tagName === 'OL';


this.childIndex = !element.parentElement ? -1 : Array.from(element.parentElement.children).findIndex(obj => obj === element);
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
if (replyData.isListItem){
      newText.push('<li>');
}else{
  newText.push(`<br>${'&#8195;'.repeat(replyData.depth)}`);      
}
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
    replyData.text = `${replyData.text} [${index}, ${replyData.childIndex}]`
    
    if (index === 59) { //2 6 56 
      const addDebugString = (replyDataX, s) => replyDataX.text = `${replyDataX.text} [${s}]`
      addDebugString(replyData, 'SOUGHT')
 
      const parent = array[array.talk_getParentIndex(index)]
      if (parent) {
        addDebugString(parent, 'PARENT')
      }
      
      const childIndices = array.talk_getChildrenIndices(index)
      childIndices.forEach(thisIndex => {
        addDebugString(array[thisIndex], 'CHILD')
      })
      
      const siblingIndices = array.talk_getSiblingIndices(index)
      siblingIndices.forEach(thisIndex => {
        addDebugString(array[thisIndex], 'SIBLING')
      })

      const inclusiveSiblingIndices = array.talk_getInclusiveSiblingIndices(index)
      inclusiveSiblingIndices.forEach(thisIndex => {
        addDebugString(array[thisIndex], 'INCLUSIVE SIBLING')
      })

      const descendentIndices = array.talk_getDescendentIndices(index)
      descendentIndices.forEach(thisIndex => {
        addDebugString(array[thisIndex], 'DESCENDENT')
      })
    }
    
    accumulator.push(replyData)
    return accumulator
  }
}


 

Array.prototype.talk_getParentIndex = function(index) {
   return this.findIndex((replyData, thisIndex) => {
     return !(thisIndex < index || replyData.depth >= this[index].depth);
   });  
}
Array.prototype.talk_getChildrenIndices = function(index) {
  return this.reduce((ids, replyData, thisIndex) => {
    const thisParentIndex = this.talk_getParentIndex(thisIndex)
    if (!thisParentIndex || thisParentIndex !== index) {
      return ids
    }
    ids.push(thisIndex)
    return ids
  }, [])
} 
Array.prototype.talk_getSiblingIndices = function(index) {
  return this.talk_getInclusiveSiblingIndices(index).filter(thisIndex => thisIndex != index)
}
Array.prototype.talk_getInclusiveSiblingIndices = function(index) {
  const parentIndex = this.talk_getParentIndex(index)
  if(!parentIndex){
    return []
  }
  
  const isContiguous = (thisIndex, offset, array) => array[this[thisIndex].childIndex + offset - this[index].childIndex] === index
 
  return this
    .talk_getChildrenIndices(parentIndex)
    .filter(isContiguous)
}
Array.prototype.talk_getDescendentIndices = function(index) {
  const descendentIndices = []
  const getDescendentIndicesInner = parentIndex => {
    this.talk_getChildrenIndices(parentIndex).forEach(thisIndex => {
      descendentIndices.push(thisIndex)
      getDescendentIndicesInner(thisIndex)
    })
  };
  getDescendentIndicesInner(index)
  return descendentIndices;
};



















// combiner using NEW prototype methods!
const listItemCombinerNEW2 = doc => {
  return (accumulator, replyData, index, array) => {
 
// accumulator is array of index arrays
    if (replyData.isListItem && !replyData.fragmentEndsWithSig) {
//BUG! prevents nested lists from working! needs to check including in actual indices not range!!!      
      const alreadyInAccumulator = accumulator.findIndex(listInfo => {
          return listInfo.siblingIndices.find(thisIndex => thisIndex === index)
      }) !== -1
//      console.log(`000${alreadyInAccumulator}`)
      if (!alreadyInAccumulator){
        const inclusiveSiblingIndices = array.talk_getInclusiveSiblingIndices(index)
        
        
// NEED to filter out before/after list items somehow...
// use 'childIndex' ?
      
      
        if (inclusiveSiblingIndices.length > 1) {
          // let min = Math.min(...inclusiveSiblingIndices)
          // const nonListItemDescendentIndices = array.talk_getDescendentIndices(index)
          //   .filter(index2 => !array[index2].isListItem)
// 
// //19 20 21 22
// //console.log(`\nindex:${index}, descendentIndices: ${descendentIndices}`)
// if (nonListItemDescendentIndices.length > 0){
//   min = Math.min(min, nonListItemDescendentIndices[0])
// }         
 
 





 
//FIX? identify DD items as list items so LI logic will "just work"  
// or add isDD flag? and check it in same places 'isListItem' is checked, but then
// when appending don't add <li> 





 
 
 
// if (replyData.depth === 3 || replyData.depth === 2) { 
          accumulator.push(
            {
              depth: replyData.depth,
              minIndex: Math.min(...inclusiveSiblingIndices),// min, //BUG!!! needs to include descendents!
              maxIndex: Math.max(...inclusiveSiblingIndices), 
              siblingIndices: inclusiveSiblingIndices
            }
          )
// } 
        } 
      }
    }
 


    // accumulator.push(index)

     
         
        //...  
        const isAtEnd = index === array.length - 1;
        if (!isAtEnd) {
          return accumulator;
        }

        
        let indicesToRemove = [];


        // HERE: at end!
// make note why we sorted from deepest to shallowest
accumulator.sort((a, b) => b.depth - a.depth).forEach(thing => {
  console.log(`\n\nthing.depth = ${thing.depth}`)
  console.log(`\tmaxIndex = ${thing.maxIndex}`)
  console.log(`\tminIndex = ${thing.minIndex}`)
  

// MERGE HERE! 
// - write merge method which takes range of indices, will return array of indices to be removed?
//   OR just use convertToListContainingSelfAndItems(replyDataArray, doc) ???
// - be sure to add all merged indices into `indicesToRemove`
 

const combineThese = array.reduce((accumulator2, replyData2, index2, array2) => {
  // indicesToRemove.push(index2)
    if (index2 >= thing.minIndex && index2 < thing.maxIndex && !indicesToRemove.includes(index2)){
console.log(`\tto be combined = ${index2}`)
indicesToRemove.push(index2)
      accumulator2.unshift(replyData2)
    }
    return accumulator2
}, [])

console.log(`\tcombine into = ${thing.maxIndex}`)

const combineIntoThis = array[thing.maxIndex]
combineIntoThis.convertToListContainingSelfAndItems(combineThese, doc) 
 
 

// HERE NEED to do 'combine' call (for items at this depth) so newly made lists will get added to parent LI   
const nextReplyData = (thing.maxIndex + 1 < array.length) ? array[thing.maxIndex + 1] : null;
if (nextReplyData.isListItem && (combineIntoThis.depth === nextReplyData.depth + 1) && combineIntoThis.shouldCombineWith(nextReplyData)) {
  nextReplyData.combineWith(combineIntoThis, doc);
  indicesToRemove.push(thing.maxIndex)
}
    

   
   
})

console.log(`\tindicesToRemove = ${indicesToRemove}`)

        return array.filter((_, index3) => !indicesToRemove.includes(index3));
  }
} 










 






/*




const listItemCombinerNEW1 = doc => {
  

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



    // if (replyData.isListItemSiblingWith(nextReplyData)) {
    //   accumulator[accumulator.length - 1].push(index);
    // } else if (replyData.isListItemFirstSibling(nextReplyData, prevReplyData)) {
    //   accumulator[accumulator.length - 1].push(index);
    //   accumulator.push([]);
    // }

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



 */





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
      text: '',
      indicator: ''
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
      // .reduce(listItemCombinerNEW1(doc), [])
      // .reduce(listItemCombinerOLD(doc), [])
      .reduce(listItemCombinerNEW2(doc), [])
      // .reduce(replyCombiner(doc), []) 
      .reverse()
      .map(replyForReplyData)
      .filter(replyOrReplyDataIsNonBlank);

    this.normalizeReplyDepths(replies);
    return replies;
  }

  addShas() {
    this.replies.forEach((reply, index) => {
      reply.sha = createSha1(`${index}${reply.text}`);
    });

    this.shas.text = shortenSha(createSha1(`${this.id}${this.text}`));

    // `indicator` doesn't  include index to prevent any topic deletions from causing all messages
    // from topics beneath current topic from showing as unread
    this.shas.indicator = shortenSha(
      createSha1(`${this.text}${this.replies.map(reply => reply.sha).join('')}`)
    );

    // Can now shorten these once they've been used to calculate `indicator`
    this.replies.forEach((reply, index) => {
      reply.sha = shortenSha(reply.sha);
    });
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
        const sections = sectionsInDoc(doc);
        sections.forEach((section, i) => {
          section.id = i;
          section.addShas();
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
