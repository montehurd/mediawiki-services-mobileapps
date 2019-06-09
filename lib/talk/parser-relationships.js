const getParentIndex = (index, array) => {
   return array.findIndex((replyData, thisIndex) => {
     return !(thisIndex < index || replyData.depth >= array[index].depth);
   });
};

const getChildrenIndices = (index, array) => {
  return array.reduce((ids, replyData, thisIndex) => {
    const thisParentIndex = getParentIndex(thisIndex, array);
    if (!thisParentIndex || thisParentIndex !== index) {
      return ids;
    }
    ids.push(thisIndex);
    return ids;
  }, []);
};

const getInclusiveSiblingIndices = (index, array) => {
  const parentIndex = getParentIndex(index, array);
  if (!parentIndex) {
    return [];
  }

  const isContiguous = (thisIndex, offset, a) =>
    a[array[thisIndex].childIndex + offset - array[index].childIndex] === index;

  return getChildrenIndices(parentIndex, array).filter(isContiguous);
};

const getSiblingIndices = (index, array) => {
  return getInclusiveSiblingIndices(index, array).filter(thisIndex => thisIndex !== index);
};

const getDescendentIndices = (index, array) => {
  const descendentIndices = [];
  const getDescendentIndicesInner = parentIndex => {
    getChildrenIndices(parentIndex, array).forEach(thisIndex => {
      descendentIndices.push(thisIndex);
      getDescendentIndicesInner(thisIndex);
    });
  };
  getDescendentIndicesInner(index);
  return descendentIndices;
};

const getFamilyTree = (element) => {
  let elem = element;
  let tree = [element];
  while ((elem = elem.parentElement) !== null) {
    tree.push(elem);
  }
  return tree;
};

module.exports = {
  getParentIndex,
  getChildrenIndices,
  getInclusiveSiblingIndices,
  getSiblingIndices,
  getDescendentIndices,
  getFamilyTree
};
