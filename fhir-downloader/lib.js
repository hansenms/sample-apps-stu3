require("colors");

const request = require("request");
const fs      = require("fs");

/**
 * Just a wrapper around "request" to make it return a promise. There is also a
 * delay option
 * @param {Object} options
 * @param {Number} delay [0] Delay in milliseconds
 * @returns {Promise<Object>}
 */
function requestPromise(options, delay = 0) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            request(Object.assign({ strictSSL: false }, options), (error, res) => {
                if (error) {
                    return reject(error);
                }
                if (res.statusCode >= 400) {
                    console.log("Request options", options)
                    let body = res.body
                    if (typeof body == "object") {
                        body = JSON.stringify(body, null, 4);
                    }
                    return reject(new Error(
                        `${res.statusCode}: ${res.statusMessage}\n${body}`
                    ));
                }
                resolve(res);
            });
        }, delay);
    });
}

/**
 * Generates a progress indicator
 * @param {Number} pct The percentage
 * @returns {String}
 */
function generateProgress(pct=0, length=40) {
    pct = parseFloat(pct);
    if (isNaN(pct) || !isFinite(pct)) {
        pct = 0;
    }
    let spinner = "", bold = [], grey = [];
    for (let i = 0; i < length; i++) {
        if (i / length * 100 >= pct) {
            grey.push("▉");
        }
        else {
            bold.push("▉");
        }
    }

    if (bold.length) {
        spinner += bold.join("").bold;
    }

    if (grey.length) {
        spinner += grey.join("").grey;
    }

    if (pct < 10) pct = "  " + pct;
    else if (pct < 100) pct = " " + pct;

    return "\r\033[2K" + `${pct}% `.bold + `${spinner} `;
}

/**
 * Appends @char to the right side of the @str while it's length reaches @len
 * @param {String} str 
 * @param {Number} len 
 * @param {String} char Defaults to " "
 * @returns {String} The padded string
 */
function padRight(str, len, char = " ") {
    str += ""
    for (let i = str.length; i < len; i++) {
        str += char;
    }
    return str;
}

/**
 * Prepends @char to the left side of the @str while it's length reaches @len
 * @param {String} str 
 * @param {Number} len 
 * @param {String} char Defaults to " "
 * @returns {String} The padded string
 */
function padLeft(str, len, char = " ") {
    str += ""
    for (let i = str.length; i < len; i++) {
        str = char + str;
    }
    return str;
}

/**
 * Returns the byte size with units
 * @param {Number} fileSizeInBytes The size to format
 * @param {Boolean} useBits If true, will divide by 1000 instead of 1024
 * @returns {String}
 */
function humanFileSize(fileSizeInBytes=0, useBits) {
    let i = 0;
    const base = useBits ? 1000 : 1024;
    const units = [' ', ' k', ' M', ' G', ' T', 'P', 'E', 'Z', 'Y'].map(u => {
        return useBits ? u + "b" : u + "B";
    });

    while (fileSizeInBytes > base && i < units.length - 1) {
        fileSizeInBytes = fileSizeInBytes / base;
        i++;
    }

    return Math.max(fileSizeInBytes, 0).toFixed(1) + units[i];
}

/**
 * Creates and returns an object that represents a list files for download that
 * is easy to to log aa a table.
 * @param {Object[]} files
 * @returns {Object}
 */
function createTable(files) {

    const TABLE_HEADER = "┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━┳━━━━━━━━━━━━━┳━━━━━━━━━━━━┳━━━━━━━━━━━━━━┓\n" +
                         "┃ File                                    ┃ Chunks ┃ Status      ┃ Downloaded ┃ Uncompressed ┃\n" +
                         "┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╋━━━━━━━━╋━━━━━━━━━━━━━╋━━━━━━━━━━━━╋━━━━━━━━━━━━━━┫";
    const TABLE_FOOTER = "┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┻━━━━━━━━┻━━━━━━━━━━━━━┻━━━━━━━━━━━━┻━━━━━━━━━━━━━━┛";

    return {
 
        index : 0,

        _logged: 0,

        files: files.map(f => ({
            url      : f,
            name     : f.split("/").pop(),
            status   : "Pending",
            chunks   : 0,
            bytes    : 0,
            rawBytes : 0
        })),

        next() {
            return this.files[this.index++];
        },

        log() {

            // The string to write to stdout
            let str = "";
    
            // If we have logged some lines already, go back to rewrite them
            if (this._logged) {
                str += "\033[" + (this._logged + 4) + "A";
            }
    
            // add the header
            str += TABLE_HEADER + "\n";
    
            // Compute reasonable slice of up to 20 files because the terminal can't
            // properly handle big tables exceeding the screen size.
            let start = Math.max(this.index - 10, 0),
                end   = Math.min(start + 20, this.files.length);
            if (end - start < 20) {
                start = Math.max(end - 20, 0);
            }
            let files = this.files.slice(start, end).filter(Boolean);
    
            // Convert those files to table rows
            str += files.map(f => {
                let line = (
                    padRight(`┃ ${f.name}`  , 42) +
                    padRight(`┃ ${f.chunks}`, 9) +
                    padRight(`┃ ${f.status}`, 14) +
                    padRight(`┃ ${f.rawBytes ? padLeft(humanFileSize(f.rawBytes), 9) : "     -"}` , 13) + 
                    padRight(`┃ ${f.bytes ? padLeft(humanFileSize(f.bytes), 10) : "      -"}` , 15) + "┃\n"
                );
                if (f.status == "Downloading") {
                    line = line.bgBlue;
                }
                return line;
            }).join("");
    
            // Add one extra row to display how many files are remaining
            str += (
                "┃ " +
                padRight(`${
                    end < this.files.length ?
                        `${this.files.length - end} more` :
                        ""
                    }`  , 40).green +
                padRight(`┃ `, 9) +
                padRight(`┃ `, 14) +
                padRight(`┃ `, 13) +
                padRight(`┃ `, 15) + "┃\n"
            );
    
            // "remember" how much lines to delete next time
            this._logged = files.length + 1;
    
            // add the footer
            str += TABLE_FOOTER;
    
            // write it!
            console.log(str);
        }
    }
}

function requireIfExists(path) {
    if (fs.existsSync(path)) {
        return require(path);
    }
    return null;
}

function formatDuration(ms) {
    let out = [];
    let meta = [
        { n: 1000 * 60 * 60 * 24 * 7  , label: "week" },
        { n: 1000 * 60 * 60 * 24  , label: "day" },
        { n: 1000 * 60 * 60  , label: "hour" },
        { n: 1000 * 60  , label: "minute" },
        { n: 1000  , label: "second" }
    ];

    meta.reduce((prev, cur, i, all) => {
        let chunk = Math.floor(prev / cur.n); // console.log(chunk)
        if (chunk) {
            out.push(`${chunk} ${cur.label}${chunk > 1 ? "s" : ""}`);
            return prev - chunk * cur.n
        }
        return prev
    }, ms);

    if (!out.length) {
        out.push(`0 ${meta.pop().label}s`);
    }

    if (out.length > 1) {
        let last = out.pop();
        out[out.length - 1] += " and " + last;
    }

    return out.join(", ")
}

/**
 * JWKS is just an array of keys. We need to find the last private key that
 * also has a corresponding public key. The pair is recognized by having the
 * same "kid" property.
 * @param {Array} keys JWKS.keys 
 */
function findKeyPair(keys) {
    let out = null;

    keys.forEach(key => {
        if (!key.kid) return;
        if (!Array.isArray(key.key_ops)) return;
        if (key.key_ops.indexOf("sign") == -1) return;

        publicKey = keys.find(k => {
            return (
                k.kid === key.kid &&
                Array.isArray(k.key_ops) &&
                k.key_ops.indexOf("verify") > -1
            );
        })

        if (publicKey) {
            out = { privateKey: key, publicKey };
        }
    });

    return out;
}

module.exports = {
    requestPromise,
    generateProgress,
    padRight,
    createTable,
    requireIfExists,
    formatDuration,
    findKeyPair
};