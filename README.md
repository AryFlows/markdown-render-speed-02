# Markdown renderer

This entry reads the case array from `/input/cases.json`, renders each Markdown document with the local dependency-free `parse.js`, and writes the HTML strings in input order to `/output/html.json`. `parse(markdown)` is a stateless CommonMark and GFM-oriented parser implemented with JavaScript and Node built-ins only.
