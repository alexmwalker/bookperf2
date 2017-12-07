/* to run the javascript use the --javascript option when running Prince on a page with a regular JavaScript tag in it. Prince 10 has pretty good support for JavaScript however figuring out what isn't available is a bit trial and error! */
if (typeof (spBook) == 'undefined') {
  var spBook = {};
  spBook.Setup = {};
};


/* Settings:
fixedLine: integer - the length of code lines before they get the inserted break character
breakInsert: string - our break insert character and line break
tocSelectors: string - the selectors used for the TOC. Comma separated as in CSS.
tocHasPreface: boolean - if we have a preface making the assumption that the subheads before the first l1 heading are in the preface chapter.
*/
spBook.Settings = function () {

  return {
    fixedLine: 60,
    breakInsert: "<br>➥ ",
    tocSelectors: '.preface h1, .preface h2, .chapter h1, .chapter h2',
    tocHasPreface: true,
  }

}();

spBook.Setup.Global = function () {

  var forEach = function (array, callback, scope) {
    for (var i = 0; i < array.length; i++) {
      callback.call(scope, i, array[i]);
    }
  };

  var init = function () {
    countDuplicate();
    initToc();
    initLineBreaks();
    buildStructure();
  };

  /* build the table of contents. All headings in the document need an ID, this is how links are created so I skip any heading that has no ID. We also only select headings inside a div with a class of preface, or a div with a class of chapter. Add any other page types that should be selected in the list of selectors.
   */
  var initToc = function () {

    var selectors = spBook.Settings.tocSelectors;
    var hasPreface = spBook.Settings.tocHasPreface;
    var count = 0;

    var insertToc = document.getElementById("insert-toc");

    var headingList = document.querySelectorAll(selectors);

    forEach(headingList, function (index, value) {

      /* only add an item if we have an ID otherwise we can't link to it */
      if (value.getAttribute("id")) {
        var level = value.tagName;
        if (level == 'H1') {
          count++;
        }

        var li = document.createElement("li");
        var link = document.createElement("a");


        var children = value.childNodes;
        for (i = 0; i < children.length; i++) {
          var newNode = children[i].cloneNode(true);
          link.appendChild(newNode);
        };


        var url = '#' + value.getAttribute("id");
        link.setAttribute("href", url);
        li.appendChild(link);
        if (count == 1 && hasPreface) {
          li.className = 'toc-preface level' + level;
        } else if (value.getAttribute("class") == 'appendix-title') {
          li.className = 'toc-appendix level' + level;
        } else {
          li.className = 'level' + level;
        }
        insertToc.appendChild(li);
      }



    });



  };


  /* internal function to do nasty character splitting if we can't split on space */
  var splitOnChars = function (longStr) {

    var arr = longStr.split('');
    var count = 0;
    var str = '';
    for (var n = 0; n < arr.length; n++) {
      str += arr[n];
      if (count == spBook.Settings.fixedLine) {
        str += spBook.Settings.breakInsert;
        count = 0;
      }
      count++;
    }
    return str;
  }

  /* add the line-breaking character to long lines in code. */
  var initLineBreaks = function () {


    // find all code blocks
    var codeList = document.querySelectorAll("code pre");
    forEach(codeList, function (index, value) {
      var thisBlock = value.innerHTML;
      var thisBlockLines = thisBlock.split("\n");

      var codeOut = '';
      for (var i = 0; i < thisBlockLines.length; i++) {
        trimLine = thisBlockLines[i].trim();
        // is the line longer than the fixedLine value?
        if (trimLine.length > spBook.Settings.fixedLine) {

          // is there a space in the line or is this just a jumbo unbroken line?
          var spaceChar = trimLine.lastIndexOf(' ');
          if (spaceChar == -1) {
            // do nasty character split
            codeOut += splitOnChars(trimLine);
          } else {
            // we have the promise of a space, let us see if we can do something nicer.
            //split on space
            var words = trimLine.split(' ');
            // loop through test whether adding item would make string longer than fixedLine.length
            var str = '';

            for (var n = 0; n < words.length; n++) {
              if (str.length + words[n].length > spBook.Settings.fixedLine) {
                // split after str, don't add item, item becomes new str
                str += spBook.Settings.breakInsert;
                codeOut += str;
                str = words[n];
              } else {
                // add this item to str
                str += ' ' + words[n];
              }

            }
            // add any remaining characters to str.
            codeOut += str + "\n";
          }


        } else {
          // just pass this back out unaltered.
          codeOut += thisBlockLines[i] + "\n";
        }
      }
      value.innerHTML = codeOut;
    });

  }

/* This function finds plain ol' IMG tags and rebuilds them in a nice figure/caption structure that is better for nice layouts.
eg.
<img src="image.jpg" alt="This will be the caption">

becomes..

<figure>
  <img src="image.jpg" alt="This will be the caption">
  <figcation>This will be the caption</figcaption>
</figure>

Note that IMGs with alt attributes beginning with a hyphen '-' will be ignored.

eg. <img src="image.jpg" alt="- This will be the caption">
*/

function buildStructure() {
  var listImages = document.querySelectorAll(".chapter img");

  for (var i = listImages.length - 1; i >= 0; i--) {
    var original = listImages[i];

    var imgsrc = listImages[i].src;
    var imgalt = listImages[i].alt;
    console.log(imgalt.slice(0,1)); 
    if(imgalt.slice(0,1) != "-"){

      var figureSet = document.createElement('figure');
      var figImage = document.createElement('img');
      figImage.setAttribute("src", imgsrc);
      figImage.setAttribute("alt", imgalt);

      var figCap = document.createElement('figcaption');
      figCap.innerHTML = imgalt;  

      figureSet.appendChild(figImage);
      figureSet.appendChild(figCap);

      original.parentNode.replaceChild(figureSet, listImages[i]);
    }
  }
}

/* === Looks for Duplicate 'Conclusions' and 'Resources' headings ans 'unique-izes' their IDs ===  */
/* === This in important when generating the TOC ===  */


function countDuplicate() {
  var listDupes = document.querySelectorAll("#conclusion, #resources");
  for (var i = listDupes.length - 1; i >= 0; i--) {
     var rewrite = (listDupes[i].id + "-" + i); 
     console.log(rewrite); 
     listDupes[i].setAttribute("id", rewrite);
     console.log(listDupes[i]); 
  }

}

//var list = document.querySelectorAll("form, p, legend");



  return {
    init: init
  };

}();

document.addEventListener("DOMContentLoaded", function () {
  spBook.Setup.Global.init();
}, false);