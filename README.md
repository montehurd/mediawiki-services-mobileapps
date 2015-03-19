# service-mobileapp-node [![Build Status](https://travis-ci.org/berndsi/service-mobileapp-node.svg?branch=master)](https://travis-ci.org/berndsi/service-mobileapp-node)

MediaWiki Services in Node.js for Mobile Apps.
This service is a facade the mobile apps can use to improve runtime performance by
* bundling multiple requests,
* performing DOM manipulations once on the server instead of on the clients,
* avoiding downloading of DOM elements that are not displayed in the apps and therefore not needed,
* taking advantage of caching via RESTBase, and
* take advantage of streaming by being able to use WebView.loadUrl() instead of piping every page section by section over the JS bridge.

Furthermore this can also speed up development by
* combining the DOM manipulation code for both apps into a single service,
* simplifying DOM manipulation code by moving it to JavaScript,
* flattening the JSON structure, and
* simplifies code by using WebView.loadUrl() instead of piping every page section by section over the JS bridge.

More improvements and more endpoints are possible. We could also consider using streaming on the service side. But I'll leave that as a later exercise.

Note: This is currently in early development and things are going to change without notice.

## Getting Started

### Installation

First, clone the repository

```
git clone https://github.com/wikimedia/service-mobileapp-node.git
```

Install the dependencies

```
cd service-mobileapp-node
npm install
```

You are now ready to get to work!

* Inspect/modify/configure `app.js`
* Add routes by placing files in `routes/` (look at the files there for examples)

You can also read [the documentation](doc/).

### Running the service

To start the server hosting the REST API, simply run (inside the repo's directory)

```
npm start
```

This starts an HTTP server listening on `localhost:6927`. There are a few
routes you may query (with a browser, or `curl` and friends):

The main route you may query (with a browser, or `curl` and friends):
* `http://localhost:6927/{domain}/v1/mobile/app/page/html/{title}`

Example:
* `http://localhost:6927/en.wikipedia.org/v1/mobile/app/page/html/Cat`

There is also a route for the mobile lite app (but needs a lot more TLC):
* `http://localhost:6927/{domain}/v1/mobile/app/page/lite/{title}`

### Tests

There is also a small set of executable tests. To fire them up, simply run:

```
npm test
```

If you haven't changed anything in the code (and you have a working Internet
connection), you should see all the tests passing. As testing most of the code
is an important aspect of service development, there is also a bundled tool
reporting the percentage of code covered. Start it with:

```
npm run-script coverage
```

### Troubleshooting

In a lot of cases when there is an issue with node it helps to recreate the
`node_modules` directory:

```
rm -r node_modules
npm install
```

This is highly recommended whenever dependencies change.

Go apps!

### Thanks

Big thank you to our services team for providing an awesome template for this and for supporting us along the way.

