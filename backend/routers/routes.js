const express = require('express');
const users = require('./users');
const auth = require('./auth');
const collections = require('./collections');
const shared = require('./shared');
const search = require('./search');

const router = express.Router();

router.use('/users', users);
router.use('/auth', auth);
router.use('/collections', collections);
router.use('/shared', shared);
router.use('/search', search);

module.exports = router;
