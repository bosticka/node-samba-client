'use strict';

var execFile = require('child_process').execFile;
var util = require('util');
var p = require('path');

/*
 * NT_STATUS_NO_SUCH_FILE - when trying to dir a file in a directory that *does* exist
 * NT_STATUS_OBJECT_NAME_NOT_FOUND - when trying to dir a file in a directory that *does not* exist
 */
var missingFileRegex = /(NT_STATUS_OBJECT_PATH_NOT_FOUND|NT_STATUS_OBJECT_NAME_NOT_FOUND|NT_STATUS_NO_SUCH_FILE)/img;
// Match two leading spaces then non space.  Third character cannot be space or .
var dirListing = /^  [^ .].*/mg

function SambaClient(options) {
    this.address = options.address;
    this.username = options.username || 'guest';
    this.password = options.password;
}

SambaClient.prototype.getFile = function(path, destination, cb) {
    this.runCommand('get', path, destination, cb);
};

SambaClient.prototype.sendFile = function(path, destination, cb) {
    this.runCommand('put', path, destination, cb);
};

SambaClient.prototype.mkdir = function(remotePath, cb) {
    this.execute('mkdir', remotePath, __dirname, cb);
};

SambaClient.prototype.dir = function(remotePath, cb) {
    this.execute('cd ' + remotePath + ';', 'dir', __dirname, cb);
};

SambaClient.prototype.dirList = function(remotePath, cb) {
    this.dir(remotePath, function(err, allOutput) {
        var missingMatch = allOutput.match(missingFileRegex);
        if (missingMatch) {
            return cb(null, []);
        } else if (err) {
            return cb(err, []);
        }
        var matchArray = allOutput.match(dirListing);
        if (!matchArray) {
            return cb(null, []);
        }
        var items = [];
        matchArray.forEach(function(file){
            var fileArray = file.trim().split(/[ ]+/);
            items.push({
                name: fileArray[0],
                size: fileArray[2],
                timestamp: fileArray.slice(3,8).join(" ")
            });
        });
        cb(null, items);
    });
};


SambaClient.prototype.downloadFile = function(localPath, remotePath, filename, cb) {
    var cmd = 'cd ' + remotePath + ';';
    var args = 'get ' + filename;
    this.execute(cmd, args, localPath, function(err, allOutput) {
        var missingMatch = allOutput.match(missingFileRegex);
        if (missingMatch) {
            return cb(null, null);
        } else if (err) {
            return cb(err, null);
        }
        cb(err, filename);
    });
};


SambaClient.prototype.fileExists = function(remotePath, cb) {
    this.dir(remotePath, function(err, allOutput) {

        if (err && allOutput.match(missingFileRegex)) {
            return cb(null, false);
        } else if (err) {
            return cb(err, allOutput);
        }

        cb(null, true);
    });
};

SambaClient.prototype.getSmbClientArgs = function(fullCmd) {
    var args = ['-U', this.username];

    if (!this.password) {
        args.push('-N');
    }

    args.push('-c', fullCmd, this.address);

    if (this.password) {
        args.push(this.password);
    }

    return args;
};

SambaClient.prototype.execute = function(cmd, cmdArgs, workingDir, cb) {
    var fullCmd = util.format('%s %s', cmd, cmdArgs);

    var args = this.getSmbClientArgs(fullCmd);

    var options = {
        cwd: workingDir
    };

    execFile('smbclient', args, options, function(err, stdout, stderr) {
        var allOutput = (stdout + stderr);
        cb(err, allOutput);
    });
};

SambaClient.prototype.runCommand = function(cmd, path, destination, cb) {
    var workingDir = p.dirname(path);
    var fileName = p.basename(path).replace('/', '\\');
    var cmdArgs = util.format('%s %s', fileName, destination);

    this.execute(cmd, cmdArgs, workingDir, cb);
};

module.exports = SambaClient;
