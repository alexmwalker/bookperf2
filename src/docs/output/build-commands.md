# Build a Book from HTML chapters

## Use CAT in terminal to concatenate the HTML files

In the end, this works best. We have 'book-head.html' and 'book-foot.html' that will _bookend_ your CAT command.

The very end of the commend has your output file. Something like `..lastinputfile.html > ../output/book.html`

> cat book-head.html cover.html 0front-matter.html 1OptimizeMySQL.html 2BigFilesPHP.html 3WordPressOptimization.html 4OptimizeSQLQueries.html 5HTTP2.html 6ApachevsNginx.html 7Blackfire.html 8Varnish.html 9ServerLogs.html 10Siege.html book-foot.html > ../output/book.html

### This CSS SHOULD be in the 'book-head.html' file. Check it is.

```html
    <link rel="stylesheet" href="../assets/css/book.css">
```

### This JS should be in the 'book-foot.html'. Check is it.
```html
    <script src="../assets/js/book.js"></script>
    <script src="../assets/js/prism.js"></script>
```

### PRINCE conversion to PDF - sexy mutha..

    prince book.html -o covertest.pdf --javascript

### Rewriting an image URL from SitePoint to local (from that folder)

`gsed -i 's/\(!\[.*\](\).*\/\([^)]*\)\()\)/\1..\/images\/\2\3/g' test.md`

### Rewriting a whole f#$%in' folder full of MD images to local

`gsed -i 's/\(!\[.*\](\).*\/\([^)]*\)\()\)/\1..\/images\/\2\3/g' *.md`

![BOOM!](https://media.giphy.com/media/H6jVFw6KGRNmM/giphy.gif)