const fs = require('fs');
const relationships = require('./parser-relationships');

const debugCombiner = doc => {
  return (accumulator, replyData, index, array) => {

    replyData.text = `${replyData.text} [${index}, ${replyData.childIndex}, ${replyData.endsWithSig}]`;

    const itemIndexToDebug = 39;
    if (index === itemIndexToDebug) {
      const addDebugString = (replyDataX, s) => {
        replyDataX.text = `${replyDataX.text} [${s}]`;
      };
      addDebugString(replyData, 'SOUGHT');

      const parent = array[relationships.getParentIndex(index, array)];
      if (parent) {
        addDebugString(parent, 'PARENT');
      }

      const childIndices = relationships.getChildrenIndices(index, array);
      childIndices.forEach(thisIndex => {
        addDebugString(array[thisIndex], 'CHILD');
      });

      const siblingIndices = relationships.getSiblingIndices(index, array);
      siblingIndices.forEach(thisIndex => {
        addDebugString(array[thisIndex], 'SIBLING');
      });

      const inclusiveSiblingIndices = relationships.getInclusiveSiblingIndices(index, array);
      inclusiveSiblingIndices.forEach(thisIndex => {
        addDebugString(array[thisIndex], 'INCLUSIVE SIBLING');
      });

      const descendentIndices = relationships.getDescendentIndices(index, array);
      descendentIndices.forEach(thisIndex => {
        addDebugString(array[thisIndex], 'DESCENDENT');
      });
    }

    accumulator.push(replyData);
    return accumulator;
  };
};

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

module.exports = {
  debugCombiner,
  writeOutputToExpectedOutputFixture
};
