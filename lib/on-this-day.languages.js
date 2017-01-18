
'use strict';

const languages = {


    en: {
        monthNames : [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October','November', 'December'
        ],
        dayPage : {
            nameFormatter : (monthName, monthNumber) => `${monthName}_${monthNumber}`,
            headingIds: {
                births: 'Births',
                deaths: 'Deaths',
                events: 'Events',
                holidays: 'Holidays_and_observances'
            }
        },
        selectedPage : {
            nameFormatter : (monthName, monthNumber) =>
                `Wikipedia:Selected_anniversaries/${monthName}_${monthNumber}`,
            listElementSelector: 'body > ul li'
        },
        yearListElementRegEx : /^\s*(\d+)\s*(bce?)?\s*–\s(.+)/i
    },


    de: {
        monthNames : [
            'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
            'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
        ],
        dayPage : {
            nameFormatter : (monthName, monthNumber) => `${monthNumber}._${monthName}`,
            headingIds: {
                births: 'Geboren',
                deaths: 'Gestorben',
                events: 'Ereignisse',
                holidays: 'Feier-_und_Gedenktage'
            }
        },
        selectedPage: {
            nameFormatter : (monthName, monthNumber) =>
                `Wikipedia:Hauptseite/Jahrestage/${monthName}/${monthNumber}`,
            listElementSelector: 'body > ul li'
        },
        yearListElementRegEx : /^\s*(\d+)\s*(v\. Chr\.)?\s*(?::|–)\s(.+)/i
    },


    fr: {
        monthNames : [
            'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
            'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
        ],
        dayPage : {
            nameFormatter : (monthName, monthNumber) => `${monthNumber}_${monthName}`,
            headingIds: {
                births: 'Naissances',
                deaths: 'D.C3.A9c.C3.A8s',          // Décès
                events: '.C3.89v.C3.A9nements',     // Événements
                holidays: 'C.C3.A9l.C3.A9brations'  // Célébrations
            }
        },
        selectedPage: {
            nameFormatter : (monthName, monthNumber) =>
                `Wikipédia:Éphéméride/${monthNumber}_${monthName}`,
            listElementSelector: 'body > ul li'
        },
        yearListElementRegEx : /^\s*(\d+)\s*(av\. J\.-C\.)?\s*(?::|–)\s(.+)/i
    },


    sv: {
        monthNames : [
            'januari', 'februari', 'mars', 'april', 'maj', 'juni',
            'juli', 'augusti', 'september', 'oktober', 'november', 'december'
        ],
        dayPage : {
            nameFormatter : (monthName, monthNumber) => `${monthNumber}_${monthName}`,
            headingIds: {
                births: 'F.C3.B6dda',       // Födda
                deaths: 'Avlidna',
                events: 'H.C3.A4ndelser',   // Händelser
                holidays: 'Namnsdagar'
            }
        },
        selectedPage : {
            nameFormatter : (monthName, monthNumber) => `Mall:${monthNumber} ${monthName}`,
            listElementSelector: 'body > ul li'
        },
        yearListElementRegEx : /^\s*(\d+)\s*(f\.Kr\.)?\s*–\s(.+)/i
    }


};

module.exports = {
    languages
};
