const WMFReply = require('./WMFReply').WMFReply;
const WMFReplyData = require('./WMFReplyData').WMFReplyData;
const removal = require('./parser-removal');
const relationships = require('./parser-relationships');
const crypto = require('crypto');
// const debugging = require('./parser-debugging');

const createSha256 = (input) => {
  const shasum = crypto.createHash('sha256');
  shasum.update(input);
  return shasum.digest('hex');
};

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

    if (replyData.isListItem && !replyData.endsWithSig) {
      const alreadyInAccumulator = accumulator.findIndex(listInfo => {
          return listInfo.siblingIndices.find(thisIndex => thisIndex === index);
      }) !== -1;

      if (!alreadyInAccumulator) {
        const inclusiveSiblingIndices = relationships.getInclusiveSiblingIndices(index, array);
        if (inclusiveSiblingIndices.length > 1) {
          accumulator.push({
            depth: replyData.depth,
            minIndex: Math.min(...inclusiveSiblingIndices),
            maxIndex: Math.max(...inclusiveSiblingIndices),
            siblingIndices: inclusiveSiblingIndices
          });
        }
      }
    }

    const isAtEnd = index === array.length - 1;
    if (!isAtEnd) {
      return accumulator;
    }

    let indicesToRemove = [];

    accumulator
      .sort((a, b) => b.depth - a.depth) // Sort deepest to shallowest so deepest lists handled 1st.
      .forEach(thing => {
        const combineThese = array.reduce((accumulator2, replyData2, index2, array2) => {
          if (
            index2 >= thing.minIndex && index2 < thing.maxIndex && !indicesToRemove.includes(index2)
          ) {
            indicesToRemove.push(index2);
            accumulator2.unshift(replyData2);
          }
          return accumulator2;
        }, []);

        const combineIntoThis = array[thing.maxIndex];
        combineIntoThis.convertToListContainingSelfAndItems(combineThese, doc);

        // 'combineWith' (for items at this depth) so newly converted lists get added to parent LI
        // if needed
        const nextReplyData =
          (thing.maxIndex + 1 < array.length) ? array[thing.maxIndex + 1] : null;
        if (
          nextReplyData !== null &&
          nextReplyData.isListItem &&
          (combineIntoThis.depth === nextReplyData.depth + 1) &&
          combineIntoThis.shouldCombineWith(nextReplyData)
        ) {
          nextReplyData.combineWith(combineIntoThis, doc);
          indicesToRemove.push(thing.maxIndex);
        }
      });

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
          .forEach(p => elements.push(p));
      } else {
        elements.push(element);
      }

    });
  return elements;
};

class WMFTopic {
  constructor(sectionElement, doc, translations) {
    this.id = 0;
    this.replies = this.repliesFromSectionElement(sectionElement, doc, translations);
    const header = sectionElement.querySelector('h1,h2,h3,h4,h5,h6');
    this.depth = header ? parseInt(header.tagName.replace(/[^0-9]/g, ''), 10) : 1;
    this.text = removal.customTextContent(header, doc);
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

  repliesFromSectionElement (sectionElement, doc, translations) {
    const replyDataForElement = element => new WMFReplyData(element, doc, translations);
    const replyOrReplyDataIsNonBlank = replyOrReplyData => replyOrReplyData.text.length > 0;
    const replyForReplyData = replyData => new WMFReply(replyData, doc);
    const replies = soughtElementsInSection(sectionElement, doc)
      .reverse()
      .map(replyDataForElement)
      .filter(replyOrReplyDataIsNonBlank)
      // .reduce(debugging.debugCombiner(doc), [])
      .reduce(listItemCombiner(doc), [])
      .reduce(replyCombiner(doc), [])
      .reverse()
      .map(replyForReplyData)
      .filter(replyOrReplyDataIsNonBlank);

    this.normalizeReplyDepths(replies);
    return replies;
  }

  addShas() {
    this.replies.forEach((reply, index) => {
      reply.sha = createSha256(`${index}${reply.text}`);
    });

    this.shas.text = createSha256(`${this.id}${this.text}`);

    // `indicator` doesn't  include index to prevent any topic deletions from causing all messages
    // from topics beneath current topic from showing as unread
    this.shas.indicator =
      createSha256(`${this.text}${this.replies.map(reply => reply.sha).join('')}`);
  }

  isEmpty() {
    return this.text.length === 0 && this.replies.length === 0;
  }
}

module.exports = {
  WMFTopic,
  createSha256
};
