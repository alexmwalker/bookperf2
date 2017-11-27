---
template: front-matter.pug
title: Front-end Performance
author: ''
productmanager: Simon Mackie
englisheditor: Ralph Mason
technicaleditor: Darin Dimitrov
coverdesigner: Alex Walker
isbnprint: '978-0-9943469-6-4 (print)'
isbnweb: '978-0-9943470-2-2 (ebook)' 
---
   
# Preface
<!-->
React is a remarkable JavaScript library that's taken the development community by storm. In a nutshell, it's made it easier for developers to build interactive user interfaces for web, mobile and desktop platforms. One of its best features is its freedom from the problematic bugs inherent in MVC frameworks, where inconsistent views is a recurring problem for big projects. Today, thousands of companies worldwide are using React, including big names such as Netflix and AirBnB. React has become immensely popular, such that a number of apps have been ported to React --- including WhatsApp, Instagram and Dropbox. 

This book is a collection of articles, selected from SitePoint's [React Hub](https://www.sitepoint.com/javascript/react/), that will guide you through your first week with the amazingly flexible library. -->

## Who Should Read This Book?

This book is for all Frontend developers that want to build sites and apps that run faster. You’ll need to be familiar with HTML and CSS and have a reasonable level of understanding of JavaScript in order to follow the discussion. 

## Conventions Used

You’ll notice that we’ve used certain typographic and layout styles throughout this book to signify different types of information. Look out for the following items.

### Code Samples

Code in this book is displayed using a fixed-width font, like so:  

```html
<h1>A Perfect Summer's Day</h1>
<p>It was a lovely day for a walk in the park.
The birds were singing and the kids were all back at school.</p>
```

Where existing code is required for context, rather than repeat all of it, ⋮ will be displayed:

```js
function animate() {
  ⋮
new_variable = "Hello";
}
```

Some lines of code should be entered on one line, but we’ve had to wrap them because of page constraints. An ➥ indicates a line break that exists for formatting purposes only, and should be ignored:

```js
URL.open("http://www.sitepoint.com/responsive-web-
➥design-real-user-testing/?responsive1");
  ```