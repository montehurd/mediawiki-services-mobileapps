const relationships = require('./parser-relationships');
const removal = require('./parser-removal');

const endsWithUserOrUserTalkAnchor = (text, doc, translations) => {
  if (!translations) {
    return false;
  }
  const element = doc.createElement('div');
  element.innerHTML = text;
  const clone = removal.getCloneWithAnchorsOnly(element);
  const userOrUserTalkAnchors =
    clone.querySelectorAll(`a[href*="/${translations.user}:"], a[href*="/${translations.userTalk}:"]`);

  if (userOrUserTalkAnchors.length > 0) {
    const lastAnchor = userOrUserTalkAnchors[userOrUserTalkAnchors.length - 1];
    const endOfLastAnchorNormalizedPositionInParent =
        (clone.innerHTML.indexOf(lastAnchor.outerHTML)
        + lastAnchor.outerHTML.length) / clone.innerHTML.length;
    return endOfLastAnchorNormalizedPositionInParent === 1.0;
  }
  return false;
};

const depthIndicatingAncestorTags = ['DL', 'UL', 'OL'];
const getReplyDepth = (element) => {
  let familyTreeTags = relationships.getFamilyTree(element).map(e => e.tagName);
  let depth = familyTreeTags.filter(tag => depthIndicatingAncestorTags.includes(tag)).length;
  if (element.tagName === 'DT') {
    depth = depth - 1;
  }
  return depth;
};

const timestampRegex = /.*(?:2\d{3}|(?:[0-2]\d:\d\d))\s+\([A-Z]{2,5}\)\s*$/;

class WMFReplyData {
  constructor(element = null, doc, translations) {
    this.depth = getReplyDepth(element);
    this.isListItem = element.tagName === 'LI' || element.tagName === 'DD';
    this.isListItemOrdered = this.isListItem && element.parentElement.tagName === 'OL';
    this.childIndex = !element.parentElement ? -1
      : Array.from(element.parentElement.children).findIndex(obj => obj === element);

    const fragment = doc.createDocumentFragment();
    fragment.appendChild(element);

    this.text = removal.customTextContent(fragment, doc)
      .trim()
      .replace(/\n+/g, '<br>');

    this.endsWithSig =
      timestampRegex.test(this.text) || endsWithUserOrUserTalkAnchor(this.text, doc, translations);
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
      && this.endsWithSig === false
      && otherReplyData.endsWithSig === false;
  }

  shouldCombineWith(otherReplyData) {
    if (!otherReplyData) {
      return false;
    }
    return !otherReplyData.endsWithSig;
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
    newText.push('</li>');
    replyDataArray.forEach(replyData => {
      newText.push('<li>');
      newText.push(replyData.text);
      newText.push('</li>');
    });
    newText.push(this.isListItemOrdered ? '</ol>' : '</ul>');
    this.text = newText.join('');
  }
}

module.exports = {
  WMFReplyData,
  getReplyDepth
};
