/**
 * @module jolt
 * @xsubmodule StaticServer
 */
/*global require, exports, __dirname, sync */

"use strict";

// TODO options like cache headers, etc.

var File = require('File'),
    GZIP = require('http').GZIP,
    Semaphore = require('Threads').Semaphore,
    mimeTypes = require('mimetypes').mimeTypes;

function getStatic(me, path) {
    var cache = me.cache,
        file;

    me.semaphore.lock();
    try {
        var staticInfo = cache[path];
        if (!staticInfo) {
            file = new File(path);
            if (!file.exists()) {
                return 404;
            }
            if (file.isDirectory()) {
                return 403;
            }
            var dot = path.lastIndexOf('.'),
                extension = (dot === -1 ? '' : path.substr(dot + 1));

            cache[path] = staticInfo = {
                file         : file,
                mimeType     : mimeTypes[extension] || 'text/plain',
                lastModified : 0
            };
        }
        else {
            file = staticInfo.file;
        }
        var lastModified = file.lastModified();
        if (!lastModified) {
            return 404;
        }
        if (lastModified > staticInfo.lastModified) {
            staticInfo.fileData = file.toByteArray();
            staticInfo.lastModified = lastModified;
            delete staticInfo.gzipped;
        }
        return staticInfo;
    }
    catch (e) {
        console.dir(e);
    }
    finally {
        me.semaphore.unlock();
    }
}

function serveStatic(me, req, res) {
    var staticInfo = getStatic(me, me.path + '/' + req.args.join('/'));
    if (typeof staticInfo === 'number') {
        return staticInfo;
    }
    if (me.options.gzip && req.gzip) {
        me.semaphore.lock();
        try {
            staticInfo.gzipped = staticInfo.gzipped || GZIP.compress(staticInfo.fileData);
        }
        finally {
            me.semaphore.unlock();
        }
        res.headers['Content-Encoding'] = 'gzip';
    }
    res.sendBytes(req.gzip ? staticInfo.gzipped : staticInfo.fileData, staticInfo.mimeType, staticInfo.lastModified, req.headers['if-modified-since']);
    return 200;

}

/**
 * Serve static files from a specified directory path
 *
 * The options hash may contain:
 *
 * - gzip = false to disable gzip compression/encoding
 *
 * @constructor
 * @param {string} path directory to serve static files from
 * @param {object} options see above
 * @returns {Object} config suitable for use with Application.verb()
 */
function StaticServer(path, options) {
    options = options || {
        gzip: true
    };
    if (typeof options.gzip === 'undefined') {
        options.gzip = true;
    }
    return {
        path      : path,
        semaphore : new Semaphore(),
        options   : options,
        cache     : {},
        handler   : function(me, req, res) {
            return serveStatic(me, req, res);
        }
    };
}

decaf.extend(StaticServer.prototype, {

});

/**
 * Serve a static file for a single route
 *
 * The options hash may contain:
 *
 * - gzip = false to disable gzip compression/encoding
 *
 * @constructor
 * @param {string} path filesystem path to the static file to serve
 * @param {object} options see above
 * @returns {Object} config suitable for use with Application.verb()
 */
function StaticFile(path, options) {
    var dot = path.lastIndexOf('.'),
        extension = (dot === -1 ? '' : path.substr(dot + 1)),
        mimeType = mimeTypes[extension] || 'binary/octet-stream';

    options = options || {
        gzip: true
    };
    if (typeof options.gzip === 'undefined') {
        options.gzip = true;
    }
    return {
        path         : path,
        semaphore    : new Semaphore(),
        options      : options,
        file         : new File(path),
        lastModified : 0,
        mimeType     : mimeType,
        handler      : function(me, req, res) {
            var file = me.file;
            me.semaphore.lock();
            try {
                var lastModified = file.lastModified();
                if (!me.fileData || lastModified > me.lastModified) {
                    if (!file.exists()) {
                        return 404;
                    }
                    me.fileData = file.toByteArray();
                    me.lastModified = lastModified;
                    delete me.gzipped;
                }
            }
            finally {
                me.semaphore.unlock();
            }
            if (me.options.gzip && req.gzip) {
                me.semaphore.lock();
                try {
                    me.gzipped = me.gzipped || GZIP.compress(me.fileData);
                }
                finally {
                    me.semaphore.unlock();
                }
                res.headers['Content-Encoding'] = 'gzip';
            }
            res.sendBytes(req.gzip ? me.gzipped : me.fileData, me.mimeType, me.lastModified, req.headers['if-modified-since']);
            return 200;
        }
    }
}

decaf.extend(exports, {
    StaticServer : StaticServer,
    StaticFile   : StaticFile
});

