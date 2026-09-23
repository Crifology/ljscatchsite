const serverless = require('serverless-http');
const {createApp} = require('../../server.cjs');

// Netlify invokes this handler on demand; there is no app.listen().
exports.handler = serverless(createApp({staticFiles:false}));
