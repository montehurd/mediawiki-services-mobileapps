const translationsJSON = require('./parser-translations.json');

const translationsForLang = lang => {
  const stringsForLang =
    translationsJSON.languages.find(thisLang => thisLang.code === lang).translations;
  if (stringsForLang) {
    const stringForNamespace =
      namespace => stringsForLang.find(t => t.namespace === namespace).name.replace(/ /g, '_');
    return {
      user: stringForNamespace(2),
      userTalk: stringForNamespace(3)
    };
  }
  return undefined;
};

module.exports = {
  translationsForLang
};
