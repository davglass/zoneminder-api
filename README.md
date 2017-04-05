ZoneMinder API Client
=====================

This is a work in progress, I copy this into all of my home
projects so I'm sharing it here while I finish it off.

Needs `write` and tests..

usage
-----

```js
const ZoneMinder = require('zoneminder');
const zm = new ZoneMinder({
    user: 'foo',
    password: 'bar',
    host: 'https://domain.com/zm/'
});

zm.monitors(e, json);
zm.cameras(e, json);
```
